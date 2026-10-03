/**
 * E2E Tests: options a find method does not take
 *
 * findOne always returns one row, so `limit` and `offset` have no meaning there; findUnique returns
 * one row addressed by a unique key, so `orderBy`, `limit` and `offset` have none either. The generated
 * types omit them. A JavaScript or dynamic caller that passes them anyway is told, not ignored.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Unsupported read options — negative cases', () => {
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

  const seed = async () => {
    await client.db.BasicsUser.create({ data: { email: 'a@x.io', name: 'a', isActive: true } });

    return client.db.BasicsUser.create({ data: { email: 'b@x.io', name: 'b', isActive: true } });
  };

  const rejection = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return error;
    }

    return undefined;
  };

  const findOneCalls: Array<[string, () => unknown]> = [
    // @ts-expect-error negative test: findOne has no limit
    ['limit', () => client.db.BasicsUser.findOne({ limit: 1 })],
    // @ts-expect-error negative test: findOne has no offset
    ['offset', () => client.db.BasicsUser.findOne({ offset: 1 })],
  ];

  test.each(findOneCalls)('findOne rejects %s with a validation error naming it', (option, call) => {
    const error = rejection(call);

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialValidationError).operation).toBe('findOne');
    expect((error as CerialValidationError).field).toBe(option);
    expect((error as CerialValidationError).message).toContain(`findOne does not accept ${option}`);
  });

  const findUniqueCalls: Array<[string, () => unknown]> = [
    // @ts-expect-error negative test: findUnique has no orderBy
    ['orderBy', () => client.db.BasicsUser.findUnique({ where: { email: 'a@x.io' }, orderBy: { name: 'asc' } })],
    // @ts-expect-error negative test: findUnique has no limit
    ['limit', () => client.db.BasicsUser.findUnique({ where: { email: 'a@x.io' }, limit: 1 })],
    // @ts-expect-error negative test: findUnique has no offset
    ['offset', () => client.db.BasicsUser.findUnique({ where: { email: 'a@x.io' }, offset: 1 })],
  ];

  test.each(findUniqueCalls)('findUnique rejects %s with a validation error naming it', (option, call) => {
    const error = rejection(call);

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialValidationError).operation).toBe('findUnique');
    expect((error as CerialValidationError).field).toBe(option);
    expect((error as CerialValidationError).message).toContain(`findUnique does not accept ${option}`);
  });

  test('findOne still sorts and filters, and findUnique still finds', async () => {
    const b = await seed();

    expect((await client.db.BasicsUser.findOne({ orderBy: { name: 'desc' } }))?.name).toBe('b');
    expect((await client.db.BasicsUser.findOne({ where: { name: 'a' } }))?.name).toBe('a');
    expect((await client.db.BasicsUser.findUnique({ where: { id: b.id } }))?.name).toBe('b');
    expect((await client.db.BasicsUser.findUnique({ where: { email: 'a@x.io' } }))?.name).toBe('a');
  });

  test('findMany keeps limit, offset and orderBy', async () => {
    await seed();
    const rows = await client.db.BasicsUser.findMany({ orderBy: { name: 'asc' }, limit: 1, offset: 1 });

    expect(rows.map((r) => r.name)).toEqual(['b']);
  });
});
