/**
 * Query executor - executes queries via SurrealDB SDK
 */

import { BoundQuery, type Surreal } from 'surrealdb';
import type { ModelMetadata, ModelRegistry } from '../types';
import { CerialQueryPromise, type QueryResultType } from './cerial-query-promise';
import type { CompiledQuery } from './compile/types';
import { mapResult, mapSingleResult } from './mappers';

/** Query execution options */
export interface ExecuteOptions {
  /** Whether to return raw results without mapping */
  raw?: boolean;
  /** Maximum number of retries for transaction conflicts (default: 3) */
  maxRetries?: number;
}

/** A single item in a client transaction batch */
export interface TransactionItem {
  compiledQuery: CompiledQuery;
  metadata: ModelMetadata;
  resultType: QueryResultType;
  registry?: ModelRegistry;
}

/**
 * An item in the SDK native transaction execution.
 * Can be a pre-compiled TransactionItem or a function that receives
 * previous results and returns a value, CerialQueryPromise, or Promise.
 */
export type TransactionExecutionItem =
  | TransactionItem
  | ((
      prevResults: unknown[],
    ) => unknown | CerialQueryPromise<unknown> | Promise<unknown> | Promise<CerialQueryPromise<unknown>>);

/** Check if an error is a transaction conflict that can be retried */
function isTransactionConflict(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    return message.includes('transaction conflict') || message.includes('write conflict');
  }

  return false;
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a BoundQuery from compiled query */
function createBoundQuery(query: CompiledQuery): BoundQuery {
  return new BoundQuery(query.text, query.vars);
}

/** Execute a compiled query */
export async function executeQuery<T = unknown>(
  db: Surreal,
  query: CompiledQuery,
  _options: ExecuteOptions = {},
): Promise<T[]> {
  const boundQuery = createBoundQuery(query);
  const results = await db.query<[T[]]>(boundQuery).collect();

  // For simple queries, return first result set
  // For transactions with RETURN at the end, walk backwards to find the result array
  if (results && results.length > 0) {
    // Check if first result is an array (simple query)
    if (Array.isArray(results[0])) {
      return results[0];
    }

    // For transactions, walk backwards to find the result array
    for (let i = results.length - 1; i >= 0; i--) {
      const result = results[i];
      if (result !== null && result !== undefined && Array.isArray(result)) {
        return result;
      }
    }
  }

  return [];
}

