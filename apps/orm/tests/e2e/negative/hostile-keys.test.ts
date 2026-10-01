/**
 * E2E Tests: hostile identifiers as keys — negative cases
 *
 * A key carrying SurrealQL syntax must be rejected by name at every surface
 * that takes a key, so it can never reach the query text. Values are always
 * bound as parameters and are not covered here. Computed `string` keys widen
 * to an index signature, so only some surfaces need @ts-expect-error.
 *
 * Schema: core (User), flexible (FlexUser), uuid (UuidDecorated)
 * No e2e schema declares a field with an underscore, so the inverse check uses
 * the digit-bearing field autoV4.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const HOSTILE_KEYS = [
  'name; DROP TABLE user; --',
  "name' OR '1'='1",
  '`name`',
  'name[0]',
  'name.id',
  '../name',
  ' ',
  '',
  'nаme', // Cyrillic 'а' (U+0430), not the Latin 'a'
  'name​', // zero-width space
];

const ALL_TABLES = [...tables.basics, ...tables.flexible, ...tables.uuid];

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Hostile keys — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ALL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ALL_TABLES);
  });

  describe.each(HOSTILE_KEYS)('key %j', (key) => {
    const unknown = (prefix: string, path = key, model = 'User') =>
      `${prefix}: Unknown field '${path}' on model ${model}`;

    test('create data', () =>
      rejects(
        () => client.db.User.create({ data: { email: 'a@b.co', name: 'A', isActive: true, [key]: 'x' } }),
        unknown('Invalid data'),
      ));

    test('updateMany data', () =>
      rejects(
        () => client.db.User.updateMany({ where: { name: 'A' }, data: { [key]: 'x' } }),
        unknown('Invalid data'),
      ));

    test('select', () =>
      rejects(
        // @ts-expect-error — hostile key is not a field, testing runtime guard
        () => client.db.User.findMany({ select: { [key]: true } }),
        unknown('Invalid select'),
      ));

    test('orderBy', () =>
      rejects(() => client.db.User.findMany({ orderBy: { [key]: 'asc' } }), unknown('Invalid orderBy')));

    test('include', () =>
      rejects(() => client.db.User.findMany({ include: { [key]: true } }), unknown('Invalid include')));

    test('where at top level', () =>
      rejects(() => client.db.User.findMany({ where: { [key]: 'x' } }), `Invalid where clause: Unknown field: ${key}`));

    test('where object sub-key', () =>
      rejects(
        () => client.db.FlexUser.findMany({ where: { strictAddress: { [key]: 'x' } } }),
        unknown('Invalid where clause', `strictAddress.${key}`, 'FlexUser'),
      ));

    test('select object sub-key', () =>
      rejects(
        // @ts-expect-error — hostile key is not a sub-field, testing runtime guard
        () => client.db.FlexUser.findMany({ select: { strictAddress: { [key]: true } } }),
        unknown('Invalid select', `strictAddress.${key}`, 'FlexUser'),
      ));

    test('orderBy object sub-key', () =>
      rejects(
        () => client.db.FlexUser.findMany({ orderBy: { strictAddress: { [key]: 'asc' } } }),
        unknown('Invalid orderBy', `strictAddress.${key}`, 'FlexUser'),
      ));
  });

  test('a hostile key writes nothing', async () => {
    await rejects(
      // @ts-expect-error — hostile key is not a field, testing runtime guard
      () => client.db.User.create({ data: { email: 'a@b.co', name: 'A', isActive: true, 'x; DROP TABLE user': 1 } }),
      "Unknown field 'x; DROP TABLE user'",
    );

    expect(await client.db.User.count()).toBe(0);
  });

  test('a declared field name containing a digit works at every surface', async () => {
    const created = await client.db.UuidDecorated.create({ data: { name: 'U' }, select: { autoV4: true } });
    expect(created.autoV4).toBeDefined();

    const rows = await client.db.UuidDecorated.findMany({
      where: { autoV4: created.autoV4! },
      select: { name: true, autoV4: true },
      orderBy: { autoV4: 'asc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.autoV4!.toString()).toBe(created.autoV4!.toString());
  });
});
