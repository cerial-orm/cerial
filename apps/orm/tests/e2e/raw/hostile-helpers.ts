/**
 * Shared setup for the hostile-payload suites: the injection strings measured against the driver, the seed
 * (3 users, 3 tags; `tag` is the victim) and the assertions every case ends with.
 */

import { afterAll, beforeAll, beforeEach, expect } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// Injection payloads with `user` as the queried table and `tag` as the victim
export const A1 = 'name FROM tag; DELETE tag; SELECT name';
export const A2 = 'user; DELETE tag';
export const A3 = 'name; DELETE tag';
export const A4 = "x' OR true; DELETE tag; --";
export const N1 = 'SELECT name FROM tag; DELETE tag; SELECT name FROM user';
export const E1 = 'x\\⟩ FROM tag; DELETE tag; SELECT ⟨y';
export const E2 = 'x\\` FROM tag; DELETE tag; SELECT `y';
export const E3 = 'a` FROM tag; DELETE tag; SELECT `b';
export const E4 = 'user; DELETE tag';

export const TIMEOUT = Symbol('timeout');

/** Settles with the promise, or with TIMEOUT so a hang fails the assertion instead of the run. */
export async function within<T>(promise: PromiseLike<T>, ms = 3000): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function seedVictims(client: CerialClient): Promise<void> {
  for (const name of ['Ann', 'Bob', 'Cy'])
    await client.db.User.create({ data: { email: `${name.toLowerCase()}@x.test`, name, isActive: true, age: 20 } });
  for (const name of ['t1', 't2', 't3']) await client.db.Tag.create({ data: { name } });
}

/** Read the victim back through a typed count, never through the path under test. */
export async function expectIntact(client: CerialClient): Promise<void> {
  expect(await client.db.Tag.count()).toBe(3);
  expect(await client.db.User.count()).toBe(3);
  expect((await client.db.Tag.findMany({ orderBy: { name: 'asc' } })).map((t) => t.name)).toEqual(['t1', 't2', 't3']);
  expect((await client.db.User.findMany({ orderBy: { name: 'asc' } })).map((u) => u.name)).toEqual([
    'Ann',
    'Bob',
    'Cy',
  ]);
}

/** CerialQueryPromise is a thenable, not a Promise, so it is awaited inside a real one. */
export async function fails(
  run: () => PromiseLike<unknown>,
  error: new (...args: never[]) => Error,
  message?: string | RegExp,
): Promise<void> {
  let caught: unknown;
  try {
    await run();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(error);
  if (message !== undefined) expect((caught as Error).message).toMatch(message);
}

/** Connect one client for the file and reseed the victims before each case. */
export function useVictimClient(extraTables: string[] = []): () => CerialClient {
  const TABLES = [...tables.core, ...extraTables];
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await seedVictims(client);
  });

  return () => client;
}