/** Execute a query and return single result with retry for transaction conflicts */
export async function executeQuerySingle<T = unknown>(
  db: Surreal,
  query: CompiledQuery,
  options: ExecuteOptions = {},
): Promise<T | null> {
  const maxRetries = options.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const boundQuery = createBoundQuery(query);
      const results = await db.query<T[]>(boundQuery).collect();

      // For transactions with RETURN at the end, get the last non-null result
      // Walk backwards to find the first non-null/non-empty result
      if (results && results.length > 0) {
        for (let i = results.length - 1; i >= 0; i--) {
          const result = results[i];
          if (result !== null && result !== undefined) {
            // If it's an array, return first element; otherwise return directly
            if (Array.isArray(result)) {
              if (result.length > 0) return result[0] as T;
            } else {
              return result as T;
            }
          }
        }
      }

      return null;
    } catch (error) {
      lastError = error;

      // Only retry on transaction conflicts
      if (isTransactionConflict(error) && attempt < maxRetries) {
        // Exponential backoff with jitter: 10ms, 20ms, 40ms, etc.
        const delay = 2 ** attempt * 10 + Math.random() * 10;
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/** Execute multiple queries in a transaction */
export async function executeTransaction<T = unknown>(db: Surreal, queries: CompiledQuery[]): Promise<T[][]> {
  // Combine queries with BEGIN/COMMIT
  const combined = queries.map((q) => q.text).join('; ');
  const vars = queries.reduce((acc, q) => ({ ...acc, ...q.vars }), {});

  const transactionQuery = `BEGIN TRANSACTION; ${combined}; COMMIT TRANSACTION;`;
  const boundQuery = new BoundQuery(transactionQuery, vars);

  const results = await db.query<T[][]>(boundQuery).collect();

  return results ?? [];
}

/** Execute a raw query string */
export async function executeRaw<T = unknown>(
  db: Surreal,
  query: string,
  vars?: Record<string, unknown>,
): Promise<T[]> {
  const boundQuery = new BoundQuery(query, vars);
  const results = await db.query<[T[]]>(boundQuery).collect();

  if (results && results.length > 0 && Array.isArray(results[0])) {
    return results[0];
  }

  return [];
}

// =============================================================================
// Client Transaction Assembly
// =============================================================================

/**
 * Prefix all variable names in a compiled query to avoid collisions
 * when combining multiple queries in a transaction.
 *
 * Handles both:
 * - SDK-bound variables ($varName in text + vars object keys)
 * - LET-assigned variables (LET $varName in query text only)
 */
export function prefixQueryVars(query: CompiledQuery, prefix: string): CompiledQuery {
  let text = query.text;
  const vars: Record<string, unknown> = {};

  // Prefix all SDK-bound variable keys
  for (const [key, value] of Object.entries(query.vars)) {
    vars[`${prefix}${key}`] = value;
  }

  // Build a regex that matches all $varName references in the text
  // We need to replace both bound vars and LET-assigned vars
  const allVarNames = new Set<string>();

  // Collect bound var names (from vars object)
  for (const key of Object.keys(query.vars)) {
    allVarNames.add(key);
  }

  // Collect LET-assigned var names from the query text
  const letRegex = /LET\s+\$(\w+)/g;
  let match;
  while (true) {
    match = letRegex.exec(text);
    if (match === null) break;
    allVarNames.add(match[1]!);
  }

  // Sort by length (longest first) to prevent partial replacements
  const sortedNames = [...allVarNames].sort((a, b) => b.length - a.length);

  // Replace all occurrences of $varName with $prefix_varName
  for (const name of sortedNames) {
    // Use word boundary to avoid replacing $resultId when processing $result
    const varRegex = new RegExp(`\\$${name}(?=\\b|[^\\w])`, 'g');
    text = text.replace(varRegex, `$${prefix}${name}`);
  }

  return { text, vars };
}

/**
 * Strip BEGIN TRANSACTION and COMMIT TRANSACTION wrappers from a query text.
 * Used to flatten inner transactions when building a client-level transaction.
 */
export function stripTransactionWrapper(text: string): string {
  // Remove BEGIN TRANSACTION from start
  let result = text.replace(/^\s*BEGIN\s+TRANSACTION\s*;?\s*/i, '');

  // Remove COMMIT TRANSACTION, but ensure a semicolon + newline boundary remains
  // so that surrounding statements don't merge together
  result = result.replace(/\s*;?\s*COMMIT\s+TRANSACTION\s*;?\s*/i, ';\n');

  return result.trim();
}

/**
 * Check if a query text contains multiple statements (LET, BEGIN, etc.)
 * indicating it's a multi-statement query (e.g., from nested create or cascade delete).
 */
export function isMultiStatementQuery(text: string): boolean {
  return /\bLET\s+\$/i.test(text) || /\bBEGIN\s+TRANSACTION\b/i.test(text);
}

/**
 * Extract the result variable from a multi-statement query's RETURN clause.
 * E.g., "RETURN $result;" → "$result"
 * E.g., "RETURN SELECT * FROM ONLY $resultId;" → needs special handling
 */
function extractReturnExpression(text: string): string | null {
  // Match the LAST top-level RETURN statement (after a newline or semicolon, at end of text)
  // This avoids matching RETURN inside subqueries (e.g., "UPDATE ... RETURN *")
  const returnMatch = text.match(/(?:^|[;\n])\s*RETURN\s+(.+?)\s*;?\s*$/i);
  if (!returnMatch) return null;

  return returnMatch[1]!.trim();
}

/**
 * For multi-statement queries, extract the RETURN expression and strip it.
 * Returns the modified text (without RETURN) and the expression that produces the result.
 */
function extractAndStripReturn(text: string): { text: string; returnExpr: string | null } {
  const returnExpr = extractReturnExpression(text);
  if (!returnExpr) return { text, returnExpr: null };

  // Strip the last top-level RETURN statement from the end
  const stripped = text.replace(/(?:^|[;\n])\s*RETURN\s+.+?\s*;?\s*$/i, '');

  return { text: stripped.trim(), returnExpr };
}

function mapTransactionResult(rawResult: unknown, resultType: QueryResultType, metadata: ModelMetadata): unknown {
  switch (resultType) {
    case 'single': {
      if (rawResult === null || rawResult === undefined) return null;
      if (Array.isArray(rawResult)) {
        if (!rawResult.length) return null;

        return mapSingleResult(rawResult[0], metadata);
      }

      return mapSingleResult(rawResult, metadata);
    }
    case 'array': {
      if (!rawResult || !Array.isArray(rawResult)) return [];

      return mapResult(rawResult, metadata);
    }
    case 'count': {
      if (rawResult === null || rawResult === undefined) return 0;
      if (typeof rawResult === 'number') return rawResult;
      if (Array.isArray(rawResult)) {
        const first = rawResult[0];
        if (first && typeof first === 'object' && 'count' in first) return (first as { count: number }).count;

        return 0;
      }
      if (typeof rawResult === 'object' && 'count' in rawResult) return (rawResult as { count: number }).count;

      return 0;
    }
    case 'boolean': {
      if (rawResult === null || rawResult === undefined) return false;
      if (typeof rawResult === 'boolean') return rawResult;
      if (typeof rawResult === 'number') return rawResult > 0;
      if (Array.isArray(rawResult)) {
        const first = rawResult[0];
        if (first && typeof first === 'object' && 'count' in first) return (first as { count: number }).count > 0;

        return rawResult.length > 0;
      }
      if (typeof rawResult === 'object' && 'count' in rawResult) return (rawResult as { count: number }).count > 0;

      return false;
    }
    case 'number': {
      if (rawResult === null || rawResult === undefined) return 0;
      if (typeof rawResult === 'number') return rawResult;
      if (Array.isArray(rawResult)) return rawResult.length;

      return 0;
    }
    case 'void': {
      return true;
    }
    default:
      return rawResult;
  }
}

// =============================================================================
// SDK Native Transaction Helpers
// =============================================================================

function isTransactionItem(item: TransactionExecutionItem): item is TransactionItem {
  return typeof item === 'object' && item !== null && 'compiledQuery' in item;
}

function extractRawResult(results: unknown): unknown {
  if (!results || !Array.isArray(results) || !results.length) return null;

  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i] !== null && results[i] !== undefined) return results[i];
  }

  return null;
}

