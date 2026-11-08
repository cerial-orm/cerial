/**
 * E2E: typed operands in a relation sub-filter
 *
 * A relation sub-filter converts each operand the way the top-level where does, so a string (or wrapper)
 * Duration, Uuid, Decimal, Date or id selects the rows the typed value selects, on every operator and
 * in every direction (forward to-one, reverse quantifiers, array foreign key).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDecimal, CerialDuration, CerialUuid } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../test-helper';

// Strings and wrappers are what a JavaScript or cast caller can send; the generated types are narrower
const loose = (value: unknown): never => value as never;

const TABLES = ['ro_owner', 'ro_kit', 'ro_tag', 'ro_item'];
const U = (n: number): string => `0190a6f2-7d5e-7c3a-9b1e-12345678900${n}`;

interface Kind {
  field: 'du' | 'uu' | 'de' | 'dt';
  // stored values at ranks 0, 1, 2 and their string operands
  stored: unknown[];
  ops: [string, string, string];
  wrap: (v: string) => unknown;
}

const KINDS: Record<string, Kind> = {
  duration: {
    field: 'du',
    stored: ['1h', '2h', '3h'],
    ops: ['1h', '2h', '3h'],
    wrap: (v) => new CerialDuration(v),
  },
  uuid: { field: 'uu', stored: [U(0), U(2), U(4)], ops: [U(0), U(2), U(4)], wrap: (v) => new CerialUuid(v) },
  decimal: {
    field: 'de',
    stored: ['1.5', '2.5', '3.5'],
    ops: ['1.5', '2.5', '3.5'],
    wrap: (v) => new CerialDecimal(v),
  },
  date: {
    field: 'dt',
    stored: ['2021-01-01', '2021-06-01', '2022-01-01'],
    ops: ['2021-01-01', '2021-06-01', '2022-01-01'],
    wrap: (v) => new Date(v),
  },
};

const stored = (kind: Kind, i: number): unknown => {
  const v = kind.stored[i] as string;

  return kind.field === 'dt' ? new Date(v) : v;
};

describe('E2E: typed operands in a relation sub-filter', () => {
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
    for (let i = 0; i < 3; i++) {
      const data = {
        du: stored(KINDS.duration!, i),
        uu: stored(KINDS.uuid!, i),
        de: stored(KINDS.decimal!, i),
        dt: stored(KINDS.date!, i),
      };
      const o = await client.db.RoOwner.create({ data: loose({ id: `o${i}`, label: `o${i}`, ...data }) });
      await client.db.RoKit.create({ data: { id: `k${i}`, name: `k${i}`, ownerId: o.id } });
      const t = await client.db.RoTag.create({ data: loose({ id: `t${i}`, label: `t${i}`, ...data }) });
      await client.db.RoItem.create({ data: { id: `i${i}`, name: `i${i}`, tagIds: [t.id] } });
    }
  });

  const kits = async (where: unknown) =>
    (await client.db.RoKit.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((k) => k.name);
  const owners = async (where: unknown) =>
    (await client.db.RoOwner.findMany({ where: loose(where), orderBy: { label: 'asc' } })).map((o) => o.label);
  const items = async (where: unknown) =>
    (await client.db.RoItem.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((i) => i.name);

  describe.each(Object.entries(KINDS))('%s', (_name, kind) => {
    const f = kind.field;
    const [a, b, c] = kind.ops;

    // operator filters and the ranks (0, 1, 2) they select, in the string form
    const cases: [string, (v: (s: string) => unknown) => unknown, number[]][] = [
      ['shorthand', (v) => v(b), [1]],
      ['eq', (v) => ({ eq: v(b) }), [1]],
      ['neq', (v) => ({ neq: v(b) }), [0, 2]],
      ['gt', (v) => ({ gt: v(a) }), [1, 2]],
      ['gte', (v) => ({ gte: v(b) }), [1, 2]],
      ['lt', (v) => ({ lt: v(b) }), [0]],
      ['lte', (v) => ({ lte: v(b) }), [0, 1]],
      ['in', (v) => ({ in: [v(a), v(c)] }), [0, 2]],
      ['notIn', (v) => ({ notIn: [v(a), v(c)] }), [1]],
      ['between', (v) => ({ between: [v(a), v(b)] }), [0, 1]],
    ];
    const names = (prefix: string, ranks: number[]) => ranks.map((r) => `${prefix}${r}`);

    describe('destructive writes', () => {
      test('deleteMany through a forward sub-filter deletes the rows the typed value deletes', async () => {
        const n = await client.db.RoKit.deleteMany({ where: loose({ owner: { [f]: { gt: kind.ops[0] } } }) });
        expect(n).toBe(2);
        expect(await kits({})).toEqual(['k0']);
      });

      test('deleteMany with a wrapper operand deletes the same rows', async () => {
        await client.db.RoKit.deleteMany({ where: loose({ owner: { [f]: { gt: kind.wrap(a) } } }) });
        expect(await kits({})).toEqual(['k0']);
      });

      test('updateMany through a reverse some sub-filter updates exactly the matching owners', async () => {
        await client.db.RoOwner.updateMany({
          where: loose({ kits: { some: { owner: { [f]: { lte: b } } } } }),
          data: { label: 'hit' },
        });
        expect((await client.db.RoOwner.findMany({ orderBy: { id: 'asc' } })).map((o) => o.label)).toEqual([
          'hit',
          'hit',
          'o2',
        ]);
      });

      test('deleteMany through an array foreign key sub-filter deletes the matching items', async () => {
        await client.db.RoItem.deleteMany({ where: loose({ tags: { some: { [f]: { neq: b } } } }) });
        expect(await items({})).toEqual(['i1']);
      });
    });

    describe.each([
      ['string', (s: string) => s],
      ['wrapper', (s: string) => kind.wrap(s)],
    ])('findMany with a %s operand', (_form, v) => {
      test.each(cases)('forward to-one %s', async (_op, build, ranks) => {
        expect(await kits({ owner: { [f]: build(v) } })).toEqual(names('k', ranks));
      });

      test.each(cases)('forward to-one %s matches the typed top-level where', async (_op, build, ranks) => {
        expect(await owners({ [f]: build(v) })).toEqual(names('o', ranks));
      });

      test.each(cases)('reverse some %s', async (_op, build, ranks) => {
        expect(await owners({ kits: { some: { owner: { [f]: build(v) } } } })).toEqual(names('o', ranks));
      });

      test.each(cases)('array foreign key some %s', async (_op, build, ranks) => {
        expect(await items({ tags: { some: { [f]: build(v) } } })).toEqual(names('i', ranks));
      });
    });

    test('reverse every and none honour the converted operand', async () => {
      // Each owner has one kit, so every(x) selects the owners x selects and none(x) the rest
      expect(await owners({ kits: { every: { owner: { [f]: { gt: a } } } } })).toEqual(['o1', 'o2']);
      expect(await owners({ kits: { none: { owner: { [f]: { gt: a } } } } })).toEqual(['o0']);
      expect(await items({ tags: { every: { [f]: { gt: a } } } })).toEqual(['i1', 'i2']);
      expect(await items({ tags: { none: { [f]: { gt: a } } } })).toEqual(['i0']);
    });
  });

  describe('id and foreign key operands', () => {
    test('deleteMany with a neq id string through a forward sub-filter spares the named owner only', async () => {
      await client.db.RoKit.deleteMany({ where: loose({ owner: { id: { neq: 'o1' } } }) });
      expect(await kits({})).toEqual(['k1']);
    });

    test.each([
      ['shorthand', 'o1', ['k1']],
      ['eq', { eq: 'o1' }, ['k1']],
      ['neq', { neq: 'o1' }, ['k0', 'k2']],
      ['in', { in: ['o0', 'o2'] }, ['k0', 'k2']],
      ['notIn', { notIn: ['o0', 'o2'] }, ['k1']],
    ])('forward owner.id %s', async (_op, filter, expected) => {
      expect(await kits({ owner: { id: filter } })).toEqual(expected);
    });

    test.each([
      ['eq', { eq: 'o1' }, ['o1']],
      ['neq', { neq: 'o1' }, ['o0', 'o2']],
      ['in', { in: ['o0', 'o2'] }, ['o0', 'o2']],
    ])('kits.some.ownerId %s', async (_op, filter, expected) => {
      expect(await owners({ kits: { some: { ownerId: filter } } })).toEqual(expected);
    });

    test('kits.some.id neq selects owners with another kit', async () => {
      expect(await owners({ kits: { some: { id: { neq: 'k1' } } } })).toEqual(['o0', 'o2']);
    });
  });

  describe('invalid operands stay refused', () => {
    test('an unparseable duration is refused and no row is touched', async () => {
      await expect(
        (async () => {
          await client.db.RoKit.deleteMany({ where: loose({ owner: { du: { gt: 'not-a-duration' } } }) });
        })(),
      ).rejects.toThrow('Field "du" is duration');
      expect(await kits({})).toEqual(['k0', 'k1', 'k2']);
    });

    test('an unparseable duration at the top level is refused naming the field, rows untouched', async () => {
      await expect(
        (async () => {
          await client.db.RoOwner.deleteMany({ where: loose({ du: { gt: 'abc' } }) });
        })(),
      ).rejects.toThrow('Field "du" is duration');
      expect(await owners({})).toEqual(['o0', 'o1', 'o2']);
    });

    test('an unparseable duration through a reverse sub-filter is refused naming the field', async () => {
      await expect(
        (async () => {
          await client.db.RoOwner.updateMany({
            where: loose({ kits: { some: { owner: { du: { in: ['abc'] } } } } }),
            data: { label: 'hit' },
          });
        })(),
      ).rejects.toThrow('Field "du[0]" is duration');
      expect(await owners({})).toEqual(['o0', 'o1', 'o2']);
    });

    test('an unparseable uuid is refused and no row is touched', async () => {
      await expect(
        (async () => {
          await client.db.RoKit.deleteMany({ where: loose({ owner: { uu: 'nope' } }) });
        })(),
      ).rejects.toThrow();
      expect(await kits({})).toEqual(['k0', 'k1', 'k2']);
    });
  });
});
