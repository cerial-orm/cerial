import { NotFoundError, Surreal } from 'surrealdb';
import { CerialConnectionError, CerialMigrationError } from '../../errors';
import { quoteIdent, readLiveSchema, readState } from '../../migrations';
import type { SchemaModel } from '../../migrations';
import type { ResolvedMigrateConnection } from './connection';
import type { MigrateTarget } from './load';

export const join = (...parts: string[]): string => parts.join('');

/**
 * Schema loading logs progress with `console.log`, which would land in front of the `--json` object on stdout.
 * Status reports through its return value, so the loader's chatter goes to stderr for the duration of the load.
 */
export async function withLogsOnStderr<T>(work: () => Promise<T>): Promise<T> {
  const original = console.log;
  console.log = console.error;
  try {
    return await work();
  } finally {
    console.log = original;
  }
}

/** The message of a failed connect with the password taken out, since it reaches CI logs */
export function scrub(text: string, secret: string | undefined): string {
  return secret ? text.split(secret).join('***') : text;
}

export async function connect(connection: ResolvedMigrateConnection, operation: string): Promise<Surreal> {
  const surreal = new Surreal();
  try {
    await surreal.connect(connection.url, {
      namespace: connection.namespace,
      database: connection.database,
      ...(connection.auth ? { authentication: connection.auth } : {}),
    });
  } catch (error) {
    await surreal.close().catch(() => {});
    const cause = error instanceof Error ? error.message : String(error);

    throw new CerialConnectionError(
      join('Could not connect to ', connection.url, ': ', scrub(cause, connection.auth?.password)),
      { operation },
    );
  }

  return surreal;
}

/**
 * Whether the connected database is defined. Only the server's own "database not found" answer counts as no:
 * any other failure (rights, a dropped socket) is thrown, so a real problem is never read as an empty database.
 */
export async function databaseExists(surreal: Surreal): Promise<boolean> {
  const [response] = await surreal.query('INFO FOR DB').responses();
  if (response?.success) return true;
  if (response?.error instanceof NotFoundError && response.error.databaseName !== undefined) return false;

  throw new CerialMigrationError(
    join('Reading the live schema failed: ', response?.error.message ?? 'the server sent no answer'),
    { cause: response?.error },
  );
}

/** Creates the connected database. A failure names what was being created, since the rights it needs are the usual cause. */
export async function createDatabase(surreal: Surreal, name: string): Promise<void> {
  const [response] = await surreal.query(join('DEFINE DATABASE IF NOT EXISTS ', quoteIdent(name))).responses();
  if (response?.success) return;

  throw new CerialMigrationError(
    join(
      'Could not create the database ',
      quoteIdent(name),
      ': ',
      response?.error.message ?? 'the server sent no answer',
    ),
    { cause: response?.error },
  );
}

export interface LiveTarget {
  /** False when the database is not defined yet, which reads as an empty live schema with no state */
  readonly exists: boolean;
  readonly live: SchemaModel;
  /** The managed tables each entry's state row holds, by client class name */
  readonly managed: ReadonlyMap<string, readonly string[]>;
  readonly managedTables: ReadonlySet<string>;
}

/** Reads a target's live schema and migration state, treating a database that does not exist yet as empty. Writes nothing. */
export async function readLiveTarget(surreal: Surreal, target: MigrateTarget): Promise<LiveTarget> {
  const managed = new Map<string, readonly string[]>();
  const managedTables = new Set<string>();
  if (!(await databaseExists(surreal))) {
    for (const entry of target.entryModels) managed.set(entry.schemaName, []);

    return { exists: false, live: { tables: [], unmanaged: [] }, managed, managedTables };
  }

  const live = await readLiveSchema(surreal);
  // readState creates nothing: a database without state tables reads as no managed tables
  for (const entry of target.entryModels) {
    const tables = (await readState(surreal, entry.schemaName)).schema?.managedTables ?? [];
    managed.set(entry.schemaName, tables);
    for (const table of tables) managedTables.add(table);
  }

  return { exists: true, live, managed, managedTables };
}