async function executeItemInTransaction(
  db: Surreal,
  item: TransactionItem,
  prefixedQuery: CompiledQuery,
): Promise<unknown> {
  if (isMultiStatementQuery(prefixedQuery.text)) {
    return executeMultiStatementInTransaction(db, prefixedQuery, item);
  }

  const boundQuery = new BoundQuery(prefixedQuery.text, prefixedQuery.vars);
  const results = await db.query(boundQuery).collect();
  const rawResult = extractRawResult(results);

  return mapTransactionResult(rawResult, item.resultType, item.metadata);
}

async function executeMultiStatementInTransaction(
  db: Surreal,
  query: CompiledQuery,
  item: TransactionItem,
): Promise<unknown> {
  const innerText = stripTransactionWrapper(query.text);
  const { text: bodyText, returnExpr } = extractAndStripReturn(innerText);
  const statements = splitStatements(bodyText);

  let lastResult: unknown = null;
  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (!trimmed) continue;

    const boundQuery = new BoundQuery(trimmed, query.vars);
    const results = await db.query(boundQuery).collect();
    lastResult = extractRawResult(results);
  }

  if (returnExpr) {
    const boundQuery = new BoundQuery(`RETURN ${returnExpr}`, query.vars);
    const results = await db.query(boundQuery).collect();
    lastResult = extractRawResult(results);
  }

  return mapTransactionResult(lastResult, item.resultType, item.metadata);
}

