/**
 * Test helper for index/composite E2E tests.
 *
 * Provides utilities to connect, clean specific tables, and migrate.
 */

import { createTestClient, CerialClient, testConfig } from '../test-client';

/** Tables used by composite index E2E tests */
const INDEX_TABLES = ['staff', 'warehouse', 'registration', 'attendee', 'workshop'];

/**
 * Clean index tables and re-run migrations.
 * Use in `beforeEach` when the client is connected via `beforeAll`.
 */
export async function cleanAndPrepare(client: CerialClient): Promise<void> {
  await cleanIndexTables(client);
  client.resetMigrationState();
  await client.migrate();
}

/** Remove all tables used by index tests */
export async function cleanIndexTables(client: CerialClient): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of INDEX_TABLES) {
    try {
      await surreal.query(`REMOVE TABLE IF EXISTS ${table};`);
    } catch {
      // ignore
    }
  }
}

/** Clean a specific table then re-run migrations */
export async function cleanTable(client: CerialClient, table: string): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  try {
    await surreal.query(`REMOVE TABLE IF EXISTS ${table};`);
  } catch {
    // ignore
  }
  client.resetMigrationState();
  await client.migrate();
}

/**
 * Truncate index tables by deleting all rows.
 * Lightweight alternative to cleanAndPrepare — preserves schema, just clears data.
 * Use in `beforeEach` for fast per-test cleanup.
 */
export async function truncateIndexTables(client: CerialClient): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of INDEX_TABLES) {
    try {
      await surreal.query(`DELETE FROM ${table};`);
    } catch {
      // Ignore errors - table may not exist yet
    }
  }
}

export { createTestClient, CerialClient, testConfig };
