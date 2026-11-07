/**
 * E2E Tests: a mistyped where operand is refused before any query, on reads and writes
 *
 * A string compared to an int field was cast by the database and matched or missed rows the caller never
 * meant, all the way to a deleteMany that removed the wrong set. Every negative case asserts the throw AND
 * the surviving rows, and a valid operand of the same shape still matches.
 *
 * Schema: test-basics.cerial (User { age Int? @nullable, name String, createdAt Date, ... })
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const hostile = (value: unknown): never => value as never;

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Where operand types — negative and positive cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
    for (const [name, age] of [
      ['Ada', 3],
      ['Bob', 5],
      ['Cy', 40],
    ] as const)
      await client.db.User.create({
        data: { email: `${name.toLowerCase()}@x.co`, name, age, isActive: true },
      });
  });

  const names = async () => (await client.db.User.findMany({ orderBy: { name: 'asc' } })).map((u) => u.name);

  test('deleteMany with a string operand for an int field is refused and every row survives', async () => {
    await rejects(
      () => client.db.User.deleteMany({ where: { age: { lte: hostile('5') } } }),
      'age must be of type int',
    );
    expect(await names()).toEqual(['Ada', 'Bob', 'Cy']);
  });

  test('the same refusal inside a $transaction, with every row intact afterwards', async () => {
    await rejects(
      () => client.$transaction([client.db.User.deleteMany({ where: { age: { lte: hostile('5') } } })]),
      'age must be of type int',
    );
    await rejects(
      () =>
        client.$transaction(async (tx) => {
          await tx.User.deleteMany({ where: { age: { lte: hostile('5') } } });
        }),
      'age must be of type int',
    );
    expect(await names()).toEqual(['Ada', 'Bob', 'Cy']);
  });

  test('updateMany refuses a mistyped operand and changes nothing', async () => {
    await rejects(
      () => client.db.User.updateMany({ where: { age: hostile('5') }, data: { name: 'X' } }),
      'age must be of type int',
    );
    expect(await names()).toEqual(['Ada', 'Bob', 'Cy']);
  });

  test('findMany, count and findOne refuse mistyped operands for each operator family', async () => {
    await rejects(() => client.db.User.findMany({ where: { age: { gt: hostile('5') } } }), 'age must be of type int');
    await rejects(
      () => client.db.User.findMany({ where: { age: { in: hostile([3, '5']) } } }),
      'age[1] must be of type int',
    );
    await rejects(() => client.db.User.count({ age: { between: hostile(['1', 9]) } }), 'age[0] must be of type int');
    await rejects(
      () => client.db.User.findOne({ where: { name: { contains: hostile(5) } } }),
      'contains expects a string',
    );
    await rejects(() => client.db.User.findMany({ where: { name: hostile(5) } }), 'name must be of type string');
    await rejects(
      () => client.db.User.findMany({ where: { isActive: hostile('true') } }),
      'isActive must be of type bool',
    );
    await rejects(
      () => client.db.User.findMany({ where: { age: { isNull: hostile('yes') } } }),
      'isNull expects a boolean',
    );
    await rejects(
      () => client.db.User.findMany({ where: { createdAt: { lt: hostile(5) } } }),
      'createdAt must be of type date',
    );
    await rejects(
      () => client.db.User.findMany({ where: { nicknames: { has: hostile(5) } } }),
      'nicknames must be of type string',
    );
    await rejects(
      () => client.db.User.findMany({ where: { scores: { hasAny: hostile(['1']) } } }),
      'scores[0] must be of type int',
    );
  });

  test('a mistyped operand nested in OR, AND and NOT is refused', async () => {
    await rejects(
      () => client.db.User.deleteMany({ where: { OR: [{ name: 'Ada' }, { NOT: { age: hostile('5') } }] } }),
      'age must be of type int',
    );
    expect(await names()).toEqual(['Ada', 'Bob', 'Cy']);
  });

  test('valid operands of the same shapes still match', async () => {
    expect(
      (await client.db.User.findMany({ where: { age: { lte: 5 } }, orderBy: { name: 'asc' } })).map((u) => u.name),
    ).toEqual(['Ada', 'Bob']);
    expect(await client.db.User.count({ age: { in: [3, 40] } })).toBe(2);
    expect(await client.db.User.count({ age: { between: [4, 9] } })).toBe(1);
    expect(await client.db.User.count({ name: { startsWith: 'A' } })).toBe(1);
    expect(await client.db.User.count({ createdAt: { lt: new Date(Date.now() + 60_000) } })).toBe(3);
    expect(await client.db.User.count({ age: null })).toBe(0);
    expect(await client.db.User.count({ age: { isNull: false } })).toBe(3);
  });

  test('a valid deleteMany removes exactly the matching rows', async () => {
    await client.db.User.deleteMany({ where: { age: { lte: 5 } } });
    expect(await names()).toEqual(['Cy']);
  });

  test('ids in the forms create accepts still match', async () => {
    const [ada] = await client.db.User.findMany({ where: { name: 'Ada' } });
    expect(await client.db.User.count({ id: ada!.id })).toBe(1);
    expect(await client.db.User.count({ id: String(ada!.id) })).toBe(1);
    expect(await client.db.User.count({ id: { in: [ada!.id] } })).toBe(1);
  });
});
