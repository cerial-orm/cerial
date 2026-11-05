/**
 * Query executor - executes queries via SurrealDB SDK
 */

import { BoundQuery, isRetryableConflict, type Surreal, SurrealTransaction } from 'surrealdb';
import type { ModelMetadata, ModelRegistry, SelectClause, TransactionOptions } from '../types';
import { CerialTransaction } from '../client/cerial-transaction';
import { beginTransaction } from '../client/transaction-begin';
import { runInTransactionScope } from '../client/transaction-context';
import { CerialQueryPromise, type QueryResultType } from './cerial-query-promise';
import { CerialValidationError } from '../errors';
import type { CompiledQuery, TargetCheckMap } from './compile/types';
import { mapGroupByRows, mapRawResult, mapResult, mapSingleResult } from './mappers';
import { executeRawStatement } from './raw-statement';

/** Query execution options */
export interface ExecuteOptions {
  /** Whether to return raw results without mapping */
  raw?: boolean;
  /** Maximum number of retries for transaction conflicts (default: 0) */
  maxRetries?: number;
}

/** A single item in a client transaction batch */
/**
 * A nested write's statements by position, so nothing searches its text for structure it already knows:
 * `body` is everything between its BEGIN and COMMIT (or the whole text inside an outer transaction), `ret`
 * the final RETURN statement. Without a guard `ret` sits after the COMMIT, and with `select` or `include`
 * it holds caller-chosen keys, which may spell `COMMIT TRANSACTION` or `RETURN`.
 */
export interface StatementParts {
  body: string;
  ret?: string;
}

/** A compiled query that carries its statements by position */
export type PartsCompiledQuery = CompiledQuery & { parts?: StatementParts };

/** The text with its own BEGIN/COMMIT wrapper removed: by position when the builder gave parts, else by text */
export function unwrapQuery(query: PartsCompiledQuery): string {
  if (!query.parts) return stripTransactionWrapper(query.text);

  return [query.parts.body, query.parts.ret].filter(Boolean).join('\n');
}

