/**
 * Query executor - executes queries via SurrealDB SDK
 */

import { type Surreal, BoundQuery } from 'surrealdb';
import type { CompiledQuery } from './compile/types';

/** Query execution options */
export interface ExecuteOptions {
  /** Whether to return raw results without mapping */
  raw?: boolean;
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

  // Return first result set
  if (results && results.length > 0 && Array.isArray(results[0])) {
    return results[0];
  }

  return [];
}

/** Execute a query and return single result */
export async function executeQuerySingle<T = unknown>(
  db: Surreal,
  query: CompiledQuery,
  options: ExecuteOptions = {},
): Promise<T | null> {
  const results = await executeQuery<T>(db, query, options);
  return results[0] ?? null;
}

/** Execute multiple queries in a transaction */
export async function executeTransaction<T = unknown>(
  db: Surreal,
  queries: CompiledQuery[],
): Promise<T[][]> {
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
