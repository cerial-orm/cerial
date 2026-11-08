/**
 * E2E pins for the documented results of the write paths: a missing record,
 * single and multiple matches, an unmatchable where, a failed create and a
 * union id given or omitted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('E2E write path results', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.core, ...tables.typedIds]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...tables.core, ...tables.typedIds]);
  });

  describe('missing record', () => {
    test('updateUnique returns null and creates nothing', async () => {
      const result = await client.db.User.updateUnique({
        where: { email: 'ghost@test.com' },
        data: { name: 'Ghost' },
      });

      expect(result).toBeNull();
      expect(await client.db.User.count()).toBe(0);
    });

    test('updateUnique leaves other records untouched', async () => {
      await client.db.User.create({ data: { name: 'Keep', email: 'keep@test.com', isActive: true } });

      const result = await client.db.User.updateUnique({
        where: { email: 'ghost@test.com' },
        data: { name: 'Changed' },
      });

      expect(result).toBeNull();
      const kept = await client.db.User.findUnique({ where: { email: 'keep@test.com' } });
      expect(kept?.name).toBe('Keep');
    });

    test('updateUnique with return before and after is null on a miss', async () => {
      const before = await client.db.User.updateUnique({
        where: { email: 'ghost@test.com' },
        data: { name: 'Ghost' },
        return: 'before',
      });
      const after = await client.db.User.updateUnique({
        where: { email: 'ghost@test.com' },
        data: { name: 'Ghost' },
        return: 'after',
      });

      expect(before).toBeNull();
      expect(after).toBeNull();
    });

    test('deleteUnique returns true, or null with return before, and removes nothing else', async () => {
      await client.db.User.create({ data: { name: 'Keep', email: 'keep@test.com', isActive: true } });

      const result = await client.db.User.deleteUnique({ where: { email: 'ghost@test.com' } });
      const before = await client.db.User.deleteUnique({ where: { email: 'ghost@test.com' }, return: 'before' });

      expect(result).toBe(true);
      expect(before).toBeNull();
      expect(await client.db.User.count()).toBe(1);
    });

    test('findUnique returns null', async () => {
      expect(await client.db.User.findUnique({ where: { email: 'ghost@test.com' } })).toBeNull();
    });

    test('a hit still returns the record (positive pair)', async () => {
      await client.db.User.create({ data: { name: 'Hit', email: 'hit@test.com', isActive: true } });

      const found = await client.db.User.findUnique({ where: { email: 'hit@test.com' } });
      const updated = await client.db.User.updateUnique({ where: { email: 'hit@test.com' }, data: { name: 'Hit 2' } });
      const deleted = await client.db.User.deleteUnique({ where: { email: 'hit@test.com' } });

      expect(found?.name).toBe('Hit');
      expect(updated?.name).toBe('Hit 2');
      expect(deleted).toBe(true);
      expect(await client.db.User.count()).toBe(0);
    });
  });

  describe('upsert', () => {
    test('a unique where with no match creates exactly one row', async () => {
      await client.db.User.upsert({
        where: { email: 'new@test.com' },
        create: { name: 'New', email: 'new@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(await client.db.User.count()).toBe(1);
    });

    test('a non-unique where with two matches updates exactly one and creates none', async () => {
      await client.db.User.create({ data: { name: 'A', email: 'a@test.com', isActive: true } });
      await client.db.User.create({ data: { name: 'B', email: 'b@test.com', isActive: true } });

      const result = await client.db.User.upsert({
        where: { isActive: true },
        create: { name: 'Created', email: 'c@test.com', isActive: true },
        update: { name: 'Both' },
      });

      expect(result.length).toBe(1);
      expect(await client.db.User.count()).toBe(2);
      expect(await client.db.User.count({ name: 'Both' })).toBe(1);
    });

    test('a where no row can match creates one row', async () => {
      const result = await client.db.User.upsert({
        where: { AND: [{ isActive: true }, { isActive: false }] },
        create: { name: 'Impossible', email: 'imp@test.com', isActive: true },
        update: { name: 'Updated' },
      });

      expect(result.length).toBe(1);
      expect(result[0]!.name).toBe('Impossible');
      expect(await client.db.User.count()).toBe(1);
    });

    test('a create that fails validation stores nothing and rejects', async () => {
      await expect(
        (async () => {
          await client.db.User.upsert({
            where: { isActive: true },
            // @ts-expect-error - Testing runtime validation: missing required 'isActive' field
            create: { name: 'Bad', email: 'bad@test.com' },
            update: { name: 'Updated' },
          });
        })(),
      ).rejects.toThrow();
      expect(await client.db.User.count()).toBe(0);
    });

    test('an id-based upsert on a missing id creates it, and updates it the second time', async () => {
      const first = await client.db.User.upsert({
        where: { id: 'fixed-id' },
        create: { name: 'First', email: 'fixed@test.com', isActive: true },
        update: { name: 'Second' },
      });
      const second = await client.db.User.upsert({
        where: { id: 'fixed-id' },
        create: { name: 'First', email: 'fixed@test.com', isActive: true },
        update: { name: 'Second' },
      });

      expect(first?.name).toBe('First');
      expect(second?.name).toBe('Second');
      expect(await client.db.User.count()).toBe(1);
    });
  });

  describe('union id', () => {
    test('create without an id rejects and stores nothing', async () => {
      await expect(
        (async () => {
          // @ts-expect-error - id is required for union ids
          await client.db.UnionIdModel.create({ data: { label: 'no-id' } });
        })(),
      ).rejects.toThrow();
      expect(await client.db.UnionIdModel.count()).toBe(0);
    });

    test('create with an id of either member succeeds', async () => {
      await client.db.UnionIdModel.create({ data: { id: 'abc', label: 'string member' } });
      await client.db.UnionIdModel.create({ data: { id: 7, label: 'int member' } });

      expect(await client.db.UnionIdModel.count()).toBe(2);
    });

    test('updateUnique and deleteUnique (return before) on a missing union id return null', async () => {
      const updated = await client.db.UnionIdModel.updateUnique({ where: { id: 'ghost' }, data: { label: 'x' } });
      const deleted = await client.db.UnionIdModel.deleteUnique({ where: { id: 99 }, return: 'before' });

      expect(updated).toBeNull();
      expect(deleted).toBeNull();
      expect(await client.db.UnionIdModel.count()).toBe(0);
    });

    test('upsert by an explicit union id creates then updates', async () => {
      await client.db.UnionIdModel.upsert({
        where: { id: 'u1' },
        create: { id: 'u1', label: 'created' },
        update: { label: 'updated' },
      });
      const second = await client.db.UnionIdModel.upsert({
        where: { id: 'u1' },
        create: { id: 'u1', label: 'created' },
        update: { label: 'updated' },
      });

      expect(second?.label).toBe('updated');
      expect(await client.db.UnionIdModel.count()).toBe(1);
    });
  });
});
