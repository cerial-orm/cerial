/**
 * E2E Tests: Timestamp Decorators (@createdAt, @updatedAt, @now)
 *
 * Schema: timestamps.cerial
 *
 * object TimestampInfo {
 *   label String
 *   createdAt Date @createdAt
 *   updatedAt Date @updatedAt
 * }
 *
 * model TimestampTest {
 *   id Record @id
 *   name String
 *   createdAt Date @createdAt
 *   updatedAt Date @updatedAt
 *   accessedAt Date @now
 *   meta TimestampInfo?
 * }
 *
 * Decorator behaviors:
 * - @now       → COMPUTED time::now() — NOT stored, computed each query. Output-only. Model fields only.
 * - @createdAt → DEFAULT time::now() — DB fills on creation when absent. User value respected.
 * - @updatedAt → DEFAULT ALWAYS time::now() — DB fills on create/update when field is NONE.
 *                User value respected when explicitly provided.
 *                Cerial injects `field = NONE` on UPDATE when user omits the field.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, testConfig } from '../relations/test-helper';

const TIMESTAMP_TABLES = ['timestamp_test'];

/** Tolerance in ms for comparing DB timestamps to local time */
const TIME_TOLERANCE = 5000;

/** Assert a Date is approximately now (within tolerance) */
function expectApproximatelyNow(date: Date | null | undefined, tolerance = TIME_TOLERANCE): void {
  expect(date).toBeDefined();
  expect(date).not.toBeNull();
  expect(date).toBeInstanceOf(Date);
  const now = Date.now();
  const ts = date!.getTime();
  expect(ts).toBeGreaterThanOrEqual(now - tolerance);
  expect(ts).toBeLessThanOrEqual(now + tolerance);
}

