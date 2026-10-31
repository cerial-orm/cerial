/**
 * E2E Tests: the shape of `Model.$raw` rows and the `includeStatementInErrors` option on raw statements
 *
 * A model-bound raw row carries the keys the statement returned and no others. The statement and its bound
 * values appear on a raw error only when the client opts in, on the client, on a transaction and on a model.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialDatabaseError, sql } from 'cerial';
import {
  CerialClient,
  type CerialClient as Client,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../test-helper';

const TABLES = [...tables.core];

const caught = async (run: () => PromiseLike<unknown>): Promise<CerialDatabaseError> => {
  try {
    await run();
  } catch (error) {
    return error as CerialDatabaseError;
  }
  throw new Error('expected the statement to fail');
};

describe('E2E Model.$raw row shape', () => {
  let client: Client;

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
    await client.db.User.create({ data: { email: 'a@x.test', name: 'Ann', isActive: true, age: 20 } });
    await client.db.User.create({ data: { email: 'b@x.test', name: 'Bob', isActive: true, age: 40 } });
  });

  test('an aggregate row keeps only its own keys', async () => {
    const rows = await client.db.User.$raw<{ n: number }>(sql`SELECT count() AS n FROM user GROUP ALL`);

    expect(rows).toEqual([{ n: 2 }]);
    expect(Object.keys(rows[0]!)).toEqual(['n']);
  });

  test('a projection of some fields does not gain the optional record fields', async () => {
    const rows = await client.db.User.$raw<{ name: string }>(sql`SELECT name FROM user ORDER BY name`);

    expect(rows).toEqual([{ name: 'Ann' }, { name: 'Bob' }]);
  });

  test('positive: a full row is still mapped and backfilled as before', async () => {
    const rows = await client.db.User.$raw<Record<string, unknown>>(sql`SELECT * FROM user WHERE name = 'Ann'`);

    expect(rows[0]!.name).toBe('Ann');
    expect('profileId' in rows[0]!).toBe(true);
  });
});

describe('E2E includeStatementInErrors on raw statements', () => {
  let quiet: Client;
  let verbose: Client;

  beforeAll(async () => {
    quiet = createTestClient();
    await quiet.connect(testConfig);
    verbose = new CerialClient({ includeStatementInErrors: true });
    await verbose.connect(testConfig);
    await cleanupTables(quiet, TABLES);
  });

  afterAll(async () => {
    await verbose.disconnect();
    await quiet.disconnect();
  });

  const secret = 'hunter2-value';
  const failing = sql`SELEC ${secret}`;

  test('client.$raw: absent by default, present with the option and carrying the bound value', async () => {
    expect((await caught(() => quiet.$raw(failing))).statement).toBeUndefined();

    const statement = (await caught(() => verbose.$raw(failing))).statement;
    expect(statement?.text).toContain('SELEC');
    expect(Object.values(statement?.vars ?? {})).toContain(secret);
  });

  test('tx.$raw: absent by default, present with the option', async () => {
    const run = (db: Client) =>
      caught(() =>
        db.$transaction(async (tx) => {
          await tx.$raw(failing);
        }),
      );

    expect((await run(quiet)).statement).toBeUndefined();
    expect((await run(verbose)).statement?.text).toContain('SELEC');
  });

  test('Model.$raw: absent by default, present with the option', async () => {
    expect((await caught(() => quiet.db.User.$raw(failing))).statement).toBeUndefined();
    expect((await caught(() => verbose.db.User.$raw(failing))).statement?.text).toContain('SELEC');
  });

  test('the error message never contains the bound value either way', async () => {
    expect((await caught(() => quiet.$raw(failing))).message).not.toContain(secret);
    expect((await caught(() => verbose.$raw(failing))).message).not.toContain(secret);
  });
});
