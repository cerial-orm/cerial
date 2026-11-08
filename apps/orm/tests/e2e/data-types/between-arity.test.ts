/**
 * E2E: between takes exactly two bounds
 *
 * A short or long bounds list used to bind NONE as a missing bound, so the range matched nothing and
 * its negation matched every row. It is refused naming the field, and no row is touched.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { tables } from '../test-helper';
import { setupDataTypeTests } from './test-factory';

const loose = (value: unknown): never => value as never;

// A refusal can throw while the query is built, so the call runs inside an async function
const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

describe('E2E: between arity', () => {
  const { getClient } = setupDataTypeTests([...tables.duration, ...tables.decimal]);

  beforeEach(async () => {
    const client = getClient();
    for (const [name, ttl, price] of [
      ['a', '1h', '1'],
      ['b', '2h', '2'],
      ['c', '3h', '3'],
    ] as const) {
      await client.db.DurationBasic.create({ data: { name, ttl, cooldown: ttl, intervals: [] } });
      await client.db.DecimalBasic.create({ data: { name, price, tax: price, amounts: [] } });
    }
  });

  const BOUNDS: Array<[string, unknown[]]> = [
    ['none', []],
    ['one', ['__lo__']],
    ['three', ['__lo__', '__hi__', '__hi__']],
  ];

  describe.each([
    ['DurationBasic', 'ttl', '1h', '2h'],
    ['DecimalBasic', 'price', '1', '2'],
  ] as const)('%s.%s', (model, field, lo, hi) => {
    const api = () =>
      (
        getClient().db as never as Record<
          string,
          {
            deleteMany: (a: unknown) => Promise<number>;
            updateMany: (a: unknown) => Promise<unknown>;
            findMany: (a?: unknown) => Promise<Array<{ name: string }>>;
          }
        >
      )[model]!;
    const fill = (bounds: unknown[]) => bounds.map((b) => (b === '__lo__' ? lo : b === '__hi__' ? hi : b));
    const names = async (where: unknown = {}) =>
      (await api().findMany({ where: loose(where) })).map((r) => r.name).sort();

    test.each(BOUNDS)('deleteMany NOT between with %s bounds is refused and deletes nothing', async (_l, bounds) => {
      await refuses(
        () => api().deleteMany({ where: loose({ NOT: { [field]: { between: fill(bounds) } } }) }),
        new RegExp(field),
      );
      expect(await names()).toEqual(['a', 'b', 'c']);
    });

    test.each(BOUNDS)('updateMany with %s bounds is refused and changes nothing', async (_l, bounds) => {
      await refuses(
        () => api().updateMany({ where: loose({ [field]: { between: fill(bounds) } }), data: { name: 'hit' } }),
        new RegExp(field),
      );
      expect(await names()).toEqual(['a', 'b', 'c']);
    });

    test('two bounds select the inclusive range and NOT its complement', async () => {
      expect(await names({ [field]: { between: [lo, hi] } })).toEqual(['a', 'b']);
      const n = await api().deleteMany({ where: loose({ NOT: { [field]: { between: [lo, hi] } } }) });
      expect(n).toBe(1);
      expect(await names()).toEqual(['a', 'b']);
    });
  });
});
