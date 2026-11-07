/**
 * E2E Tests: a lost operator under an undeclared @flexible sub-key is refused on writes
 *
 * `address: { extra: { eq: req.x } }` with `x` absent names no condition, exactly like `street: { eq: undefined }`.
 * Beside a real condition it used to be dropped and the write ran on the rest. A value comparison on an undeclared
 * key (`extra: {}`, `extra: 'x'`, `extra: { foo: 1 }`) stays a condition and runs.
 *
 * Schema: flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// The generated types reject undeclared sub-keys with operators only for some shapes; a JavaScript caller can send them
const hostile = (value: unknown): never => value as never;

const sibling = { name: { neq: 'zz' } };

const refusedWheres: Array<[string, unknown]> = [
  ['eq undefined', { ...sibling, address: { extra: { eq: undefined } } }],
  ['two undefined operators', { ...sibling, address: { extra: { neq: undefined, gt: undefined } } }],
  ['beside a declared key', { ...sibling, address: { city: 'NYC', extra: { eq: undefined } } }],
  ['inside AND', { ...sibling, address: { AND: [{ extra: { eq: undefined } }] } }],
  ['inside NOT', { ...sibling, address: { NOT: { extra: { eq: undefined } } } }],
  ['under an outer NOT', { ...sibling, NOT: { address: { extra: { eq: undefined } } } }],
  ['in an OR branch', { OR: [{ name: 't1' }, { address: { extra: { eq: undefined } } }] }],
  ['in an object array quantifier', { ...sibling, tags: { some: { extra: { eq: undefined } } } }],
];

describe('A lost operator under an undeclared flexible sub-key', () => {
  let client: CerialClient;

  const names = async () => (await client.db.FlexUser.findMany({ orderBy: { name: 'asc' } })).map((r) => r.name);

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.flexible);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.flexible);
    for (const name of ['t1', 't2', 't3']) {
      await client.db.FlexUser.create({
        data: {
          name,
          address: { street: '1 Main', city: 'NYC' },
          profile: { bio: 'hi', metadata: { label: 'x' } },
          strictAddress: { street: '2 Main', city: 'LA' },
        },
      });
    }
  });

  const refuses = async (run: () => Promise<unknown>) => {
    await expect(run()).rejects.toThrow(/ambiguous on a write/);
    expect(await names()).toEqual(['t1', 't2', 't3']);
  };

  test.each(refusedWheres)('deleteMany refuses %s and deletes nothing', async (_label, where) => {
    await refuses(async () => client.db.FlexUser.deleteMany({ where: hostile(where) }));
  });

  test.each(refusedWheres)('updateMany refuses %s and changes nothing', async (_label, where) => {
    await refuses(async () => client.db.FlexUser.updateMany({ where: hostile(where), data: { name: 'changed' } }));
  });

  test.each(refusedWheres)('$transaction refuses %s and changes nothing', async (_label, where) => {
    await refuses(async () => {
      await client.$transaction([
        client.db.FlexUser.deleteMany({ where: hostile(where) }),
        client.db.FlexUser.updateMany({ where: hostile(where), data: { name: 'changed' } }),
      ]);
    });
  });

  test('the refusal names the path and the explicit form', async () => {
    await expect(
      (async () => {
        await client.db.FlexUser.deleteMany({ where: hostile(refusedWheres[2]![1]) });
      })(),
    ).rejects.toThrow(/where\.address\.extra[\s\S]*real operator/);
  });

  test('reads keep their meaning', async () => {
    expect(await client.db.FlexUser.count(hostile(refusedWheres[0]![1]))).toBe(3);
  });

  describe('a value comparison on an undeclared key stays a condition', () => {
    const comparisons: Array<[string, unknown]> = [
      ['extra: {}', { extra: {} }],
      ['extra: "x"', { extra: 'x' }],
      ['extra: { foo: 1 }', { extra: { foo: 1 } }],
      ['extra: { eq: "x" }', { extra: { eq: 'x' } }],
      ['extra: { eq: undefined, gt: 1 }', { extra: { eq: undefined, gt: 1 } }],
    ];

    test.each(comparisons)('deleteMany runs with %s and matches no row', async (_label, body) => {
      await client.db.FlexUser.deleteMany({ where: hostile({ ...sibling, address: body }) });

      expect(await names()).toEqual(['t1', 't2', 't3']);
    });

    test.each(comparisons)('updateMany runs with %s and matches no row', async (_label, body) => {
      await client.db.FlexUser.updateMany({ where: hostile({ ...sibling, address: body }), data: { name: 'changed' } });

      expect(await names()).toEqual(['t1', 't2', 't3']);
    });

    test('a stored value is matched by its comparison', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 't4',
          address: hostile({ street: '1 Main', city: 'NYC', extra: 'hit' }),
          profile: { bio: 'hi', metadata: { label: 'x' } },
          strictAddress: { street: '2 Main', city: 'LA' },
        },
      });
      await client.db.FlexUser.deleteMany({ where: hostile({ ...sibling, address: { extra: 'hit' } }) });

      expect(await names()).toEqual(['t1', 't2', 't3']);
    });
  });
});
