/**
 * Test helper for index/composite E2E tests.
 *
 * Provides utilities to connect, clean specific tables, and migrate.
 */

import { createTestClient, CerialClient, testConfig } from '../test-client';

/** Tables used by composite index E2E tests */
const INDEX_TABLES = ['staff', 'warehouse', 'registration', 'attendee', 'workshop'];

/** Create a connected client with cleaned-up tables and fresh migrations */
export async function setupIndexClient(): Promise<CerialClient> {
  const client = createTestClient();
  await client.connect(testConfig);
  await cleanIndexTables(client);
  await client.migrate();

  return client;
}

/** Remove all tables used by index tests and re-run migrations */
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
  await client.migrate();
}

export { createTestClient, CerialClient, testConfig };
