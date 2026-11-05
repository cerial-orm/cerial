import type { Surreal } from 'surrealdb';
import { CerialQueryPromise } from '../query/cerial-query-promise';
import { compileRawStatement, executeRawStatement } from '../query/raw-statement';
import type { SqlFragment } from '../query/compile';
import { wrapDatabaseError } from './model/wrap-database-error';
import { runRouted } from './transaction-context';

/**
 * Build the `$raw` of a generated client. The result is unmapped, because a client-level statement
 * belongs to no model. `getDb` migrates and resolves the connection on first await.
 */
export function createClientRawStatement<T = unknown>(
  fragment: SqlFragment<T>,
  getDb: () => Promise<Surreal>,
  includeStatement = false,
  getOwner: () => object | undefined = () => undefined,
): CerialQueryPromise<T[]> {
  const compiled = compileRawStatement(fragment);

  return new CerialQueryPromise<T[]>(
    async () => {
      const db = await getDb();
      try {
        return await runRouted(getOwner() ?? db, db, '$raw', (routed) => executeRawStatement<T>(routed, compiled));
      } catch (error) {
        throw wrapDatabaseError(error, undefined, '$raw', includeStatement ? compiled : undefined);
      }
    },
    compiled,
    undefined,
    'raw',
    undefined,
    [],
  );
}
