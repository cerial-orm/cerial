/**
 * E2E Tests: @defaultAlways Decorator
 *
 * Schema: default-always.cerial
 *
 * object ReviewMeta {
 *   note String @defaultAlways("pending review")
 *   flagged Bool @defaultAlways(false)
 * }
 *
 * model ContentItem {
 *   id Record @id
 *   title String
 *   body String
 *   reviewed Bool @defaultAlways(false)
 *   syncStatus String @defaultAlways("dirty")
 *   retryCount Int @defaultAlways(0)
 *   score Float @defaultAlways(1.0)
 *   meta ReviewMeta?
 * }
 *
 * @defaultAlways(value) → DEFAULT ALWAYS value
 * - On create: DB fills with value when field is absent. User value respected.
 * - On update: Cerial injects `field = NONE` when user omits the field, triggering DEFAULT ALWAYS.
 *              User-provided values override the default.
 * - On objects: dot-notation NONE injection for sub-fields on merge updates.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, testConfig } from '../relations/test-helper';

const CONTENT_TABLES = ['content_item'];

describe('E2E @defaultAlways Decorator', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, CONTENT_TABLES);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  // ─── Bool field: reviewed @defaultAlways(false) ────────────────────────────

  describe('Bool field: reviewed @defaultAlways(false)', () => {
    test('create: auto-filled with false when omitted', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      expect(record.reviewed).toBe(false);
    });

    test('create: user-provided true respected', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', reviewed: true },
      });

      expect(record.reviewed).toBe(true);
    });

    test('update: resets to false when not provided (NONE injection)', async () => {
      // Create with reviewed: true
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', reviewed: true },
      });
      expect(created.reviewed).toBe(true);

      // Update without providing reviewed — should reset to false
      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'Updated Title' },
        return: 'after',
      });

      expect(updated!.reviewed).toBe(false);
    });

    test('update: user-provided true respected', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });
      expect(created.reviewed).toBe(false);

      // Update with explicit reviewed: true
      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'Updated', reviewed: true },
        return: 'after',
      });

      expect(updated!.reviewed).toBe(true);
    });

    test('multiple sequential updates: resets each time', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', reviewed: true },
      });
      expect(created.reviewed).toBe(true);

      // First update without reviewed — resets
      const first = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'First' },
        return: 'after',
      });
      expect(first!.reviewed).toBe(false);

      // Set reviewed back to true
      const second = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { reviewed: true },
        return: 'after',
      });
      expect(second!.reviewed).toBe(true);

      // Third update without reviewed — resets again
      const third = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { body: 'New body' },
        return: 'after',
      });
      expect(third!.reviewed).toBe(false);
    });

    test('select: field appears and is selectable', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', reviewed: true },
      });

      const selected = await client.db.ContentItem.findUnique({
        where: { id: created.id },
        select: { reviewed: true, title: true },
      });

      expect(selected).not.toBeNull();
      expect(selected!.reviewed).toBe(true);
      expect(selected!.title).toBe('Test');
    });
  });

  // ─── String field: syncStatus @defaultAlways("dirty") ─────────────────────

  describe('String field: syncStatus @defaultAlways("dirty")', () => {
    test('create: auto-filled with "dirty" when omitted', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      expect(record.syncStatus).toBe('dirty');
    });

    test('create: user-provided "clean" respected', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', syncStatus: 'clean' },
      });

      expect(record.syncStatus).toBe('clean');
    });

    test('update: resets to "dirty" when not provided', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', syncStatus: 'clean' },
      });
      expect(created.syncStatus).toBe('clean');

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'Changed' },
        return: 'after',
      });

      expect(updated!.syncStatus).toBe('dirty');
    });

    test('update: user-provided value respected', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { syncStatus: 'synced' },
        return: 'after',
      });

      expect(updated!.syncStatus).toBe('synced');
    });

    test('where: filterable with equals', async () => {
      await client.db.ContentItem.create({
        data: { title: 'A', body: 'a' },
      });
      await client.db.ContentItem.create({
        data: { title: 'B', body: 'b', syncStatus: 'clean' },
      });

      const dirtyItems = await client.db.ContentItem.findMany({
        where: { syncStatus: 'dirty' },
      });

      expect(dirtyItems).toHaveLength(1);
      expect(dirtyItems[0]!.title).toBe('A');
    });
  });

  // ─── Int field: retryCount @defaultAlways(0) ──────────────────────────────

  describe('Int field: retryCount @defaultAlways(0)', () => {
    test('create: auto-filled with 0 when omitted', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      expect(record.retryCount).toBe(0);
    });

    test('create: user-provided value respected', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', retryCount: 5 },
      });

      expect(record.retryCount).toBe(5);
    });

    test('update: resets to 0 when not provided', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', retryCount: 3 },
      });
      expect(created.retryCount).toBe(3);

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'Retry' },
        return: 'after',
      });

      expect(updated!.retryCount).toBe(0);
    });

    test('update: user-provided value respected', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { retryCount: 10 },
        return: 'after',
      });

      expect(updated!.retryCount).toBe(10);
    });
  });

  // ─── Float field: score @defaultAlways(1.0) ───────────────────────────────

  describe('Float field: score @defaultAlways(1.0)', () => {
    test('create: auto-filled with 1.0 when omitted', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      expect(record.score).toBe(1);
    });

    test('create: user-provided value respected', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', score: 4.5 },
      });

      expect(record.score).toBe(4.5);
    });

    test('update: resets to 1.0 when not provided', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', score: 9.8 },
      });
      expect(created.score).toBe(9.8);

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'Re-scored' },
        return: 'after',
      });

      expect(updated!.score).toBe(1);
    });

    test('update: user-provided value respected', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { score: 7.3 },
        return: 'after',
      });

      expect(updated!.score).toBe(7.3);
    });
  });

  // ─── Object sub-field @defaultAlways ──────────────────────────────────────

  describe('Object sub-field @defaultAlways', () => {
    test('create with meta: sub-fields auto-filled when omitted', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', meta: {} },
      });

      expect(record.meta).toBeDefined();
      expect(record.meta!.note).toBe('pending review');
      expect(record.meta!.flagged).toBe(false);
    });

    test('create with meta: sub-field overrides respected', async () => {
      const record = await client.db.ContentItem.create({
        data: {
          title: 'Test',
          body: 'Content',
          meta: { note: 'approved', flagged: true },
        },
      });

      expect(record.meta!.note).toBe('approved');
      expect(record.meta!.flagged).toBe(true);
    });

    test('update via merge: sub-field NONE injection resets defaults', async () => {
      const created = await client.db.ContentItem.create({
        data: {
          title: 'Test',
          body: 'Content',
          meta: { note: 'approved', flagged: true },
        },
      });
      expect(created.meta!.note).toBe('approved');
      expect(created.meta!.flagged).toBe(true);

      // Update meta via merge (partial) — omitted sub-fields should reset
      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { meta: { note: 'needs work' } },
        return: 'after',
      });

      expect(updated!.meta!.note).toBe('needs work');
      expect(updated!.meta!.flagged).toBe(false); // Reset by @defaultAlways
    });

    test('update via merge: sub-field overrides respected', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content', meta: {} },
      });

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { meta: { note: 'reviewed', flagged: true } },
        return: 'after',
      });

      expect(updated!.meta!.note).toBe('reviewed');
      expect(updated!.meta!.flagged).toBe(true);
    });

    test('create without meta: object absent entirely', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      expect(record.meta).toBeUndefined();
    });

    test('update to add meta: sub-fields auto-filled', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });
      expect(created.meta).toBeUndefined();

      // Add meta via full replace
      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { meta: { set: { note: 'initial', flagged: false } } },
        return: 'after',
      });

      expect(updated!.meta).toBeDefined();
      expect(updated!.meta!.note).toBe('initial');
      expect(updated!.meta!.flagged).toBe(false);
    });
  });

  // ─── Combined behavior ────────────────────────────────────────────────────

  describe('Combined behavior', () => {
    test('all @defaultAlways fields auto-filled on create', async () => {
      const record = await client.db.ContentItem.create({
        data: { title: 'Test', body: 'Content' },
      });

      expect(record.reviewed).toBe(false);
      expect(record.syncStatus).toBe('dirty');
      expect(record.retryCount).toBe(0);
      expect(record.score).toBe(1);
    });

    test('all @defaultAlways fields reset on update when omitted', async () => {
      const created = await client.db.ContentItem.create({
        data: {
          title: 'Test',
          body: 'Content',
          reviewed: true,
          syncStatus: 'clean',
          retryCount: 5,
          score: 9.9,
        },
      });
      expect(created.reviewed).toBe(true);
      expect(created.syncStatus).toBe('clean');
      expect(created.retryCount).toBe(5);
      expect(created.score).toBe(9.9);

      // Update only title — all @defaultAlways fields should reset
      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'New Title' },
        return: 'after',
      });

      expect(updated!.reviewed).toBe(false);
      expect(updated!.syncStatus).toBe('dirty');
      expect(updated!.retryCount).toBe(0);
      expect(updated!.score).toBe(1);
    });

    test('non-@defaultAlways fields preserved on update', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'Original', body: 'Original Body' },
      });

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'Changed' },
        return: 'after',
      });

      // title was updated explicitly
      expect(updated!.title).toBe('Changed');
      // body was not in the update data — it should be preserved
      expect(updated!.body).toBe('Original Body');
    });

    test('field with @defaultAlways appears in Where filters', async () => {
      await client.db.ContentItem.create({
        data: { title: 'A', body: 'a', reviewed: true },
      });
      await client.db.ContentItem.create({
        data: { title: 'B', body: 'b' }, // reviewed defaults to false
      });

      const reviewed = await client.db.ContentItem.findMany({
        where: { reviewed: true },
      });
      expect(reviewed).toHaveLength(1);
      expect(reviewed[0]!.title).toBe('A');

      const unreviewed = await client.db.ContentItem.findMany({
        where: { reviewed: false },
      });
      expect(unreviewed).toHaveLength(1);
      expect(unreviewed[0]!.title).toBe('B');
    });
  });

  // ─── With query methods ───────────────────────────────────────────────────

  describe('With query methods', () => {
    test('findMany: defaultAlways fields present on all records', async () => {
      await client.db.ContentItem.create({ data: { title: 'A', body: 'a' } });
      await client.db.ContentItem.create({ data: { title: 'B', body: 'b' } });

      const items = await client.db.ContentItem.findMany({});

      expect(items).toHaveLength(2);
      for (const item of items) {
        expect(item.reviewed).toBe(false);
        expect(item.syncStatus).toBe('dirty');
        expect(item.retryCount).toBe(0);
        expect(item.score).toBe(1);
      }
    });

    test('findOne: defaultAlways fields present', async () => {
      await client.db.ContentItem.create({ data: { title: 'Only', body: 'one' } });

      const item = await client.db.ContentItem.findOne({});

      expect(item).not.toBeNull();
      expect(item!.reviewed).toBe(false);
      expect(item!.syncStatus).toBe('dirty');
    });

    test('updateMany: all matched records get reset', async () => {
      await client.db.ContentItem.create({
        data: { title: 'A', body: 'a', reviewed: true, syncStatus: 'clean' },
      });
      await client.db.ContentItem.create({
        data: { title: 'B', body: 'b', reviewed: true, syncStatus: 'clean' },
      });

      // Update many without providing @defaultAlways fields — all should reset
      const updated = await client.db.ContentItem.updateMany({
        where: { reviewed: true },
        data: { body: 'updated body' },
      });

      expect(updated).toHaveLength(2);
      for (const item of updated) {
        expect(item.reviewed).toBe(false);
        expect(item.syncStatus).toBe('dirty');
        expect(item.retryCount).toBe(0);
      }
    });

    test('upsert (create path): field auto-filled', async () => {
      const result = await client.db.ContentItem.upsert({
        where: { id: 'content_item:upsert_create' },
        create: { title: 'Upserted', body: 'new' },
        return: 'after',
      });

      expect(result).not.toBeNull();
      expect(result!.reviewed).toBe(false);
      expect(result!.syncStatus).toBe('dirty');
      expect(result!.retryCount).toBe(0);
      expect(result!.score).toBe(1);
    });

    test('upsert (update path): field reset', async () => {
      // First create
      const created = await client.db.ContentItem.create({
        data: {
          title: 'Existing',
          body: 'content',
          reviewed: true,
          syncStatus: 'clean',
          retryCount: 3,
        },
      });

      // Upsert should hit the update path
      const result = await client.db.ContentItem.upsert({
        where: { id: created.id },
        create: { title: 'Ignored', body: 'ignored' },
        update: { title: 'Upsert Updated' },
        return: 'after',
      });

      expect(result).not.toBeNull();
      expect(result!.title).toBe('Upsert Updated');
      // @defaultAlways fields should reset because they aren't in update
      expect(result!.reviewed).toBe(false);
      expect(result!.syncStatus).toBe('dirty');
      expect(result!.retryCount).toBe(0);
    });

    test('deleteUnique with return before: field in returned data', async () => {
      const created = await client.db.ContentItem.create({
        data: { title: 'To Delete', body: 'bye', reviewed: true },
      });

      const deleted = await client.db.ContentItem.deleteUnique({
        where: { id: created.id },
        return: 'before',
      });

      expect(deleted).not.toBeNull();
      expect(deleted!.reviewed).toBe(true);
      expect(deleted!.syncStatus).toBe('dirty');
    });

    test('count and exists: work with where filters on defaultAlways fields', async () => {
      await client.db.ContentItem.create({ data: { title: 'A', body: 'a' } });
      await client.db.ContentItem.create({ data: { title: 'B', body: 'b', reviewed: true } });

      const count = await client.db.ContentItem.count({ reviewed: false });
      expect(count).toBe(1);

      const exists = await client.db.ContentItem.exists({ syncStatus: 'dirty' });
      expect(exists).toBe(true);

      const noExist = await client.db.ContentItem.exists({ syncStatus: 'nonexistent' });
      expect(noExist).toBe(false);
    });

    test('orderBy: can order by defaultAlways field', async () => {
      await client.db.ContentItem.create({ data: { title: 'Low', body: 'l', score: 1.0 } });
      await client.db.ContentItem.create({ data: { title: 'High', body: 'h', score: 9.0 } });
      await client.db.ContentItem.create({ data: { title: 'Mid', body: 'm', score: 5.0 } });

      const ordered = await client.db.ContentItem.findMany({
        orderBy: { score: 'asc' },
      });

      expect(ordered).toHaveLength(3);
      expect(ordered[0]!.title).toBe('Low');
      expect(ordered[1]!.title).toBe('Mid');
      expect(ordered[2]!.title).toBe('High');
    });
  });
});
