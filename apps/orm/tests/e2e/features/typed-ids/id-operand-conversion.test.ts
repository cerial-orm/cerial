/**
 * E2E Typed IDs: an id operand is converted the way create builds the id
 *
 * A Record(uuid) id handed back by the API as a string selects the row whose Uuid key it names, so
 * neq, NOT and notIn on it keep the named row. An array where one id is required is refused naming the
 * field instead of being read as a list of ids, on every typed id kind.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const loose = (value: unknown): never => value as never;

// A refusal can throw while the query is built, so the call runs inside an async function
const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

describe('E2E Typed IDs: id operand conversion', () => {
  let client: CerialClient;
  let ids: string[];

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.typedIds);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.typedIds);
    ids = [];
    for (const data of ['a', 'b', 'c']) {
      const row = await client.db.UuidIdModel.create({ data: { data } });
      ids.push(String(row.id.id));
    }
  });

  const remaining = async () => (await client.db.UuidIdModel.findMany({ orderBy: { data: 'asc' } })).map((r) => r.data);

  describe('Record(uuid) id given as the string the API returns', () => {
    test('deleteMany neq keeps exactly the named row', async () => {
      const n = await client.db.UuidIdModel.deleteMany({ where: { id: { neq: ids[0]! } } });
      expect(n).toBe(2);
      expect(await remaining()).toEqual(['a']);
    });

    test('deleteMany NOT keeps exactly the named row', async () => {
      await client.db.UuidIdModel.deleteMany({ where: { NOT: { id: ids[1]! } } });
      expect(await remaining()).toEqual(['b']);
    });

    test('deleteMany notIn keeps the listed rows', async () => {
      await client.db.UuidIdModel.deleteMany({ where: { id: { notIn: [ids[0]!, ids[2]!] } } });
      expect(await remaining()).toEqual(['a', 'c']);
    });

    test('deleteMany NOT in keeps the listed rows', async () => {
      await client.db.UuidIdModel.deleteMany({ where: { NOT: { id: { in: [ids[0]!, ids[1]!] } } } });
      expect(await remaining()).toEqual(['a', 'b']);
    });

    test('updateMany changes only the rows other than the named one', async () => {
      await client.db.UuidIdModel.updateMany({ where: { id: { neq: ids[0]! } }, data: { data: 'hit' } });
      expect(await remaining()).toEqual(['a', 'hit', 'hit']);
    });

    test('a transaction applies the same conversion', async () => {
      await client.$transaction([client.db.UuidIdModel.deleteMany({ where: { id: { neq: ids[0]! } } })]);
      expect(await remaining()).toEqual(['a']);
    });

    test.each([
      ['shorthand', (s: string) => s],
      ['eq', (s: string) => ({ eq: s })],
      ['in', (s: string) => ({ in: [s] })],
    ])('findMany %s selects the row', async (_op, build) => {
      const found = await client.db.UuidIdModel.findMany({ where: loose({ id: build(ids[2]!) }) });
      expect(found.map((r) => r.data)).toEqual(['c']);
    });

    test('the CerialId the client returned selects the same rows', async () => {
      const row = (await client.db.UuidIdModel.findMany({ orderBy: { data: 'asc' } }))[0]!;
      const n = await client.db.UuidIdModel.deleteMany({ where: { id: { neq: row.id } } });
      expect(n).toBe(2);
    });

    test('a string that is not a uuid is refused and nothing is deleted', async () => {
      await refuses(() => client.db.UuidIdModel.deleteMany({ where: loose({ id: { neq: 'nope' } }) }), /id/);
      expect(await remaining()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('an array where one id is required is refused naming the field', () => {
    test.each([{ neq: ['k'] }, { eq: ['k'] }, { not: ['k'] }, ['k']])('uuid id %j', async (filter) => {
      await refuses(() => client.db.UuidIdModel.deleteMany({ where: loose({ NOT: { id: filter } }) }), /id/);
      await refuses(() => client.db.UuidIdModel.deleteMany({ where: loose({ id: filter }) }), /id/);
      expect(await remaining()).toEqual(['a', 'b', 'c']);
    });

    test('int, string and union ids', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'one' } });
      await client.db.StringIdModel.create({ data: { id: 'k', payload: 'p' } });
      await client.db.UnionIdModel.create({ data: { id: 'k', label: 'l' } });
      await client.db.UnionIdModel.create({ data: { id: 5, label: 'five' } });

      for (const model of [client.db.IntIdModel, client.db.StringIdModel, client.db.UnionIdModel]) {
        for (const filter of [{ neq: ['k'] }, { eq: [1] }, ['k']]) {
          await refuses(
            () =>
              (model as unknown as { deleteMany: (a: unknown) => Promise<number> }).deleteMany({
                where: { NOT: { id: filter } },
              }),
            /id/,
          );
        }
      }
      expect(await client.db.IntIdModel.count()).toBe(1);
      expect(await client.db.StringIdModel.count()).toBe(1);
      expect(await client.db.UnionIdModel.count()).toBe(2);
    });

    test('a foreign key to an int id', async () => {
      const parent = await client.db.FkTargetIntId.create({ data: { id: 1, label: 'p' } });
      await client.db.FkChildModel.create({ data: { parentId: parent.id, note: 'n' } });
      await refuses(
        () => client.db.FkChildModel.deleteMany({ where: loose({ NOT: { parentId: { neq: ['x'] } } }) }),
        /parentId/,
      );
      await refuses(() => client.db.FkChildModel.deleteMany({ where: loose({ parentId: ['x'] }) }), /parentId/);
      expect(await client.db.FkChildModel.count()).toBe(1);
    });
  });

  describe('every typed id kind still selects its row', () => {
    test('int, string and union ids keep their key types apart', async () => {
      await client.db.IntIdModel.create({ data: { id: 1, name: 'one' } });
      await client.db.IntIdModel.create({ data: { id: 2, name: 'two' } });
      expect((await client.db.IntIdModel.findMany({ where: { id: { neq: 1 } } })).map((r) => r.name)).toEqual(['two']);

      await client.db.StringIdModel.create({ data: { id: 'a', payload: 'pa' } });
      await client.db.StringIdModel.create({ data: { id: 'b', payload: 'pb' } });
      expect(
        (await client.db.StringIdModel.findMany({ where: { id: { notIn: ['a'] } } })).map((r) => r.payload),
      ).toEqual(['pb']);

      await client.db.UnionIdModel.create({ data: { id: '5', label: 'string five' } });
      await client.db.UnionIdModel.create({ data: { id: 5, label: 'int five' } });
      expect((await client.db.UnionIdModel.findMany({ where: { id: 5 } })).map((r) => r.label)).toEqual(['int five']);
      expect((await client.db.UnionIdModel.findMany({ where: { id: '5' } })).map((r) => r.label)).toEqual([
        'string five',
      ]);
      expect((await client.db.UnionIdModel.findMany({ where: { id: { neq: 5 } } })).map((r) => r.label)).toEqual([
        'string five',
      ]);
    });

    test('a tuple id is one array-typed id, not a list', async () => {
      await client.db.TupleIdModel.create({ data: { id: [1, 2], city: 'x' } });
      await client.db.TupleIdModel.create({ data: { id: [3, 4], city: 'y' } });
      const found = await client.db.TupleIdModel.findMany({ where: loose({ id: { neq: [1, 2] } }) });
      expect(found.map((r) => r.city)).toEqual(['y']);
      const listed = await client.db.TupleIdModel.findMany({ where: loose({ id: { in: [[1, 2]] } }) });
      expect(listed.map((r) => r.city)).toEqual(['x']);
    });

    test('an int-or-uuid union takes a uuid string as a Uuid key', async () => {
      const row = await client.db.IntUnionIdModel.create({ data: { id: 7, label: 'seven' } });
      expect(row.label).toBe('seven');
      const found = await client.db.IntUnionIdModel.findMany({ where: { id: { neq: 8 } } });
      expect(found).toHaveLength(1);
    });
  });
});