export interface TransactionItem {
  compiledQuery: CompiledQuery;
  metadata?: ModelMetadata;
  resultType: QueryResultType;
  registry?: ModelRegistry;
  select?: SelectClause;
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

/**
 * Whether an error is a transaction conflict that can be retried. The SDK reads the structured
 * `TransactionConflict` detail the server sends (SurrealDB 3.1.0 and later), never the message.
 */
export const isTransactionConflict: (error: unknown) => boolean = isRetryableConflict;

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a BoundQuery from compiled query */
function createBoundQuery(query: CompiledQuery): BoundQuery {
  return new BoundQuery(query.text, query.vars);
}

/**
 * Throws the typed error for a guarded nested write whose guard found a missing target. The guard's
 * RETURN holds the position of the first missing record, or NONE when all exist. It is read before any
 * result walk: on a miss the write's block yields NONE, which a walk would pass off as an empty result.
 * A value that is not a mapped position is not this check's to explain, so it is thrown as a plain error
 * for `wrapDatabaseError` to pass through; nothing here reads an error's message.
 */
function assertTargetsPresent(
  results: readonly unknown[] | undefined,
  check: TargetCheckMap | undefined,
  stripped: boolean,
): void {
  if (!check) return;

  // A stripped BEGIN takes its result with it, so the guard's position moves up by one
  const at = check.at - (stripped ? 1 : 0);
  const value = results?.[at];
  if (value === null || value === undefined) return;

  const entry = typeof value === 'number' ? check.entries[value] : undefined;
  if (!entry) throw new Error(`Nested target check returned an unmapped value at statement ${at}`);

  throw new CerialValidationError(
    `Field "${entry.field}" on model "${check.model}": cannot ${entry.verb} ${entry.targetModel} record "${entry.id}" because it does not exist`,
    { model: check.model, field: entry.field, operation: check.operation },
  );
}

/** Execute a compiled query */
export async function executeQuery<T = unknown>(
  db: Surreal,
  query: CompiledQuery,
  _options: ExecuteOptions = {},
): Promise<T[]> {
  // Strip transaction wrappers only when running inside an SDK transaction
  // Regular queries need their BEGIN/COMMIT for atomicity (cascade delete, restrict checks)
  let queryText = query.text;
  if (db instanceof SurrealTransaction && isMultiStatementQuery(queryText)) {
    queryText = unwrapQuery(query);
  }
  const effectiveQuery = queryText !== query.text ? { text: queryText, vars: query.vars } : query;
  const boundQuery = createBoundQuery(effectiveQuery);
  const results = await db.query<[T[]]>(boundQuery).collect();
  assertTargetsPresent(results, query.targetCheck, effectiveQuery !== query);

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
  const maxRetries = options.maxRetries ?? 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let queryText = query.text;
      if (db instanceof SurrealTransaction && isMultiStatementQuery(queryText)) {
        queryText = unwrapQuery(query);
      }
      const effectiveQuery = queryText !== query.text ? { text: queryText, vars: query.vars } : query;
      const boundQuery = createBoundQuery(effectiveQuery);
      const results = await db.query<T[]>(boundQuery).collect();
      assertTargetsPresent(results, query.targetCheck, effectiveQuery !== query);

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
  const vars: Record<string, unknown> = {};
  for (const q of queries) {
    Object.assign(vars, q.vars);
  }

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
 * Strip BEGIN TRANSACTION and COMMIT TRANSACTION wrappers from a query text.
 * Used to flatten inner transactions when building a client-level transaction.
 *
 * The text is never parsed for quotes or comments: the BEGIN is read only at the very start, and the COMMIT
 * is removed only after one was found, as the last in the text. This is for developer text and builders that
 * give no `parts`. With `select` or `include`, a nested write puts its projection after the COMMIT, so those
 * builders return `parts` and are unwrapped by position instead.
 */
export function stripTransactionWrapper(text: string): string {
  // Remove BEGIN TRANSACTION from start
  let result = text.replace(/^\s*BEGIN\s+TRANSACTION\s*;?\s*/i, '');
  // No wrapper was opened, so there is no COMMIT of ours to remove; one in the text is a caller's key
  if (result === text) return text.trim();

  // Remove the last COMMIT TRANSACTION, but ensure a semicolon + newline boundary remains
  // so that surrounding statements don't merge together
  const commits = [...result.matchAll(/\s*;?\s*COMMIT\s+TRANSACTION\s*;?\s*/gi)];
  const commit = commits.at(-1);
  if (commit) result = `${result.slice(0, commit.index)};\n${result.slice(commit.index + commit[0].length)}`;

  return result.trim();
}

/**
 * Check if a query text contains multiple statements (LET, BEGIN, etc.)
 * indicating it's a multi-statement query (e.g., from nested create or cascade delete).
 * A LET or BEGIN counts only where a statement starts (text start or after a `;`), so a quoted key
 * that spells one does not turn a single statement into a multi-statement one.
 */
export function isMultiStatementQuery(text: string): boolean {
  return /(?:^|;)\s*(?:LET\s+\$|BEGIN\s+TRANSACTION\b)/i.test(text);
}

function mapTransactionResult(
  rawResult: unknown,
  resultType: QueryResultType,
  metadata?: ModelMetadata,
  select?: SelectClause,
): unknown {
  // Only a client-level raw statement has no model, and nothing here can map its rows
  if (!metadata) return rawResult;

  switch (resultType) {
    case 'single': {
      if (rawResult === null || rawResult === undefined) return null;
      if (Array.isArray(rawResult)) {
        if (!rawResult.length) return null;

        return mapSingleResult(rawResult[0], metadata, select);
      }

      return mapSingleResult(rawResult, metadata, select);
    }
    case 'array': {
      if (!rawResult || !Array.isArray(rawResult)) return [];

      return mapResult(rawResult, metadata, select);
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
    case 'raw':
      return mapRawResult(rawResult as unknown[], metadata);
    // metadata is the row shape groupByRowShape described, not the model
    case 'groupBy':
      return mapGroupByRows(rawResult, metadata);
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

async function executeItemInTransaction(db: Surreal, item: TransactionItem, query: CompiledQuery): Promise<unknown> {
  // A raw statement returns the last statement's result, which extractRawResult cannot: it skips trailing NONE
  if (item.resultType === 'raw') {
    const text = isMultiStatementQuery(query.text) ? stripTransactionWrapper(query.text) : query.text;
    const rows = await executeRawStatement(db, { text, vars: query.vars });

    return mapTransactionResult(rows, item.resultType, item.metadata, item.select);
  }

  if (isMultiStatementQuery(query.text)) {
    return executeMultiStatementInTransaction(db, query, item);
  }

  const boundQuery = new BoundQuery(query.text, query.vars);
  const results = await db.query(boundQuery).collect();
  const rawResult = extractRawResult(results);

  return mapTransactionResult(rawResult, item.resultType, item.metadata, item.select);
}

async function executeMultiStatementInTransaction(
  db: Surreal,
  query: CompiledQuery,
  item: TransactionItem,
): Promise<unknown> {
  const innerText = unwrapQuery(query);
  const boundQuery = new BoundQuery(innerText, query.vars);
  const results = await db.query(boundQuery).collect();
  assertTargetsPresent(results, query.targetCheck, true);
  const rawResult = extractRawResult(results);

  return mapTransactionResult(rawResult, item.resultType, item.metadata, item.select);
}

/**
 * Execute transaction items using SDK native transactions.
 *
 * Uses `db.beginTransaction()` to create a SurrealTransaction, then executes
 * each item sequentially via `txn.query()`. Multi-statement queries (nested
 * create, cascade delete) are sent as a single query string to preserve
 * LET variable scope across statements.
 *
 * Supports function items that receive previous results and can return a CerialQueryPromise or a
 * plain value. Each runs, and is awaited, inside a transaction scope, so a query made through the
 * client in a sync, async or Promise.all item runs in the transaction.
 *
 * Retries on transaction conflict if options.retries > 0 (default: 0 — no retry).
 * Each retry begins a FRESH transaction.
 */
export async function executeClientTransaction(
  db: Surreal,
  items: TransactionExecutionItem[],
  options: TransactionOptions = {},
  owner: object = db,
): Promise<unknown[]> {
  if (!items.length) return [];

  const maxRetries = options.retries ?? 0;
  const backoffFn = options.backoff ?? ((attempt: number) => 2 ** attempt * 10 + Math.random() * 10);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const txn = await beginTransaction(db, options);
      // SurrealTransaction extends SurrealQueryable — cast to Surreal for query() access
      const txnDb = txn as unknown as Surreal;
      // Routing and the drain only use the handle's state and raw transaction, never its registry
      const scoped = new CerialTransaction(txn, {});

      try {
        const results: unknown[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i]!;

          if (isTransactionItem(item)) {
            const result = await executeItemInTransaction(txnDb, item, item.compiledQuery);
            results.push(result);
          } else if (typeof item === 'function') {
            // The item runs and is awaited inside the scope: a query awaited outside it is not routed.
            const result = await runInTransactionScope({ owner, txn: scoped }, async () => {
              // Not awaited first: a CerialQueryPromise is lazy, and awaiting it would run it on the default connection
              const fnResult = item(results);

              if (!CerialQueryPromise.isCerialQueryPromise(fnResult)) return fnResult;

              const txItem: TransactionItem = {
                compiledQuery: fnResult.compiledQuery,
                metadata: fnResult.metadata,
                resultType: fnResult.resultType,
                registry: fnResult.registry,
                select: fnResult.select,
              };

              return executeItemInTransaction(txnDb, txItem, txItem.compiledQuery);
            });
            results.push(result);
          }
        }

        await scoped._close('commit');

        return results;
      } catch (innerError) {
        try {
          // Waits for queries a failed item left running, so cancel never overlaps them
          await scoped._close('cancel');
        } catch {
          // Ignore cancel errors — transaction may already be aborted by SurrealDB
        }
        throw innerError;
      }
    } catch (error) {
      lastError = error;

      if (isTransactionConflict(error) && attempt < maxRetries) {
        const delay = backoffFn(attempt);
        await sleep(delay);
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
