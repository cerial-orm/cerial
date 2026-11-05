/**
 * Shared helpers for the transaction context e2e files: a connected client per file, the tag table every
 * test writes to, and the messages a query that outlives its transaction is refused with.
 */

import { afterAll, beforeAll, beforeEach } from 'bun:test';
import { sql } from 'cerial';
import {
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  type CerialClient,
} from '../../test-helper';

export const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The rejection of a promise-like, or undefined when it resolved. */
export async function caught(run: () => PromiseLike<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
}

/** The message a query gets when it starts after its transaction ended. */
export const lateMessage = (call: string, state: 'committed' | 'cancelled'): string =>
  `${call} ran after its transaction was ${state}: await every query inside the $transaction callback or function item`;

/** Two writes 300 ms apart in one statement list: a commit that overlaps it would keep only the first. */
export const slowTagWrite = sql`CREATE basics_tag SET name = 'slow-a'; SLEEP 300ms; CREATE basics_tag SET name = 'slow-b'; RETURN 1;`;

/**
 * Connect a client to the shared test database and empty the basics tables around each test. Returns an
 * accessor, because the client exists only once `beforeAll` has run.
 */
export function useClient(): () => CerialClient {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  return () => client;
}

/** Tag names in the table, sorted: the observable outcome of what a transaction did or did not write. */
export async function tagNames(client: CerialClient): Promise<string[]> {
  const rows = await client.db.BasicsTag.findMany({ orderBy: { name: 'asc' } });

  return rows.map((row) => row.name);
}
