/**
 * E2E Date: string operands in where
 *
 * A valid date string given to a Date filter converts to a Date as it does on create, so it selects the
 * rows the equivalent Date selects. An unparseable string is refused and no row is touched.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';

// A string date is what a JavaScript or cast caller can send; the generated types accept a Date only
const hostile = (value: unknown): never => value as never;

const TABLES = ['user', 'obj_dec_user', 'tuple_stamped'];

const JAN_2021 = '2021-01-01';
const JUN_2021 = '2021-06-01';
const JAN_2022 = '2022-01-01';
const STAMPS = [JAN_2021, JUN_2021, JAN_2022];

describe('E2E Date: string operands in where', () => {
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
    for (const [i, stamp] of STAMPS.entries()) {
      const at = new Date(stamp);
      await client.db.User.create({
        data: {
          email: `u${i}@x.co`,
          name: `u${i}`,
          isActive: true,
          createdAt: at,
          loginDates: [at],
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: `o${i}`,
          contact: { email: `o${i}@x.co`, tags: [], createdAt: at },
          location: { address: 'a', zip: String(i), country: 'US' },
        },
      });
      await client.db.TupleStamped.create({ data: { name: `t${i}`, stamp: ['x', at, at, 1] } });
    }
  });

  const userNames = async (where: Record<string, unknown>) =>
    (await client.db.User.findMany({ where: hostile(where), orderBy: { name: 'asc' } })).map((u) => u.name);

  describe('destructive writes', () => {
    test('deleteMany with a string bound deletes exactly the rows a Date deletes', async () => {
      const deleted = await client.db.User.deleteMany({ where: hostile({ createdAt: { gte: JUN_2021 } }) });
      expect(deleted).toBe(2);
      expect(await userNames({})).toEqual(['u0']);
    });

    test('deleteMany with a Date bound deletes the same rows (control)', async () => {
      await client.db.User.deleteMany({ where: { createdAt: { gte: new Date(JUN_2021) } } });
      expect(await userNames({})).toEqual(['u0']);
    });

    test('updateMany with a string bound updates exactly the rows a Date updates', async () => {
      await client.db.User.updateMany({ where: hostile({ createdAt: { lt: JUN_2021 } }), data: { name: 'early' } });
      expect(await userNames({})).toEqual(['early', 'u1', 'u2']);
    });

    test('deleteMany on a nested object date', async () => {
      await client.db.ObjDecUser.deleteMany({ where: hostile({ contact: { createdAt: { gt: JAN_2021 } } }) });
      expect((await client.db.ObjDecUser.findMany()).map((u) => u.name)).toEqual(['o0']);
    });

    test('deleteMany on a tuple element date', async () => {
      await client.db.TupleStamped.deleteMany({ where: hostile({ stamp: { born: { gt: JAN_2021 } } }) });
      expect((await client.db.TupleStamped.findMany()).map((u) => u.name)).toEqual(['t0']);
    });

    test('an unparseable string is refused on deleteMany and updateMany, and every row survives', async () => {
      await expect(
        (async () => {
          await client.db.User.deleteMany({ where: hostile({ createdAt: { gte: 'not-a-date' } }) });
        })(),
      ).rejects.toThrow(/createdAt/);
      await expect(
        (async () => {
          await client.db.User.updateMany({ where: hostile({ createdAt: 'nope' }), data: { name: 'x' } });
        })(),
      ).rejects.toThrow(/createdAt/);
      expect(await userNames({})).toEqual(['u0', 'u1', 'u2']);
    });
  });

  describe('findMany parity with a Date operand', () => {
    const cases: [string, (v: string | Date) => Record<string, unknown>, string[]][] = [
      ['shorthand', (v) => ({ createdAt: v }), ['u1']],
      ['eq', (v) => ({ createdAt: { eq: v } }), ['u1']],
      ['neq', (v) => ({ createdAt: { neq: v } }), ['u0', 'u2']],
      ['not', (v) => ({ createdAt: { not: v } }), ['u0', 'u2']],
      ['gt', (v) => ({ createdAt: { gt: v } }), ['u2']],
      ['gte', (v) => ({ createdAt: { gte: v } }), ['u1', 'u2']],
      ['lt', (v) => ({ createdAt: { lt: v } }), ['u0']],
      ['lte', (v) => ({ createdAt: { lte: v } }), ['u0', 'u1']],
      ['in', (v) => ({ createdAt: { in: [v] } }), ['u1']],
      ['notIn', (v) => ({ createdAt: { notIn: [v] } }), ['u0', 'u2']],
      ['between', (v) => ({ createdAt: { between: [v, new Date(JAN_2022)] } }), ['u1', 'u2']],
      ['array has', (v) => ({ loginDates: { has: v } }), ['u1']],
      ['array hasAny', (v) => ({ loginDates: { hasAny: [v] } }), ['u1']],
      ['array hasAll', (v) => ({ loginDates: { hasAll: [v] } }), ['u1']],
    ];

    for (const [name, build, expected] of cases) {
      test(`${name}: string selects what a Date selects`, async () => {
        expect(await userNames(build(new Date(JUN_2021)))).toEqual(expected);
        expect(await userNames(build(JUN_2021))).toEqual(expected);
      });
    }

    test('a string in AND/OR/NOT combinations', async () => {
      expect(await userNames({ OR: [{ createdAt: JAN_2021 }, { createdAt: { gt: JUN_2021 } }] })).toEqual(['u0', 'u2']);
      expect(await userNames({ NOT: { createdAt: { lte: JUN_2021 } } })).toEqual(['u2']);
    });

    test('between with two strings', async () => {
      expect(await userNames({ createdAt: { between: [JAN_2021, JUN_2021] } })).toEqual(['u0', 'u1']);
    });
  });

  describe('nested paths', () => {
    test('object sub-field operators', async () => {
      const find = async (v: string | Date) =>
        (
          await client.db.ObjDecUser.findMany({
            where: hostile({ contact: { createdAt: { gte: v } } }),
            orderBy: { name: 'asc' },
          })
        ).map((u) => u.name);
      expect(await find(JUN_2021)).toEqual(await find(new Date(JUN_2021)));
      expect(await find(JUN_2021)).toEqual(['o1', 'o2']);
    });

    test('object sub-field shorthand', async () => {
      const found = await client.db.ObjDecUser.findMany({ where: hostile({ contact: { createdAt: JUN_2021 } }) });
      expect(found.map((u) => u.name)).toEqual(['o1']);
    });

    test('tuple element by name and by index', async () => {
      const byName = await client.db.TupleStamped.findMany({ where: hostile({ stamp: { born: { gte: JUN_2021 } } }) });
      const byIndex = await client.db.TupleStamped.findMany({ where: hostile({ stamp: { 1: { gte: JUN_2021 } } }) });
      expect(byName.map((t) => t.name).sort()).toEqual(['t1', 't2']);
      expect(byIndex.map((t) => t.name).sort()).toEqual(['t1', 't2']);
    });
  });

  describe('unparseable strings', () => {
    test('findMany refuses on every operator and names the field', async () => {
      const bad = 'not-a-date';
      const wheres: Record<string, unknown>[] = [
        { createdAt: bad },
        { createdAt: { gt: bad } },
        { createdAt: { in: [JAN_2021, bad] } },
        { createdAt: { between: [JAN_2021, bad] } },
        { loginDates: { has: bad } },
      ];
      for (const where of wheres) {
        const query = async () => {
          await client.db.User.findMany({ where: hostile(where) });
        };
        await expect(query()).rejects.toThrow(/createdAt|loginDates/);
      }
    });

    test('nested object and tuple paths refuse', async () => {
      await expect(
        (async () => {
          await client.db.ObjDecUser.deleteMany({ where: hostile({ contact: { createdAt: { gt: 'bad' } } }) });
        })(),
      ).rejects.toThrow(/createdAt/);
      await expect(
        (async () => {
          await client.db.TupleStamped.deleteMany({ where: hostile({ stamp: { born: 'bad' } }) });
        })(),
      ).rejects.toThrow(/born/);
      expect(await client.db.ObjDecUser.findMany()).toHaveLength(3);
      expect(await client.db.TupleStamped.findMany()).toHaveLength(3);
    });
  });
});
