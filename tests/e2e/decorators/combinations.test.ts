import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const COMBINATION_TABLES = [...tables.readonly, ...tables.timestamps, ...tables.defaultAlways];

const TIME_TOLERANCE = 5000;

function expectApproximatelyNow(date: Date | null | undefined, tolerance = TIME_TOLERANCE): void {
  expect(date).toBeDefined();
  expect(date).not.toBeNull();
  expect(date).toBeInstanceOf(Date);
  const now = Date.now();
  const ts = date!.getTime();
  expect(ts).toBeGreaterThanOrEqual(now - tolerance);
  expect(ts).toBeLessThanOrEqual(now + tolerance);
}

describe('E2E Decorator Combinations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, COMBINATION_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, COMBINATION_TABLES);
  });

  // ─── @readonly + @default on same field ──────────────────────────────

  describe('@readonly + @default on same field', () => {
    test('@default fills value on create, @readonly locks it from update', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'combo-default',
          code: 'CD1',
          address: { street: '1 Main', city: 'NYC' },
        },
      });

      expect(record.createdBy).toBe('system');

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — testing runtime guard for readonly field
          data: { createdBy: 'hacker' },
        });
      }).toThrow("readonly field 'createdBy'");

      const fetched = await client.db.ReadonlyTest.findUnique({
        where: { id: record.id },
      });
      expect(fetched!.createdBy).toBe('system');
    });

    test('@default overridden by user value, @readonly locks the override', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'combo-override',
          code: 'CD2',
          createdBy: 'admin',
          address: { street: '2 Elm', city: 'LA' },
        },
      });

      expect(record.createdBy).toBe('admin');

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — testing runtime guard for readonly field
          data: { createdBy: 'changed' },
        });
      }).toThrow("readonly field 'createdBy'");

      const fetched = await client.db.ReadonlyTest.findUnique({
        where: { id: record.id },
      });
      expect(fetched!.createdBy).toBe('admin');
    });
  });

  // ─── @createdAt + @updatedAt diverge after update ────────────────────

  describe('@createdAt + @updatedAt on same model', () => {
    test('createdAt stays fixed while updatedAt changes on update', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'ts-combo' },
      });
      const originalCreatedAt = record.createdAt!.getTime();
      const originalUpdatedAt = record.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { name: 'ts-combo-updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.createdAt!.getTime()).toBe(originalCreatedAt);
      expect(updated!.updatedAt!.getTime()).toBeGreaterThan(originalUpdatedAt);
    });
  });

  // ─── @now + @createdAt + @updatedAt triple coexistence ───────────────

  describe('@now + @createdAt + @updatedAt triple coexistence', () => {
    test('all three decorators produce independent correct values on read', async () => {
      const record = await client.db.TimestampTest.create({
        data: { name: 'triple-combo' },
      });

      expect(record.createdAt).toBeInstanceOf(Date);
      expect(record.updatedAt).toBeInstanceOf(Date);
      expect(record.accessedAt).toBeInstanceOf(Date);

      const createCreatedAt = record.createdAt!.getTime();
      const createUpdatedAt = record.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const fetched = await client.db.TimestampTest.findUnique({
        where: { id: record.id },
      });

      expect(fetched).toBeDefined();
      expect(fetched!.createdAt!.getTime()).toBe(createCreatedAt);
      expect(fetched!.updatedAt!.getTime()).toBe(createUpdatedAt);
      expect(fetched!.accessedAt!.getTime()).toBeGreaterThan(record.accessedAt!.getTime());
    });
  });

  // ─── @readonly + optional (?): set on create, immutable after ────────

  describe('@readonly + optional combined', () => {
    test('optional @readonly field can be omitted on create, but once set is immutable', async () => {
      const withoutScore = await client.db.ReadonlyTest.create({
        data: {
          name: 'opt-readonly-1',
          code: 'OR1',
          address: { street: '1 St', city: 'SF' },
        },
      });
      expect(withoutScore.score == null).toBe(true);

      const withScore = await client.db.ReadonlyTest.create({
        data: {
          name: 'opt-readonly-2',
          code: 'OR2',
          score: 42,
          address: { street: '2 St', city: 'SF' },
        },
      });
      expect(withScore.score).toBe(42);

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: withScore.id },
        data: { name: 'opt-readonly-2-v2' },
      });
      expect(updated!.score).toBe(42);

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: withScore.id },
          // @ts-expect-error — testing runtime guard for readonly field
          data: { score: 99 },
        });
      }).toThrow("readonly field 'score'");
    });
  });

  // ─── @defaultAlways: reset vs preserve ───────────────────────────────

  describe('@defaultAlways: reset vs preserve interaction', () => {
    test('all @defaultAlways fields reset while normal fields preserved', async () => {
      const created = await client.db.ContentItem.create({
        data: {
          title: 'Original Title',
          body: 'Original Body',
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

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { title: 'New Title' },
        return: 'after',
      });

      expect(updated!.title).toBe('New Title');
      expect(updated!.body).toBe('Original Body');
      expect(updated!.reviewed).toBe(false);
      expect(updated!.syncStatus).toBe('dirty');
      expect(updated!.retryCount).toBe(0);
      expect(updated!.score).toBe(1);
    });

    test('@defaultAlways on object sub-fields reset on partial merge', async () => {
      const created = await client.db.ContentItem.create({
        data: {
          title: 'Meta Test',
          body: 'content',
          meta: { note: 'approved', flagged: true },
        },
      });

      expect(created.meta!.note).toBe('approved');
      expect(created.meta!.flagged).toBe(true);

      const updated = await client.db.ContentItem.updateUnique({
        where: { id: created.id },
        data: { meta: { note: 'needs work' } },
        return: 'after',
      });

      expect(updated!.meta!.note).toBe('needs work');
      expect(updated!.meta!.flagged).toBe(false);
    });
  });

  // ─── @createdAt + @updatedAt on object sub-fields ────────────────────

  describe('@createdAt + @updatedAt on object sub-fields', () => {
    test('object sub-field: createdAt stays, updatedAt changes on update', async () => {
      const record = await client.db.TimestampTest.create({
        data: {
          name: 'obj-ts-combo',
          meta: { label: 'original' },
        },
      });

      expect(record.meta).toBeDefined();
      expectApproximatelyNow(record.meta!.createdAt);
      expectApproximatelyNow(record.meta!.updatedAt);

      const originalMetaCreatedAt = record.meta!.createdAt!.getTime();
      const originalMetaUpdatedAt = record.meta!.updatedAt!.getTime();

      await new Promise((r) => setTimeout(r, 1200));

      const updated = await client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        data: { meta: { label: 'updated' } },
      });

      expect(updated).toBeDefined();
      expect(updated!.meta).toBeDefined();
      expect(updated!.meta!.label).toBe('updated');
      expect(updated!.meta!.createdAt!.getTime()).toBe(originalMetaCreatedAt);
      expect(updated!.meta!.updatedAt!.getTime()).toBeGreaterThan(originalMetaUpdatedAt);
    });
  });

  // ─── Full lifecycle: multiple decorators across create → read → update

  describe('Full lifecycle with multiple decorators', () => {
    test('ReadonlyTest: @readonly + @default lifecycle across operations', async () => {
      const created = await client.db.ReadonlyTest.create({
        data: {
          name: 'lifecycle',
          code: 'LC1',
          score: 100,
          address: { street: '1 Main', city: 'Boston' },
        },
      });
      expect(created.code).toBe('LC1');
      expect(created.score).toBe(100);
      expect(created.createdBy).toBe('system');

      const read = await client.db.ReadonlyTest.findUnique({
        where: { id: created.id },
      });
      expect(read!.code).toBe('LC1');
      expect(read!.score).toBe(100);
      expect(read!.createdBy).toBe('system');

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: created.id },
        data: { name: 'lifecycle-v2', tags: ['a', 'b'] },
      });

      expect(updated!.name).toBe('lifecycle-v2');
      expect(updated!.tags).toEqual(['a', 'b']);
      expect(updated!.code).toBe('LC1');
      expect(updated!.score).toBe(100);
      expect(updated!.createdBy).toBe('system');

      const final = await client.db.ReadonlyTest.findUnique({
        where: { id: created.id },
      });
      expect(final!.code).toBe('LC1');
      expect(final!.score).toBe(100);
      expect(final!.createdBy).toBe('system');
    });
  });
});
