import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';
import { NN_TABLES, caught, expectUniqueViolation, user } from './helpers';

/**
 * E2E Tests: @unique(nullsNotDistinct) on an object sub-field
 *
 * NnUser.profile is an optional NnProfile whose handle carries the option, so the index is on
 * profile.handle. An absent profile and a profile without a handle are both NONE.
 */

describe('@unique(nullsNotDistinct): object sub-field', () => {
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

  test('a second null handle is refused, naming the sub-field index', async () => {
    await client.db.NnUser.create({ data: user({ profile: { handle: null } }) });
    const error = await caught(() => client.db.NnUser.create({ data: user({ profile: { handle: null } }) }));

    expectUniqueViolation(error, {
      model: 'NnUser',
      operation: 'create',
      index: 'nn_user_profile_handle_unique',
      value: 'NULL',
    });
    expect(await client.db.NnUser.count()).toBe(1);
  });

  test('two users without a profile are allowed', async () => {
    await client.db.NnUser.create({ data: user() });
    await client.db.NnUser.create({ data: user() });

    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('two profiles without a handle are allowed', async () => {
    await client.db.NnUser.create({ data: user({ profile: {} }) });
    await client.db.NnUser.create({ data: user({ profile: {} }) });

    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('one null handle alongside absent handles and an absent profile is allowed', async () => {
    await client.db.NnUser.create({ data: user({ profile: { handle: null } }) });
    await client.db.NnUser.create({ data: user({ profile: {} }) });
    await client.db.NnUser.create({ data: user() });

    expect(await client.db.NnUser.count()).toBe(3);
  });

  test('a null handle and a value coexist; a repeated value is refused', async () => {
    await client.db.NnUser.create({ data: user({ profile: { handle: null } }) });
    await client.db.NnUser.create({ data: user({ profile: { handle: 'h1' } }) });
    const error = await caught(() => client.db.NnUser.create({ data: user({ profile: { handle: 'h1' } }) }));

    expectUniqueViolation(error, { model: 'NnUser', operation: 'create', index: 'nn_user_profile_handle_unique' });
    expect(await client.db.NnUser.count()).toBe(2);
  });

  test('updating a second profile handle to null is refused', async () => {
    await client.db.NnUser.create({ data: user({ profile: { handle: null } }) });
    const other = await client.db.NnUser.create({ data: user({ profile: { handle: 'h1' } }) });

    const error = await caught(() =>
      client.db.NnUser.updateUnique({ where: { id: other.id }, data: { profile: { handle: null } } }),
    );

    expectUniqueViolation(error, {
      model: 'NnUser',
      operation: 'updateUnique',
      index: 'nn_user_profile_handle_unique',
    });
  });
});
