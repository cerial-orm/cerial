/**
 * Query executor - executes queries via SurrealDB SDK
 */

import { type Surreal, BoundQuery } from 'surrealdb';
import type { CompiledQuery } from './compile/types';

/** Query execution options */
export interface ExecuteOptions {
  /** Whether to return raw results without mapping */
  raw?: boolean;
  /** Maximum number of retries for transaction conflicts (default: 3) */
  maxRetries?: number;
}

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
        const delay = Math.pow(2, attempt) * 10 + Math.random() * 10;
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
