import type { Surreal } from 'surrealdb';
import { CerialQueryPromise } from '../query/cerial-query-promise';
import { compileRawStatement, executeRawStatement } from '../query/raw-statement';
import type { SqlFragment } from '../query/compile';
import { wrapDatabaseError } from './model/wrap-database-error';

/**
 * Build the `$raw` of a generated client. The result is unmapped, because a client-level statement
 * belongs to no model. `getDb` migrates and resolves the connection on first await.
 */
export function createClientRawStatement<T = unknown>(
  fragment: SqlFragment<T>,
  getDb: () => Promise<Surreal>,
): CerialQueryPromise<T[]> {
  const compiled = compileRawStatement(fragment);

  return new CerialQueryPromise<T[]>(
    async () => {
      const db = await getDb();
      try {
        return await executeRawStatement<T>(db, compiled);
      } catch (error) {
        throw wrapDatabaseError(error, undefined, '$raw');
      }
    },
    compiled,
    undefined,
    'raw',
    undefined,
    [],
  );
}
