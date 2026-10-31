import { Table, type Surreal } from 'surrealdb';
import { CerialValidationError } from '../../errors';
import type { SqlFragment } from '../../query/compile';
import { wrapDatabaseError } from '../model/wrap-database-error';
import { CerialLiveHandle } from './live-handle';
import { fragmentToExpr } from './where-expr';

export interface ClientLiveOptions {
  /** A fragment from the `sql` tag, evaluated against each changed row. `ORDER BY` is not valid here. */
  readonly where?: SqlFragment;
}

/**
 * Build the `$live` of a generated client. The table name and the where fragment are checked before the
 * connection is touched; `getDb` migrates and resolves the socket. The table reaches the driver as a bound
 * value, never as text.
 */
export async function createClientLive<T = unknown>(
  table: string,
  options: ClientLiveOptions | undefined,
  getDb: () => Promise<Surreal>,
  track: (handle: CerialLiveHandle<T>) => () => void,
): Promise<CerialLiveHandle<T>> {
  if (typeof table !== 'string' || !table) {
    throw new CerialValidationError('$live: the table must be a non-empty string', { operation: '$live' });
  }
  const where = options?.where === undefined ? undefined : fragmentToExpr(options.where);

  const db = await getDb();
  let subscription;
  try {
    subscription = await db.live<T>(new Table(table)).where(where);
  } catch (error) {
    throw wrapDatabaseError(error, undefined, '$live');
  }

  return new CerialLiveHandle<T>(subscription, db, track);
}
