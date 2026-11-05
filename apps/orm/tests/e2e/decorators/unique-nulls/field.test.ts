import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';
import { NN_TABLES, caught, expectUniqueViolation, user } from './helpers';

/**
 * E2E Tests: @unique(nullsNotDistinct) on a model field
 *
 * Schema: unique-nulls.cerial (TS twin: unique-nulls.schema.ts). NnUser.nickname is nullable with the
 * option; NnUser.plainNick is nullable with a plain @unique, as the contrast.
 */

describe('@unique(nullsNotDistinct): model field', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, NN_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, NN_TABLES);
  });

  test('a second null is refused as a unique violation naming the index', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    const error = await caught(() => client.db.NnUser.create({ data: user({ nickname: null }) }));

    expectUniqueViolation(error, {
      model: 'NnUser',
      operation: 'create',
      index: 'nn_user_nickname_unique',
    });
    expect(await client.db.NnUser.count()).toBe(1);
  });

  test('the refusal reads the null as the conflicting value', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    const error = await caught(() => client.db.NnUser.create({ data: user({ nickname: null }) }));

    expectUniqueViolation(error, {
      model: 'NnUser',
      operation: 'create',
      index: 'nn_user_nickname_unique',
      value: 'NULL',
    });
  });

  test('two absent nicknames are allowed: NONE is never indexed', async () => {
    await client.db.NnUser.create({ data: user() });
    await client.db.NnUser.create({ data: user() });

    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('one null alongside several absent nicknames is allowed', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    await client.db.NnUser.create({ data: user() });
    await client.db.NnUser.create({ data: user() });

    expect(await client.db.NnUser.count()).toBe(3);
    expect(await client.db.NnUser.count({ nickname: null })).toBe(1);
  });

  test('a null and a value coexist', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null }) });
    const withValue = await client.db.NnUser.create({ data: user({ nickname: 'ada' }) });

    expect(withValue.nickname).toBe('ada');
    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('a repeated value is refused like any unique field', async () => {
    await client.db.NnUser.create({ data: user({ nickname: 'ada' }) });
    const error = await caught(() => client.db.NnUser.create({ data: user({ nickname: 'ada' }) }));

    expectUniqueViolation(error, { model: 'NnUser', operation: 'create', index: 'nn_user_nickname_unique' });
    expect(await client.db.NnUser.count()).toBe(1);
  });

  test('different values coexist', async () => {
    await client.db.NnUser.create({ data: user({ nickname: 'ada' }) });
    await client.db.NnUser.create({ data: user({ nickname: 'bob' }) });

    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('the first record keeps its null after the refused second write', async () => {
    const first = await client.db.NnUser.create({ data: user({ nickname: null }) });
    await caught(() => client.db.NnUser.create({ data: user({ nickname: null }) }));

    const rows = await client.db.NnUser.findMany({ where: { nickname: null } });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toEqual(first.id);
  });
});
