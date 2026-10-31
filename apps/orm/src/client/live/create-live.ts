import { LiveSubscriptionError, Table, type Expr, type Surreal } from 'surrealdb';
import { CerialValidationError } from '../../errors';
import type { SqlFragment } from '../../query/compile';
import { wrapDatabaseError } from '../model/wrap-database-error';
import { mapRecord } from '../../query/mappers';
import type { ModelMetadata, ModelRegistry } from '../../types';
import { CerialLiveHandle, markSubscribeFailure } from './live-handle';
import { fragmentToExpr, modelWhereToExpr } from './where-expr';

export interface ClientLiveOptions {
  /** A fragment from the `sql` tag, evaluated against each changed row. `ORDER BY` is not valid here. */
  readonly where?: SqlFragment;
}

/** Subscribe to a table and wrap the subscription. The table reaches the driver as a bound value, never as text. */
async function openLive<T>(
  table: string,
  where: Expr | undefined,
  getDb: () => Promise<Surreal>,
  track: (handle: CerialLiveHandle<T>) => () => void,
  mapValue?: (value: unknown) => unknown,
): Promise<CerialLiveHandle<T>> {
  const db = await getDb();
  let subscription;
  try {
    subscription = await db.live<T>(new Table(table)).where(where);
  } catch (error) {
    markSubscribeFailure(error);
    // The driver wraps every subscribe failure in a LiveSubscriptionError; classify the real cause.
    throw wrapDatabaseError(
      error instanceof LiveSubscriptionError ? (error.cause ?? error) : error,
      undefined,
      '$live',
    );
  }

  return new CerialLiveHandle<T>(subscription, db, track, mapValue);
}

/**
 * Build the `$live` of a generated client. The table name and the where fragment are checked before the
 * connection is touched; `getDb` migrates and resolves the socket.
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
  // A `where` key that is present must hold a fragment, so `{ where: undefined }` refuses instead of watching every row.
  const where = options && 'where' in options ? fragmentToExpr(options.where) : undefined;

  return openLive(table, where, getDb, track);
}

export interface ModelLiveOptions<W = unknown> {
  /** A typed where of the model, including `$raw`, checked against the model and its relation targets. */
  readonly where?: W;
}

/**
 * Build the `$live` of a model. The where is validated against the model's metadata and registry before the
 * connection is touched, and every row of a notification is mapped through the model, so ids arrive as
 * `CerialId`. A delete carries the row it removed and maps the same way.
 */
export async function createModelLive<T = unknown>(
  metadata: ModelMetadata,
  registry: ModelRegistry | undefined,
  options: ModelLiveOptions | undefined,
  getDb: () => Promise<Surreal>,
  track: (handle: CerialLiveHandle<T>) => () => void,
): Promise<CerialLiveHandle<T>> {
  const where = options && 'where' in options ? modelWhereToExpr(options.where, metadata, registry) : undefined;

  return openLive(metadata.tableName, where, getDb, track, (value) => mapLiveRow(value, metadata));
}

/** Map an object row through the model; any other value passes through unchanged. */
function mapLiveRow(value: unknown, metadata: ModelMetadata): unknown {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return value;

  return mapRecord(value as Record<string, unknown>, metadata);
}
