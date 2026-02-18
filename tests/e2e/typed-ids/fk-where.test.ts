import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  TYPED_ID_TABLES,
  testConfig,
  truncateTables,
} from '../test-helper';

describe('E2E Typed IDs: FK WHERE', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TYPED_ID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TYPED_ID_TABLES);
  });

  // ─── FkChildModel: parentId is FK to FkTargetIntId (Record(int) @id) ───────

  describe('FkChildModel parentId WHERE', () => {
    test('direct CerialId value on FK field', async () => {
      const parent = await client.db.FkTargetIntId.create({
        data: { id: 100, label: 'p1' },
      });
      await client.db.FkChildModel.create({ data: { parentId: parent.id, note: 'c1' } });
      await client.db.FkChildModel.create({ data: { parentId: parent.id, note: 'c2' } });

      const results = await client.db.FkChildModel.findMany({
        where: { parentId: parent.id },
      });

      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.parentId).toBeInstanceOf(CerialId);
        expect(r.parentId.id).toBe(100);
      }
    });

    test('eq operator with CerialId on FK field', async () => {
      const p1 = await client.db.FkTargetIntId.create({ data: { id: 10, label: 'p1' } });
      const p2 = await client.db.FkTargetIntId.create({ data: { id: 20, label: 'p2' } });
      await client.db.FkChildModel.create({ data: { parentId: p1.id, note: 'c1' } });
      await client.db.FkChildModel.create({ data: { parentId: p2.id, note: 'c2' } });

      const results = await client.db.FkChildModel.findMany({
        where: { parentId: { eq: p1.id } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.note).toBe('c1');
    });

    test('in operator with CerialId array on FK field', async () => {
      const p1 = await client.db.FkTargetIntId.create({ data: { id: 10, label: 'p1' } });
      const p2 = await client.db.FkTargetIntId.create({ data: { id: 20, label: 'p2' } });
      const p3 = await client.db.FkTargetIntId.create({ data: { id: 30, label: 'p3' } });
      await client.db.FkChildModel.create({ data: { parentId: p1.id, note: 'c1' } });
      await client.db.FkChildModel.create({ data: { parentId: p2.id, note: 'c2' } });
      await client.db.FkChildModel.create({ data: { parentId: p3.id, note: 'c3' } });

      const results = await client.db.FkChildModel.findMany({
        where: { parentId: { in: [p1.id, p3.id] } },
      });

      expect(results).toHaveLength(2);
      const notes = results.map((r) => r.note).sort();
      expect(notes).toEqual(['c1', 'c3']);
    });

    test('neq operator with CerialId on FK field', async () => {
      const p1 = await client.db.FkTargetIntId.create({ data: { id: 10, label: 'p1' } });
      const p2 = await client.db.FkTargetIntId.create({ data: { id: 20, label: 'p2' } });
      await client.db.FkChildModel.create({ data: { parentId: p1.id, note: 'c1' } });
      await client.db.FkChildModel.create({ data: { parentId: p2.id, note: 'c2' } });

      const results = await client.db.FkChildModel.findMany({
        where: { parentId: { neq: p1.id } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.note).toBe('c2');
    });

    test('notIn operator with CerialId on FK field', async () => {
      const p1 = await client.db.FkTargetIntId.create({ data: { id: 10, label: 'p1' } });
      const p2 = await client.db.FkTargetIntId.create({ data: { id: 20, label: 'p2' } });
      const p3 = await client.db.FkTargetIntId.create({ data: { id: 30, label: 'p3' } });
      await client.db.FkChildModel.create({ data: { parentId: p1.id, note: 'c1' } });
      await client.db.FkChildModel.create({ data: { parentId: p2.id, note: 'c2' } });
      await client.db.FkChildModel.create({ data: { parentId: p3.id, note: 'c3' } });

      const results = await client.db.FkChildModel.findMany({
        where: { parentId: { notIn: [p1.id, p2.id] } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.note).toBe('c3');
    });
  });

  // ─── StandaloneRefModel: externalRef is Record(int), standalone ────────────

  describe('StandaloneRefModel externalRef WHERE', () => {
    test('direct RecordId value on standalone field', async () => {
      const ref1 = new RecordId('some_table', 42);
      const ref2 = new RecordId('some_table', 99);
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref1, externalRefs: [], label: 's1' },
      });
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref2, externalRefs: [], label: 's2' },
      });

      const results = await client.db.StandaloneRefModel.findMany({
        where: { externalRef: ref1 },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.label).toBe('s1');
      expect(results[0]!.externalRef.id).toBe(42);
    });

    test('eq operator on standalone field', async () => {
      const ref = new RecordId('some_table', 42);
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref, externalRefs: [], label: 'eq-test' },
      });

      const results = await client.db.StandaloneRefModel.findMany({
        where: { externalRef: { eq: ref } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.label).toBe('eq-test');
    });

    test('has operator on standalone array field', async () => {
      const ref1 = new RecordId('some_table', 1);
      const ref2 = new RecordId('some_table', 2);
      const ref3 = new RecordId('some_table', 3);
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref1, externalRefs: [ref1, ref2], label: 'has-yes' },
      });
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref3, externalRefs: [ref3], label: 'has-no' },
      });

      const results = await client.db.StandaloneRefModel.findMany({
        where: { externalRefs: { has: ref2 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.label).toBe('has-yes');
    });

    test('neq operator on standalone field', async () => {
      const ref1 = new RecordId('some_table', 10);
      const ref2 = new RecordId('some_table', 20);
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref1, externalRefs: [], label: 'keep' },
      });
      await client.db.StandaloneRefModel.create({
        data: { externalRef: ref2, externalRefs: [], label: 'skip' },
      });

      const results = await client.db.StandaloneRefModel.findMany({
        where: { externalRef: { neq: ref2 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.label).toBe('keep');
    });
  });
});
