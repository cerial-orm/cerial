import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  MULTI_LEVEL_TABLES,
  OBJECT_TABLES,
  TUPLE_TABLES,
  testConfig,
  truncateTables,
} from './helpers';

describe('E2E Extends: pick and omit by name, and filter chains', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...OBJECT_TABLES, ...TUPLE_TABLES, ...MULTI_LEVEL_TABLES]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...OBJECT_TABLES, ...TUPLE_TABLES, ...MULTI_LEVEL_TABLES]);
  });

  describe('tuple filters naming an element', () => {
    test('pick by name keeps only that element', async () => {
      const result = await client.db.ExtTupleByName.create({ data: { picked: ['Ann'], omitted: ['Bob'] } });

      expect(result.picked).toEqual(['Ann']);
    });

    test('omit by name keeps the others', async () => {
      const result = await client.db.ExtTupleByName.create({ data: { picked: ['Ann'], omitted: ['Bob'] } });

      expect(result.omitted).toEqual(['Bob']);
    });

    test('the omitted element cannot be supplied', async () => {
      await expect(
        (async () => {
          await client.db.ExtTupleByName.create({ data: { picked: ['Ann'], omitted: ['Bob', 30] } });
        })(),
      ).rejects.toThrow();
    });
  });

  describe('object filter chains', () => {
    test("pick then omit: the child keeps the parent's picked fields minus the omitted one", async () => {
      const result = await client.db.ExtChainModel.create({
        data: { pickThenOmit: { a: 'a', b: 'b', q: 'q' }, omitThenPick: { q: 'q' } },
      });

      expect(result.pickThenOmit).toEqual({ a: 'a', b: 'b', q: 'q' });
    });

    test('omit then pick: the child keeps only the picked field plus its own', async () => {
      const result = await client.db.ExtChainModel.create({
        data: { pickThenOmit: { a: 'a', b: 'b', q: 'q' }, omitThenPick: { q: 'q', r: 'r' } },
      });

      expect(result.omitThenPick).toEqual({ q: 'q', r: 'r' });
    });

    test('a field removed by the second filter is rejected', async () => {
      await expect(
        (async () => {
          await client.db.ExtChainModel.create({
            // @ts-expect-error p was omitted by the child
            data: { pickThenOmit: { a: 'a', b: 'b', p: 'p', q: 'q' }, omitThenPick: { q: 'q' } },
          });
        })(),
      ).rejects.toThrow();
      expect(await client.db.ExtChainModel.count()).toBe(0);
    });

    test('a field dropped by the first filter and one by the second never reappear', async () => {
      await expect(
        (async () => {
          await client.db.ExtChainModel.create({
            // @ts-expect-error c and a are not part of the picked set
            data: { pickThenOmit: { a: 'a', b: 'b', q: 'q' }, omitThenPick: { a: 'a', c: 'c', q: 'q' } },
          });
        })(),
      ).rejects.toThrow();
    });
  });

  describe('four-level model chain (pick, omit, own fields)', () => {
    test("keeps the picked fields, drops the omitted one and adds each level's own", async () => {
      const result = await client.db.ExtP4Concrete.create({
        data: { secret: 's', name: 'n', tag: 't', extra: 'e', final: 'f' },
      });

      expect(result.name).toBe('n');
      expect(result.tag).toBe('t');
      expect(result.extra).toBe('e');
      expect(result.final).toBe('f');
      expect(result.level).toBe(1);
    });

    test('a field dropped by the first pick is absent from the result', async () => {
      const result = await client.db.ExtP4Concrete.create({ data: { secret: 's', name: 'n', tag: 't' } });

      expect('note' in result).toBe(false);
    });

    test('a field dropped by a later omit is absent from the result', async () => {
      const result = await client.db.ExtP4Concrete.create({ data: { secret: 's', name: 'n', tag: 't' } });

      expect('spare' in result).toBe(false);
    });

    test('!!private fields from the root stay hidden at the fourth level', async () => {
      const result = await client.db.ExtP4Concrete.create({ data: { secret: 's', name: 'n', tag: 't' } });
      const found = await client.db.ExtP4Concrete.findOne({ where: { id: result.id } });

      expect(found?.name).toBe('n');
      expect(found?.level).toBe(1);
    });

    test('the omitted field is rejected on create', async () => {
      await expect(
        (async () => {
          await client.db.ExtP4Concrete.create({
            // @ts-expect-error spare was omitted at the third level
            data: { secret: 's', name: 'n', tag: 't', spare: 'x' },
          });
        })(),
      ).rejects.toThrow();
      expect(await client.db.ExtP4Concrete.count()).toBe(0);
    });
  });
});
