import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';

/** Row-per-model state and the schema-fingerprint row. */
export const MIGRATIONS_TABLE = '_cerial_migrations';

/** The single `migrate` record that serialises concurrent migrators. */
export const MIGRATION_LEASE_TABLE = '_cerial_migration_lease';

/** Whether `name` is one of the tables the subsystem keeps its own state in. */
export const isStateTable = (name: string): boolean => name === MIGRATIONS_TABLE || name === MIGRATION_LEASE_TABLE;

/**
 * Fixed text, nothing interpolated. Both tables are SCHEMALESS: `_cerial_migrations` holds two row kinds with
 * different shapes (per-model state and the schema row), and a field definition on either would only add a
 * second place for a later task to stay in step with. `IF NOT EXISTS` makes a second run change nothing.
 */
const BOOTSTRAP_STATEMENTS: readonly string[] = [
  'DEFINE TABLE IF NOT EXISTS _cerial_migrations SCHEMALESS',
  'DEFINE TABLE IF NOT EXISTS _cerial_migration_lease SCHEMALESS',
];

/**
 * Defines the migration state tables on the connected database when they are missing. Takes the socket and
 * owns no connection. Every failure is a `CerialMigrationError` naming the table, including a user without
 * the rights to define tables.
 */
export async function bootstrapStateTables(surreal: Surreal): Promise<void> {
  const text = BOOTSTRAP_STATEMENTS.join(';\n');
  let responses;
  try {
    responses = await surreal.query(text).responses();
  } catch (cause) {
    throw new CerialMigrationError(
      `Defining the migration state tables failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause, statement: { text, vars: {} } },
    );
  }

  responses.forEach((response, index) => {
    if (response.success) return;
    const failed = BOOTSTRAP_STATEMENTS[index] ?? text;

    throw new CerialMigrationError(
      `Defining the migration state table failed (${failed}); the connected user needs the right to define tables: ${response.error.message}`,
      { cause: response.error, statement: { text: failed, vars: {} } },
    );
  });
}
