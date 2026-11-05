import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';
import { NN_TABLES, caught, expectUniqueViolation, user } from './helpers';

/**
 * E2E Tests: plain @unique on a nullable field, the contrast to nullsNotDistinct
 *
 * NnUser.plainNick has a plain @unique: nulls are distinct from each other, as are absent values.
 * NnPlainSlot has a plain composite unique.
 */

describe('plain @unique on a nullable field', () => {
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

  test('two nulls are both accepted', async () => {
    await client.db.NnUser.create({ data: user({ plainNick: null }) });
    await client.db.NnUser.create({ data: user({ plainNick: null }) });

    expect(await client.db.NnUser.count({ plainNick: null })).toBe(2);
  });

  test('two absent values are both accepted', async () => {
    await client.db.NnUser.create({ data: user() });
    await client.db.NnUser.create({ data: user() });

    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('a repeated value is still refused', async () => {
    await client.db.NnUser.create({ data: user({ plainNick: 'x' }) });
    const error = await caught(() => client.db.NnUser.create({ data: user({ plainNick: 'x' }) }));

    expectUniqueViolation(error, { model: 'NnUser', operation: 'create', index: 'nn_user_plainNick_unique' });
  });

  test('the option on nickname does not leak onto plainNick: nickname null twice fails, plainNick null twice does not', async () => {
    await client.db.NnUser.create({ data: user({ nickname: null, plainNick: null }) });

    const plainOnly = await caught(() => client.db.NnUser.create({ data: user({ plainNick: null }) }));
    const optionField = await caught(() => client.db.NnUser.create({ data: user({ nickname: null }) }));

    expect(plainOnly).toBeUndefined();
    expectUniqueViolation(optionField, { model: 'NnUser', operation: 'create', index: 'nn_user_nickname_unique' });
  });

  test('composite plain unique: any null column makes the tuple distinct', async () => {
    await client.db.NnPlainSlot.create({ data: { tenantId: null, slug: null } });
    await client.db.NnPlainSlot.create({ data: { tenantId: null, slug: null } });
    await client.db.NnPlainSlot.create({ data: { tenantId: 't1', slug: null } });
    await client.db.NnPlainSlot.create({ data: { tenantId: 't1', slug: null } });

    expect(await client.db.NnPlainSlot.count()).toBe(4);
  });

  test('composite plain unique: a repeated tuple of values is refused', async () => {
    await client.db.NnPlainSlot.create({ data: { tenantId: 't1', slug: 's1' } });
    const error = await caught(() => client.db.NnPlainSlot.create({ data: { tenantId: 't1', slug: 's1' } }));

    expectUniqueViolation(error, { model: 'NnPlainSlot', operation: 'create', index: 'plainSlot' });
  });
});
