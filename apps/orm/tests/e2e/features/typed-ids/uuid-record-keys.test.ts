/**
 * E2E Typed IDs: a uuid string and a StringRecordId name the row the database holds
 *
 * A uuid string given as the id of a Record(uuid) model is stored as a Uuid key, so the unique lookups find
 * the row by that same string. A StringRecordId is read by the server, so `int_id_model:7` is the int 7.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { StringRecordId } from 'surrealdb';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const loose = (value: unknown): never => value as never;
const U = '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d';
const U2 = '0190c3f8-6c5d-7a3a-9d3a-000000000002';

describe('E2E Typed IDs: record keys', () => {
  let client: CerialClient;

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
  });

  describe('a Record(uuid) id given as a string', () => {
    beforeEach(async () => {
      await client.db.UuidIdModel.create({ data: loose({ id: U, data: 'a' }) });
      await client.db.UuidIdModel.create({ data: loose({ id: U2, data: 'b' }) });
    });

    test('create stores a Uuid key, found by the same string', async () => {
      expect(await client.db.UuidIdModel.count(loose({ id: U }))).toBe(1);
      expect(await client.db.UuidIdModel.count(loose({ NOT: { id: U } }))).toBe(1);
    });

    test('findUnique finds the row', async () => {
      expect((await client.db.UuidIdModel.findUnique({ where: loose({ id: U }) }))?.data).toBe('a');
    });

    test('updateUnique changes only that row', async () => {
      const updated = await client.db.UuidIdModel.updateUnique({ where: loose({ id: U }), data: { data: 'hit' } });
      expect(updated?.data).toBe('hit');
      expect((await client.db.UuidIdModel.findUnique({ where: loose({ id: U2 }) }))?.data).toBe('b');
    });

    test('deleteUnique removes only that row', async () => {
      expect(await client.db.UuidIdModel.deleteUnique({ where: loose({ id: U }) })).toBe(true);
      expect((await client.db.UuidIdModel.findMany()).map((r) => r.data)).toEqual(['b']);
    });

    test('a string that is not a uuid is refused naming the id and removes nothing', async () => {
      await expect(
        (async () => {
          await client.db.UuidIdModel.deleteUnique({ where: loose({ id: 'nope' }) });
        })(),
      ).rejects.toThrow(/id/);
      expect(await client.db.UuidIdModel.count()).toBe(2);
    });
  });

  describe('a StringRecordId on an int id', () => {
    beforeEach(async () => {
      for (const id of [7, 8]) await client.db.IntIdModel.create({ data: { id, name: `n${id}` } });
    });

    test('where reads the key the way the server does', async () => {
      const sid = new StringRecordId('int_id_model:7');
      expect((await client.db.IntIdModel.findMany({ where: loose({ id: sid }) })).map((r) => r.name)).toEqual(['n7']);
      expect(await client.db.IntIdModel.count(loose({ NOT: { id: sid } }))).toBe(1);
    });

    test('create stores the int the server reads', async () => {
      const row = await client.db.IntIdModel.create({
        data: loose({ id: new StringRecordId('int_id_model:9'), name: 'n9' }),
      });
      expect(row.id.id).toBe(9);
    });

    test('another table is refused and nothing is created', async () => {
      await expect(
        (async () => {
          await client.db.IntIdModel.create({ data: loose({ id: new StringRecordId('other:9'), name: 'x' }) });
        })(),
      ).rejects.toThrow(/does not match/);
      expect(await client.db.IntIdModel.count()).toBe(2);
    });
  });
});