describe('E2E Timestamp Decorators', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TIMESTAMP_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TIMESTAMP_TABLES);
  });

  // ─── @createdAt Tests ─────────────────────────────────────────────────────

  describe('@createdAt', () => {
    test('create: field auto-filled when omitted', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'auto-created' },
      });

      expectApproximatelyNow(record.createdAt);
    });

    test('create: user-provided value respected (override)', async () => {
      const customDate = new Date('2020-01-15T12:00:00.000Z');
      const record = await client.db.TimestampTest.create({
        data: { name: 'custom-created', createdAt: customDate },
      });

      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.createdAt!.getTime()).toBe(customDate.getTime());
    });

    test('update: field unchanged when not provided in update data', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'keep-created' },
      });
      const originalCreatedAt = record.createdAt!.getTime();

      await new Promise((r) => setTimeout(r, 100));

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'keep-created-updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.createdAt!.getTime()).toBe(originalCreatedAt);
    });

    test('update: field CAN be updated when explicitly provided', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'override-created' },
      });

      const newDate = new Date('2019-06-01T00:00:00.000Z');
      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { createdAt: newDate },
      });

      expect(updated).toBeDefined();
      expect(updated!.createdAt!.getTime()).toBe(newDate.getTime());
    });

    test('select: field appears in results by default', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'select-default' },
      });

      const found = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
      });

      expect(found).toBeDefined();
      expect(found!.createdAt).toBeInstanceOf(Date);
    });

    test('select: field selectable with select: { createdAt: true }', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'select-explicit' },
      });

      const found = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
        select: { createdAt: true },
      });

      expect(found).toBeDefined();
      expect(found!.createdAt).toBeInstanceOf(Date);
      // Non-selected fields should be absent
      expect((found as Record<string, unknown>).name).toBeUndefined();
    });

    test('where: field filterable with gt / lt operators', async () => {
      const pastDate = new Date('2000-01-01T00:00:00.000Z');
      await client.db.TimestampTest.create({
        data: { name: 'old-record', createdAt: pastDate },
      });
      await client.db.TimestampTest.create({
        data: { name: 'new-record' }, // auto-filled with now
      });

      const recentRecords = await client.db.TimestampTest.findMany({
        where: { createdAt: { gt: new Date('2020-01-01T00:00:00.000Z') } },
      });

      expect(recentRecords).toHaveLength(1);
      expect(recentRecords[0]!.name).toBe('new-record');

      const oldRecords = await client.db.TimestampTest.findMany({
        where: { createdAt: { lt: new Date('2001-01-01T00:00:00.000Z') } },
      });

      expect(oldRecords).toHaveLength(1);
      expect(oldRecords[0]!.name).toBe('old-record');
    });

    test('where: field filterable with between operator', async () => {
      const d1 = new Date('2021-03-01T00:00:00.000Z');
      const d2 = new Date('2022-06-15T00:00:00.000Z');
      const d3 = new Date('2023-09-30T00:00:00.000Z');

      await client.db.TimestampTest.create({ data: { name: 'march-2021', createdAt: d1 } });
      await client.db.TimestampTest.create({ data: { name: 'june-2022', createdAt: d2 } });
      await client.db.TimestampTest.create({ data: { name: 'sept-2023', createdAt: d3 } });

      const inRange = await client.db.TimestampTest.findMany({
        where: {
          createdAt: {
            between: [new Date('2022-01-01T00:00:00.000Z'), new Date('2023-01-01T00:00:00.000Z')],
          },
        },
      });

      expect(inRange).toHaveLength(1);
      expect(inRange[0]!.name).toBe('june-2022');
    });
  });

  // ─── @updatedAt Tests ─────────────────────────────────────────────────────

  describe('@updatedAt', () => {
    test('create: field auto-filled when omitted (DEFAULT ALWAYS fires on create)', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'auto-updated' },
      });

      expectApproximatelyNow(record.updatedAt);
    });

    test('create: user-provided value respected (DEFAULT ALWAYS only fires when field absent)', async () => {
      // DEFAULT ALWAYS fires when field is NONE — when user provides a value, it's kept
      const customDate = new Date('2020-06-15T12:00:00.000Z');
      const record = await client.db.TimestampTest.create({
        data: { name: 'custom-updated', updatedAt: customDate },
      });

      expect(record.updatedAt).toBeInstanceOf(Date);
      expect(record.updatedAt!.getTime()).toBe(customDate.getTime());
    });

    test('update: field auto-updated when not provided (NONE injection triggers DEFAULT ALWAYS)', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'will-update' },
      });
      const originalUpdatedAt = record.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'did-update' },
      });

      expect(updated).toBeDefined();
      expect(updated!.updatedAt).toBeInstanceOf(Date);
      // updatedAt should be later than the original
      expect(updated!.updatedAt!.getTime()).toBeGreaterThan(originalUpdatedAt);
    });

    test('update: user-provided value respected (explicit value overrides NONE injection)', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'force-update' },
      });

      await new Promise((r) => setTimeout(r, 100));

      const oldDate = new Date('2010-01-01T00:00:00.000Z');
      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { updatedAt: oldDate },
      });

      // User-provided value should be respected
      expect(updated).toBeDefined();
      expect(updated!.updatedAt).toBeInstanceOf(Date);
      expect(updated!.updatedAt!.getTime()).toBe(oldDate.getTime());
    });

    test('multiple sequential updates: field changes on each update', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'multi-update' },
      });
      const t0 = record.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const update1 = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'multi-update-1' },
      });
      const t1 = update1!.updatedAt!.getTime();
      expect(t1).toBeGreaterThan(t0);

      await new Promise((r) => setTimeout(r, 1200));

      const update2 = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'multi-update-2' },
      });
      const t2 = update2!.updatedAt!.getTime();
      expect(t2).toBeGreaterThan(t1);

      await new Promise((r) => setTimeout(r, 1200));

      const update3 = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'multi-update-3' },
      });
      const t3 = update3!.updatedAt!.getTime();
      expect(t3).toBeGreaterThan(t2);
    });

    test('select: field appears and is selectable', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'select-updated' },
      });

      const found = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
        select: { updatedAt: true, name: true },
      });

      expect(found).toBeDefined();
      expect(found!.updatedAt).toBeInstanceOf(Date);
      expect(found!.name).toBe('select-updated');
      // Non-selected fields should be absent
      expect((found as Record<string, unknown>).createdAt).toBeUndefined();
    });
  });

  // ─── @now (COMPUTED) Tests ────────────────────────────────────────────────

  describe('@now (COMPUTED)', () => {
    test('create: field appears in result even though not in input', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'computed-now' },
      });

      // @now fields should be present in the output
      expect(record.accessedAt).toBeDefined();
      expect(record.accessedAt).toBeInstanceOf(Date);
    });

    test('field value is approximately current time (within tolerance)', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'now-check' },
      });

      expectApproximatelyNow(record.accessedAt);
    });

    test('field NOT persisted — querying same record later returns a different (later) time', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'now-volatile' },
      });
      const firstAccessedAt = record.accessedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const fetched = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
      });

      expect(fetched).toBeDefined();
      expect(fetched!.accessedAt).toBeInstanceOf(Date);
      // The second query should return a later timestamp since @now is computed each time
      expect(fetched!.accessedAt!.getTime()).toBeGreaterThan(firstAccessedAt);
    });

    test('select: field selectable in output', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'select-now' },
      });

      const found = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
        select: { accessedAt: true },
      });

      expect(found).toBeDefined();
      expect(found!.accessedAt).toBeInstanceOf(Date);
      // Non-selected fields absent
      expect((found as Record<string, unknown>).name).toBeUndefined();
      expect((found as Record<string, unknown>).createdAt).toBeUndefined();
    });
  });

  // ─── Object Sub-field Tests ───────────────────────────────────────────────
  // Note: @now is NOT allowed on object fields (COMPUTED must be top-level).
  // TimestampInfo only has @createdAt and @updatedAt.

  describe('Object sub-field timestamps', () => {
    test('create with meta: @createdAt and @updatedAt auto-filled on object sub-fields', async () => {
      const record = await client.db.TimestampTest.create({
        data: {
          name: 'obj-auto',
          meta: { label: 'test-meta' },
        },
      });

      expect(record.meta).toBeDefined();
      expectApproximatelyNow(record.meta!.createdAt);
      expectApproximatelyNow(record.meta!.updatedAt);
    });

    test('update with meta: @updatedAt changes on object sub-field', async () => {
      const record = await client.db.TimestampTest.create({
        data: {
          name: 'obj-update',
          meta: { label: 'original-label' },
        },
      });
      const originalMetaUpdatedAt = record.meta!.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { meta: { label: 'updated-label' } },
      });

      expect(updated).toBeDefined();
      expect(updated!.meta).toBeDefined();
      // @updatedAt (DEFAULT ALWAYS) should have a newer timestamp
      expect(updated!.meta!.updatedAt).toBeInstanceOf(Date);
      expect(updated!.meta!.updatedAt!.getTime()).toBeGreaterThan(originalMetaUpdatedAt);
    });

    test('create with full override: @createdAt and @updatedAt can be explicitly provided', async () => {
      const customCreated = new Date('2018-01-01T00:00:00.000Z');
      const customUpdated = new Date('2019-06-15T12:00:00.000Z');

      const record = await client.db.TimestampTest.create({
        data: {
          name: 'obj-override',
          meta: {
            label: 'override-meta',
            createdAt: customCreated,
            updatedAt: customUpdated,
          },
        },
      });

      expect(record.meta).toBeDefined();
      // @createdAt should respect user value (DEFAULT only fires when absent)
      expect(record.meta!.createdAt!.getTime()).toBe(customCreated.getTime());
      // @updatedAt should respect user value (DEFAULT ALWAYS only fires when field is NONE)
      expect(record.meta!.updatedAt!.getTime()).toBe(customUpdated.getTime());
    });

    test('create without meta: meta field is undefined', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'no-meta' },
      });

      expect(record.meta).toBeUndefined();
    });

    test('update to add meta via full replace: object is set correctly', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'add-meta-later' },
      });
      expect(record.meta).toBeUndefined();

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { meta: { set: { label: 'added-meta' } } },
      });

      expect(updated).toBeDefined();
      expect(updated!.meta).toBeDefined();
      expect(updated!.meta!.label).toBe('added-meta');
      // Note: Full object replace ({ set: ... }) may or may not trigger
      // DEFAULT/DEFAULT ALWAYS on sub-fields depending on SurrealDB behavior.
      // The sub-field defaults fire when writing individual sub-fields,
      // not necessarily when replacing the parent object as a whole.
    });

    test('update to add meta via dot notation: timestamps auto-filled', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'add-meta-dot' },
      });
      expect(record.meta).toBeUndefined();

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { meta: { label: 'dot-meta' } },
      });

      expect(updated).toBeDefined();
      expect(updated!.meta).toBeDefined();
      expect(updated!.meta!.label).toBe('dot-meta');
      // @updatedAt sub-field should be auto-filled by NONE injection + DEFAULT ALWAYS
      expectApproximatelyNow(updated!.meta!.updatedAt);
    });
  });

  // ─── Combined Behavior Tests ──────────────────────────────────────────────

  describe('Combined behavior', () => {
    test('create with all defaults: all three decorators work correctly on same model', async () => {
      const before = new Date();
      const record = await client.db.TimestampTest.create({
        data: { name: 'all-defaults' },
      });
      const after = new Date();

      // @createdAt: auto-filled
      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.createdAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - TIME_TOLERANCE);
      expect(record.createdAt!.getTime()).toBeLessThanOrEqual(after.getTime() + TIME_TOLERANCE);

      // @updatedAt: auto-filled (DEFAULT ALWAYS)
      expect(record.updatedAt).toBeInstanceOf(Date);
      expect(record.updatedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - TIME_TOLERANCE);
      expect(record.updatedAt!.getTime()).toBeLessThanOrEqual(after.getTime() + TIME_TOLERANCE);

      // @now: computed
      expect(record.accessedAt).toBeInstanceOf(Date);
      expect(record.accessedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - TIME_TOLERANCE);
      expect(record.accessedAt!.getTime()).toBeLessThanOrEqual(after.getTime() + TIME_TOLERANCE);
    });

    test('after update: @createdAt stays, @updatedAt changes', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'distinct-timestamps' },
      });
      const originalCreatedAt = record.createdAt!.getTime();
      const originalUpdatedAt = record.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'distinct-timestamps-v2' },
      });

      expect(updated).toBeDefined();
      // @createdAt should remain the same
      expect(updated!.createdAt!.getTime()).toBe(originalCreatedAt);
      // @updatedAt should be newer
      expect(updated!.updatedAt!.getTime()).toBeGreaterThan(originalUpdatedAt);
    });

    test('full lifecycle: create → read → update → read with all timestamps correct', async () => {
      // Step 1: Create
      const created = await client.db.TimestampTest.create({
        data: { name: 'lifecycle' },
      });
      const createCreatedAt = created.createdAt!.getTime();
      const createUpdatedAt = created.updatedAt!.getTime();
      const createAccessedAt = created.accessedAt!.getTime();

      expect(created.createdAt).toBeInstanceOf(Date);
      expect(created.updatedAt).toBeInstanceOf(Date);
      expect(created.accessedAt).toBeInstanceOf(Date);

      await new Promise((r) => setTimeout(r, 1200));

      // Step 2: Read
      const read = await client.db.TimestampTest.findUnique({
        where: { id: created.id },
      });
      expect(read).toBeDefined();
      // @createdAt should be same as create
      expect(read!.createdAt!.getTime()).toBe(createCreatedAt);
      // @updatedAt should be same as create (no update happened)
      expect(read!.updatedAt!.getTime()).toBe(createUpdatedAt);
      // @now should be different (computed fresh)
      expect(read!.accessedAt!.getTime()).toBeGreaterThan(createAccessedAt);

      await new Promise((r) => setTimeout(r, 1200));

      // Step 3: Update
      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: created.id },
        data: { name: 'lifecycle-updated' },
      });
      expect(updated).toBeDefined();
      // @createdAt unchanged
      expect(updated!.createdAt!.getTime()).toBe(createCreatedAt);
      // @updatedAt changed (NONE injection triggers DEFAULT ALWAYS)
      expect(updated!.updatedAt!.getTime()).toBeGreaterThan(createUpdatedAt);
      const updateUpdatedAt = updated!.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      // Step 4: Read again
      const readAgain = await client.db.TimestampTest.findUnique({
        where: { id: created.id },
      });
      expect(readAgain).toBeDefined();
      // @createdAt still unchanged
      expect(readAgain!.createdAt!.getTime()).toBe(createCreatedAt);
      // @updatedAt should match the update time (no new update)
      expect(readAgain!.updatedAt!.getTime()).toBe(updateUpdatedAt);
      // @now should be fresh again
      expect(readAgain!.accessedAt!.getTime()).toBeGreaterThan(updated!.accessedAt!.getTime());
    });
  });

  // ─── Type Safety at Runtime ───────────────────────────────────────────────

  describe('Type safety at runtime', () => {
    test('create without providing @now field (not in Create type)', async () => {
      // The Create type (TimestampTestCreate) omits accessedAt.
      // This test verifies that at runtime, create succeeds without it,
      // and accessedAt appears in the result.
      const record = await client.db.TimestampTest.create({
        data: { name: 'no-now-input' },
      });

      expect(record.name).toBe('no-now-input');
      expect(record.accessedAt).toBeInstanceOf(Date);
    });

    test('update without providing @now field (not in Update type)', async () => {
      // The Update type (TimestampTestUpdate) omits accessedAt.
      // This test verifies that at runtime, update succeeds without it,
      // and accessedAt appears in the result.
      const record = await client.db.TimestampTest.create({
        data: { name: 'update-no-now' },
      });

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'update-no-now-v2' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('update-no-now-v2');
      expect(updated!.accessedAt).toBeInstanceOf(Date);
    });

    test('create with meta object — @createdAt/@updatedAt auto-filled on sub-object', async () => {
      // TimestampInfoCreateInput makes @createdAt/@updatedAt optional
      const record = await client.db.TimestampTest.create({
        data: {
          name: 'obj-auto-ts',
          meta: { label: 'auto-ts-meta' },
        },
      });

      expect(record.meta).toBeDefined();
      expect(record.meta!.label).toBe('auto-ts-meta');
      expectApproximatelyNow(record.meta!.createdAt);
      expectApproximatelyNow(record.meta!.updatedAt);
    });
  });

  // ─── Interaction with Other Query Methods ─────────────────────────────────

  describe('Timestamps with query methods', () => {
    test('findMany: all records have timestamps', async () => {
      await client.db.TimestampTest.create({ data: { name: 'find-many-1' } });
      await client.db.TimestampTest.create({ data: { name: 'find-many-2' } });
      await client.db.TimestampTest.create({ data: { name: 'find-many-3' } });

      const records = await client.db.TimestampTest.findMany({});

      expect(records).toHaveLength(3);
      for (const r of records) {
        expect(r.createdAt).toBeInstanceOf(Date);
        expect(r.updatedAt).toBeInstanceOf(Date);
        expect(r.accessedAt).toBeInstanceOf(Date);
      }
    });

    test('findOne: timestamps present', async () => {
      await client.db.TimestampTest.create({ data: { name: 'find-one-ts' } });

      const record = await client.db.TimestampTest.findOne({
        where: { name: 'find-one-ts' },
      });

      expect(record).toBeDefined();
      expect(record!.createdAt).toBeInstanceOf(Date);
      expect(record!.updatedAt).toBeInstanceOf(Date);
      expect(record!.accessedAt).toBeInstanceOf(Date);
    });

    test('updateMany: @updatedAt refreshes on all matched records', async () => {
      const r1 = await client.db.TimestampTest.create({ data: { name: 'um-ts-a' } });
      const r2 = await client.db.TimestampTest.create({ data: { name: 'um-ts-b' } });
      const t1 = r1.updatedAt!.getTime();
      const t2 = r2.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const updated = await client.db.TimestampTest.updateMany({
        where: { name: { startsWith: 'um-ts' } },
        data: { name: 'um-ts-updated' },
      });

      expect(updated).toHaveLength(2);
      for (const u of updated) {
        expect(u.updatedAt).toBeInstanceOf(Date);
        expect(u.updatedAt!.getTime()).toBeGreaterThan(Math.min(t1, t2));
      }
    });

    test('upsert (create path): timestamps auto-filled', async () => {
      const result = await client.db.TimestampTest.upsert({
        where: { id: 'timestamp_test:upsert-create' },
        create: { name: 'upsert-created' },
      });

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expectApproximatelyNow(result!.createdAt);
      expectApproximatelyNow(result!.updatedAt);
      expectApproximatelyNow(result!.accessedAt);
    });

    test('upsert (update path): @updatedAt refreshes, @createdAt stays', async () => {
      const created = await client.db.TimestampTest.create({
        data: { name: 'upsert-will-update' },
      });
      const originalCreatedAt = created.createdAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const result = await client.db.TimestampTest.upsert({
        where: { id: created.id },
        create: { name: 'should-not-create' },
        update: { name: 'upsert-updated' },
      });

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.name).toBe('upsert-updated');
      // @createdAt should stay
      expect(result!.createdAt!.getTime()).toBe(originalCreatedAt);
      // @updatedAt should be newer
      expect(result!.updatedAt!.getTime()).toBeGreaterThan(created.updatedAt!.getTime());
    });

    test('deleteUnique with return before: timestamps in returned data', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'delete-ts' },
      });

      const deleted = await client.db.TimestampTest.deleteUnique({
        where: { id: record.id },
        return: 'before',
      });

      expect(deleted).toBeDefined();
      expect(deleted!.createdAt).toBeInstanceOf(Date);
      expect(deleted!.updatedAt).toBeInstanceOf(Date);
      // @now is computed, so even the return value should have a timestamp
      expect(deleted!.accessedAt).toBeInstanceOf(Date);
    });

    test('count and exists: work with timestamp where filters', async () => {
      const pastDate = new Date('2000-01-01T00:00:00.000Z');
      await client.db.TimestampTest.create({ data: { name: 'count-old', createdAt: pastDate } });
      await client.db.TimestampTest.create({ data: { name: 'count-new' } });

      const count = await client.db.TimestampTest.count({
        createdAt: { gt: new Date('2020-01-01T00:00:00.000Z') },
      });
      expect(count).toBe(1);

      const exists = await client.db.TimestampTest.exists({
        createdAt: { lt: new Date('2001-01-01T00:00:00.000Z') },
      });
      expect(exists).toBe(true);

      const notExists = await client.db.TimestampTest.exists({
        createdAt: { lt: new Date('1999-01-01T00:00:00.000Z') },
      });
      expect(notExists).toBe(false);
    });

    test('orderBy: can order by timestamp fields', async () => {
      const d1 = new Date('2021-01-01T00:00:00.000Z');
      const d2 = new Date('2023-01-01T00:00:00.000Z');
      const d3 = new Date('2022-01-01T00:00:00.000Z');

      await client.db.TimestampTest.create({ data: { name: 'ts-order-1', createdAt: d1 } });
      await client.db.TimestampTest.create({ data: { name: 'ts-order-2', createdAt: d2 } });
      await client.db.TimestampTest.create({ data: { name: 'ts-order-3', createdAt: d3 } });

      const asc = await client.db.TimestampTest.findMany({
        orderBy: { createdAt: 'asc' },
      });

      expect(asc).toHaveLength(3);
      expect(asc[0]!.name).toBe('ts-order-1');
      expect(asc[1]!.name).toBe('ts-order-3');
      expect(asc[2]!.name).toBe('ts-order-2');

      const desc = await client.db.TimestampTest.findMany({
        orderBy: { createdAt: 'desc' },
      });

      expect(desc).toHaveLength(3);
      expect(desc[0]!.name).toBe('ts-order-2');
      expect(desc[1]!.name).toBe('ts-order-3');
      expect(desc[2]!.name).toBe('ts-order-1');
    });

    test('select with timestamps and meta object together', async () => {
      const record = await client.db.TimestampTest.create({
        data: {
          name: 'select-combo',
          meta: { label: 'combo-meta' },
        },
      });

      const found = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
        select: {
          name: true,
          createdAt: true,
          updatedAt: true,
          accessedAt: true,
          meta: { label: true, updatedAt: true },
        },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('select-combo');
      expect(found!.createdAt).toBeInstanceOf(Date);
      expect(found!.updatedAt).toBeInstanceOf(Date);
      expect(found!.accessedAt).toBeInstanceOf(Date);
      expect(found!.meta!.label).toBe('combo-meta');
      expect(found!.meta!.updatedAt).toBeInstanceOf(Date);
      // Sub-fields not selected should be absent
      expect((found!.meta as Record<string, unknown>).createdAt).toBeUndefined();
    });
  });
});
