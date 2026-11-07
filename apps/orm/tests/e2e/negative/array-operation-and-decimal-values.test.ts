/**
 * E2E Tests: array update operators validate values against the element type, and a Decimal
 * accepts only what parses in full — negative and near-miss cases
 *
 * Schemas: test-basics.cerial (User.scores Int[], User.nicknames String[]) and decimal.cerial
 * (DecimalBasic.price Decimal, DecimalBasic.amounts Decimal[])
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const ALL_TABLES = [...tables.core, ...tables.decimal];

describe('Array operator and Decimal values — negative cases', () => {
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

  const user = { email: 'a@example.com', name: 'A', isActive: true, scores: [1, 2, 3], nicknames: ['x'] };

  describe('array operators', () => {
    test('unset of a fraction is refused and the array is unchanged', async () => {
      const created = await client.db.User.create({ data: user });

      expect(() => {
        client.db.User.updateUnique({
          where: { id: created.id },
          data: { scores: { unset: 2.7 } },
        });
      }).toThrow(/scores\[0\] must be of type int/);

      expect((await client.db.User.findUnique({ where: { id: created.id } }))!.scores).toEqual([1, 2, 3]);
    });

    test('push of a date string onto Int[] is refused', async () => {
      const created = await client.db.User.create({ data: user });

      expect(() => {
        client.db.User.updateMany({
          where: { id: created.id },
          // @ts-expect-error — push value must be an int, testing runtime guard
          data: { scores: { push: '2020-01-01' } },
        });
      }).toThrow(/scores\[0\] must be of type int/);

      expect((await client.db.User.findUnique({ where: { id: created.id } }))!.scores).toEqual([1, 2, 3]);
    });

    test('push of an object onto String[] is refused', async () => {
      const created = await client.db.User.create({ data: user });

      expect(() => {
        client.db.User.updateUnique({
          where: { id: created.id },
          // @ts-expect-error — push value must be a string, testing runtime guard
          data: { nicknames: { push: { a: 1 } } },
        });
      }).toThrow(/nicknames\[0\] must be of type string/);

      expect((await client.db.User.findUnique({ where: { id: created.id } }))!.nicknames).toEqual(['x']);
    });

    test('push and unset with valid values still apply', async () => {
      const created = await client.db.User.create({ data: user });

      await client.db.User.updateUnique({ where: { id: created.id }, data: { scores: { push: 4 } } });
      await client.db.User.updateUnique({ where: { id: created.id }, data: { scores: { unset: 1 } } });
      expect((await client.db.User.findUnique({ where: { id: created.id } }))!.scores).toEqual([2, 3, 4]);
    });
  });

  describe('decimal values', () => {
    test.each(['1,5', '12abc', '', 'NaN', 'Infinity'])('create refuses the string %j', async (price) => {
      expect(() => {
        client.db.DecimalBasic.create({
          data: { name: 'bad', price, tax: null },
        });
      }).toThrow(/price must be of type decimal/);
      expect(await client.db.DecimalBasic.findMany()).toHaveLength(0);
    });

    test.each([NaN, Infinity, -Infinity])('create refuses the number %p', async (price) => {
      expect(() => {
        client.db.DecimalBasic.create({ data: { name: 'bad', price, tax: null } });
      }).toThrow(/price must be of type decimal/);
      expect(await client.db.DecimalBasic.findMany()).toHaveLength(0);
    });

    test('create refuses a bad member of a decimal array', () => {
      expect(() => {
        client.db.DecimalBasic.create({ data: { name: 'bad', price: 1, tax: null, amounts: ['1', '12abc'] } });
      }).toThrow(/amounts\[1\]/);
    });

    test('update refuses a string that would have become 0', async () => {
      const created = await client.db.DecimalBasic.create({ data: { name: 'ok', price: 5, tax: null } });

      expect(() => {
        client.db.DecimalBasic.updateUnique({ where: { id: created.id }, data: { price: '12abc' } });
      }).toThrow(/price must be of type decimal/);

      expect((await client.db.DecimalBasic.findUnique({ where: { id: created.id } }))!.price.toString()).toBe('5');
    });

    test.each(['1,5', 'NaN', ''])('a where value %j is refused', (price) => {
      expect(() => {
        client.db.DecimalBasic.findMany({ where: { price } });
      }).toThrow(/price/);
      expect(() => {
        client.db.DecimalBasic.findMany({ where: { price: { gt: price } } });
      }).toThrow(/price/);
    });

    test.each([
      ['1.5', '1.5'],
      ['-0.25', '-0.25'],
      [CerialDecimal.from('2.5'), '2.5'],
      [7, '7'],
    ])('create and filter accept %p', async (price, expected) => {
      await client.db.DecimalBasic.create({ data: { name: 'ok', price, tax: null } });

      const found = await client.db.DecimalBasic.findMany({ where: { price } });
      expect(found).toHaveLength(1);
      expect(found[0]!.price.toString()).toBe(expected);
    });
  });
});
