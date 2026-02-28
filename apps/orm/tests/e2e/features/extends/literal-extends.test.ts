import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  LITERAL_TABLES,
  testConfig,
  truncateTables,
} from './helpers';

describe('E2E Extends: Literal Inheritance', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, LITERAL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, LITERAL_TABLES);
  });

  describe('create with ExtExtendedPriority (string inherit + add)', () => {
    test('creates with inherited low value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'hello' },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.priority).toBe('low');
    });

    test('creates with inherited medium value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'medium', level: 2, status: 'inactive', broadValue: 42 },
      });

      expect(result.priority).toBe('medium');
    });

    test('creates with inherited high value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'high', level: 3, status: true, broadValue: false },
      });

      expect(result.priority).toBe('high');
    });

    test('creates with new critical value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'critical', level: 4, status: 'pending', broadValue: 'test' },
      });

      expect(result.priority).toBe('critical');
    });

    test('creates with new urgent value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'urgent', level: 5, status: false, broadValue: 100 },
      });

      expect(result.priority).toBe('urgent');
    });
  });

  describe('create with ExtExtendedLevel (numeric inherit + add)', () => {
    test('creates with inherited level 1', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'x' },
      });

      expect(result.level).toBe(1);
    });

    test('creates with inherited level 3', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 3, status: 'active', broadValue: 'x' },
      });

      expect(result.level).toBe(3);
    });

    test('creates with new level 4', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 4, status: 'active', broadValue: 'x' },
      });

      expect(result.level).toBe(4);
    });

    test('creates with new level 5', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 5, status: 'active', broadValue: 'x' },
      });

      expect(result.level).toBe(5);
    });
  });

  describe('create with ExtExtendedMixed (mixed types)', () => {
    test('creates with inherited string active', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'x' },
      });

      expect(result.status).toBe('active');
    });

    test('creates with inherited string inactive', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'inactive', broadValue: 'x' },
      });

      expect(result.status).toBe('inactive');
    });

    test('creates with inherited boolean true', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: true, broadValue: 'x' },
      });

      expect(result.status).toBe(true);
    });

    test('creates with inherited boolean false', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: false, broadValue: 'x' },
      });

      expect(result.status).toBe(false);
    });

    test('creates with new string pending', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'pending', broadValue: 'x' },
      });

      expect(result.status).toBe('pending');
    });

    test('creates with new numeric 0', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 0, broadValue: 'x' },
      });

      expect(result.status).toBe(0);
    });
  });

  describe('create with ExtExtendedBroad (broad types)', () => {
    test('creates with broad string value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'any string' },
      });

      expect(result.broadValue).toBe('any string');
    });

    test('creates with broad number value', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 42 },
      });

      expect(result.broadValue).toBe(42);
    });

    test('creates with broad boolean value (added by extends)', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: true },
      });

      expect(result.broadValue).toBe(true);
    });
  });

  describe('where filtering on inherited literal values', () => {
    test('filters by inherited priority value', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'high', level: 3, status: 'active', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'b' },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        where: { priority: 'high' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.priority).toBe('high');
    });

    test('filters by inherited level with eq operator', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 3, status: 'active', broadValue: 'b' },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        where: { level: { eq: 3 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.level).toBe(3);
    });

    test('filters level with gte operator', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 3, status: 'active', broadValue: 'b' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 5, status: 'active', broadValue: 'c' },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        where: { level: { gte: 3 } },
      });

      expect(results).toHaveLength(2);
    });

    test('filters priority with in operator', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'critical', level: 4, status: 'active', broadValue: 'b' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'high', level: 3, status: 'active', broadValue: 'c' },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        where: { priority: { in: ['critical', 'urgent'] } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.priority).toBe('critical');
    });

    test('filters by new extended value', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'urgent', level: 5, status: 'pending', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'b' },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        where: { priority: 'urgent' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.priority).toBe('urgent');
    });
  });

  describe('ExtHighPriority (optional field)', () => {
    test('creates with highPriority set', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a', highPriority: 'critical' },
      });

      expect(result.highPriority).toBe('critical');
    });

    test('creates without highPriority (optional)', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });

      expect(result.highPriority).toBeUndefined();
    });

    test('highPriority accepts inherited values', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a', highPriority: 'high' },
      });

      expect(result.highPriority).toBe('high');
    });
  });

  describe('array of extended literals', () => {
    test('creates with priorities array', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: {
          priority: 'low',
          level: 1,
          status: 'active',
          broadValue: 'a',
          priorities: ['low', 'critical', 'urgent'],
        },
      });

      expect(result.priorities).toEqual(['low', 'critical', 'urgent']);
    });

    test('creates with empty priorities array', async () => {
      const result = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });

      expect(result.priorities).toEqual([]);
    });

    test('filters array with has operator', async () => {
      await client.db.ExtLiteralModel.create({
        data: {
          priority: 'low',
          level: 1,
          status: 'active',
          broadValue: 'a',
          priorities: ['low', 'critical'],
        },
      });
      await client.db.ExtLiteralModel.create({
        data: {
          priority: 'high',
          level: 3,
          status: 'active',
          broadValue: 'b',
          priorities: ['high', 'urgent'],
        },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        where: { priorities: { has: 'critical' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.priorities).toContain('critical');
    });

    test('pushes to priorities array', async () => {
      const created = await client.db.ExtLiteralModel.create({
        data: {
          priority: 'low',
          level: 1,
          status: 'active',
          broadValue: 'a',
          priorities: ['low'],
        },
      });

      const updated = await client.db.ExtLiteralModel.updateMany({
        where: { id: created.id },
        data: { priorities: { push: 'urgent' } },
      });

      expect(updated[0]!.priorities).toContain('low');
      expect(updated[0]!.priorities).toContain('urgent');
    });
  });

  describe('object with extended literal fields (ExtLiteralContainer)', () => {
    test('creates container with literal object', async () => {
      const result = await client.db.ExtLiteralContainer.create({
        data: {
          name: 'LitContainer1',
          details: {
            priority: 'critical',
            level: 4,
            status: 'pending',
          },
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('LitContainer1');
      expect(result.details.priority).toBe('critical');
      expect(result.details.level).toBe(4);
      expect(result.details.status).toBe('pending');
    });

    test('creates container with optional status omitted', async () => {
      const result = await client.db.ExtLiteralContainer.create({
        data: {
          name: 'LitContainer2',
          details: { priority: 'low', level: 1 },
        },
      });

      expect(result.details.status).toBeUndefined();
    });

    test('creates container with detailsList array', async () => {
      const result = await client.db.ExtLiteralContainer.create({
        data: {
          name: 'LitContainer3',
          details: { priority: 'high', level: 3 },
          detailsList: [
            { priority: 'urgent', level: 5, status: 'active' },
            { priority: 'low', level: 1 },
          ],
        },
      });

      expect(result.detailsList).toHaveLength(2);
      expect(result.detailsList[0]!.priority).toBe('urgent');
      expect(result.detailsList[1]!.priority).toBe('low');
    });

    test('filters container by details literal sub-field', async () => {
      await client.db.ExtLiteralContainer.create({
        data: { name: 'FindLit', details: { priority: 'critical', level: 4 } },
      });
      await client.db.ExtLiteralContainer.create({
        data: { name: 'NotLit', details: { priority: 'low', level: 1 } },
      });

      const results = await client.db.ExtLiteralContainer.findMany({
        where: { details: { priority: 'critical' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('FindLit');
    });
  });

  describe('update literal fields', () => {
    test('updates priority to new extended value', async () => {
      const created = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });

      const updated = await client.db.ExtLiteralModel.updateMany({
        where: { id: created.id },
        data: { priority: 'urgent' },
      });

      expect(updated[0]!.priority).toBe('urgent');
    });

    test('updates level from inherited to new value', async () => {
      const created = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });

      const updated = await client.db.ExtLiteralModel.updateMany({
        where: { id: created.id },
        data: { level: 5 },
      });

      expect(updated[0]!.level).toBe(5);
    });

    test('updates mixed status from string to boolean', async () => {
      const created = await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });

      const updated = await client.db.ExtLiteralModel.updateMany({
        where: { id: created.id },
        data: { status: true },
      });

      expect(updated[0]!.status).toBe(true);
    });
  });

  describe('select on literal fields', () => {
    test('selects only priority and level', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'critical', level: 4, status: 'pending', broadValue: 99 },
      });

      const results = await client.db.ExtLiteralModel.findMany({
        select: { priority: true, level: true },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.priority).toBe('critical');
      expect(results[0]!.level).toBe(4);
      expect('status' in results[0]!).toBe(false);
      expect('broadValue' in results[0]!).toBe(false);
    });
  });

  describe('count and exists', () => {
    test('count with literal filter', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'critical', level: 4, status: 'active', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'critical', level: 5, status: 'active', broadValue: 'b' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'c' },
      });

      const count = await client.db.ExtLiteralModel.count({ priority: 'critical' });

      expect(count).toBe(2);
    });

    test('exists with new literal value', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'urgent', level: 5, status: 'pending', broadValue: 'x' },
      });

      const exists = await client.db.ExtLiteralModel.exists({ priority: 'urgent' });
      const notExists = await client.db.ExtLiteralModel.exists({ priority: 'critical' });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('delete with literal filter', () => {
    test('deletes by inherited literal value', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });

      const count = await client.db.ExtLiteralModel.deleteMany({
        where: { priority: 'low' },
      });

      expect(count).toBe(1);
    });
  });

  describe('findMany (no args)', () => {
    test('returns all with extended literal values', async () => {
      await client.db.ExtLiteralModel.create({
        data: { priority: 'low', level: 1, status: 'active', broadValue: 'a' },
      });
      await client.db.ExtLiteralModel.create({
        data: { priority: 'urgent', level: 5, status: 0, broadValue: true },
      });

      const all = await client.db.ExtLiteralModel.findMany();

      expect(all).toHaveLength(2);
      for (const item of all) {
        expect(item.id).toBeInstanceOf(CerialId);
        expect(item.priority).toBeDefined();
        expect(item.level).toBeDefined();
        expect(item.status).toBeDefined();
        expect(item.broadValue).toBeDefined();
      }
    });
  });
});