/**
 * Execute transaction items using SDK native transactions.
 *
 * Uses `db.beginTransaction()` to create a SurrealTransaction, then executes
 * each item sequentially via `txn.query()`. Multi-statement queries (nested
 * create, cascade delete) are split and executed as individual statements.
 *
 * Supports function items that receive previous results and can return
 * a CerialQueryPromise (executed in the transaction) or a plain value.
 *
 * Retries on transaction conflict with exponential backoff (max 3 retries).
 * Each retry begins a FRESH transaction.
 */
export async function executeClientTransaction(db: Surreal, items: TransactionExecutionItem[]): Promise<unknown[]> {
  if (!items.length) return [];

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const txn = await db.beginTransaction();
      // SurrealTransaction extends SurrealQueryable — cast to Surreal for query() access
      const txnDb = txn as unknown as Surreal;

      try {
        const results: unknown[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;

          if (isTransactionItem(item)) {
            const prefix = `tx${i}_`;
            const prefixed = prefixQueryVars(item.compiledQuery, prefix);
            const result = await executeItemInTransaction(txnDb, item, prefixed);
            results.push(result);
          } else if (typeof item === 'function') {
            const fnResult = await item(results);

            if (CerialQueryPromise.isCerialQueryPromise(fnResult)) {
              const txItem: TransactionItem = {
                compiledQuery: fnResult.compiledQuery,
                metadata: fnResult.metadata,
                resultType: fnResult.resultType,
                registry: fnResult.registry,
              };
              const prefix = `tx${i}_`;
              const prefixed = prefixQueryVars(txItem.compiledQuery, prefix);
              const result = await executeItemInTransaction(txnDb, txItem, prefixed);
              results.push(result);
            } else {
              results.push(fnResult);
            }
          }
        }

        await txn.commit();

        return results;
      } catch (innerError) {
        try {
          await txn.cancel();
        } catch {
          // Ignore cancel errors — transaction may already be aborted by SurrealDB
        }
        throw innerError;
      }
    } catch (error) {
      lastError = error;

      if (isTransactionConflict(error) && attempt < maxRetries) {
        const delay = 2 ** attempt * 10 + Math.random() * 10;
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

// =============================================================================
// Legacy Text-Based Transaction Assembly (Deprecated)
// =============================================================================

/**
 * @deprecated Use `executeClientTransaction()` which uses SDK native transactions.
 * This text-based assembly approach is preserved for backward compatibility only.
 *
 * Assembles all queries into a single text-based transaction:
 *   BEGIN TRANSACTION; LET $tx_result_0 = (...); COMMIT TRANSACTION; RETURN [...];
 */
export async function executeClientTransactionLegacy(db: Surreal, items: TransactionItem[]): Promise<unknown[]> {
  if (!items.length) return [];

  const statements: string[] = [];
  const allVars: Record<string, unknown> = {};
  const resultVarNames: string[] = [];
  const maxRetries = 3;
  let lastError: unknown;

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const prefix = `tx${i}_`;
    const resultVar = `$tx_result_${i}`;

    const prefixed = prefixQueryVars(item.compiledQuery, prefix);
    Object.assign(allVars, prefixed.vars);

    if (isMultiStatementQuery(prefixed.text)) {
      let innerText = stripTransactionWrapper(prefixed.text);
      const { text: bodyText, returnExpr } = extractAndStripReturn(innerText);
      innerText = bodyText;
      const innerStatements = splitStatements(innerText);

      if (returnExpr) {
        for (const stmt of innerStatements) {
          const trimmed = stmt.trim();
          if (trimmed) statements.push(`${trimmed};`);
        }

        if (returnExpr.startsWith('$') && /^\$\w+$/.test(returnExpr)) {
          resultVarNames.push(returnExpr);
        } else if (/^SELECT\s+\*\s+FROM\s+ONLY\s+(\$\w+)/i.test(returnExpr)) {
          const idVarMatch = returnExpr.match(/\$(\w+)$/);
          if (idVarMatch) {
            const idVarName = idVarMatch[1]!;
            const resultVarCandidate = idVarName.replace(/Id$/, '');
            const hasResultVar = innerStatements.some((s) =>
              new RegExp(`LET\\s+\\$${resultVarCandidate}\\b`, 'i').test(s),
            );
            if (hasResultVar) {
              resultVarNames.push(`$${resultVarCandidate}`);
            } else {
              statements.push(`LET ${resultVar} = (${returnExpr});`);
              resultVarNames.push(resultVar);
            }
          } else {
            statements.push(`LET ${resultVar} = (${returnExpr});`);
            resultVarNames.push(resultVar);
          }
        } else {
          statements.push(`LET ${resultVar} = (${returnExpr});`);
          resultVarNames.push(resultVar);
        }
      } else {
        const lastIdx = innerStatements.length - 1;
        for (let j = 0; j <= lastIdx; j++) {
          const trimmed = innerStatements[j]!.trim();
          if (!trimmed) continue;

          if (j === lastIdx && !trimmed.toUpperCase().startsWith('LET ') && !trimmed.toUpperCase().startsWith('IF ')) {
            statements.push(`LET ${resultVar} = (${trimmed});`);
            resultVarNames.push(resultVar);
          } else {
            statements.push(`${trimmed};`);
          }
        }

        if (!resultVarNames.includes(resultVar)) {
          const allLets = innerText.match(/LET\s+(\$\w+)/gi);
          if (allLets?.length) {
            const lastLet = allLets[allLets.length - 1]!.match(/\$\w+/);
            if (lastLet) {
              resultVarNames.push(lastLet[0]!);
            } else {
              resultVarNames.push('NONE');
            }
          } else {
            resultVarNames.push('NONE');
          }
        }
      }
    } else {
      const cleanText = prefixed.text.replace(/\s*;\s*$/, '').trim();
      statements.push(`LET ${resultVar} = (${cleanText});`);
      resultVarNames.push(resultVar);
    }
  }

  const returnArray = resultVarNames.map((v) => (v === 'NONE' ? 'NONE' : v)).join(', ');
  const transactionText = ['BEGIN TRANSACTION;', ...statements, 'COMMIT TRANSACTION;', `RETURN [${returnArray}];`].join(
    '\n',
  );

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const boundQuery = new BoundQuery(transactionText, allVars);
      const results = await db.query<unknown[]>(boundQuery).collect();

      let resultArray: unknown[] | null = null;
      if (results && results.length > 0) {
        for (let i = results.length - 1; i >= 0; i--) {
          const r = results[i];
          if (r !== null && r !== undefined && Array.isArray(r)) {
            resultArray = r;
            break;
          }
        }
      }

      if (!resultArray) {
        return items.map(() => null);
      }

      const mapped: unknown[] = [];
      for (let i = 0; i < items.length; i++) {
        const rawResult = i < resultArray.length ? resultArray[i] : null;
        const txItem = items[i]!;
        mapped.push(mapTransactionResult(rawResult, txItem.resultType, txItem.metadata));
      }

      return mapped;
    } catch (error) {
      lastError = error;

      if (isTransactionConflict(error) && attempt < maxRetries) {
        const delay = 2 ** attempt * 10 + Math.random() * 10;
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Split a multi-statement query text into individual statements.
 * Handles semicolons inside parentheses (doesn't split on them).
 */
function splitStatements(text: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ';' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  return statements;
}
