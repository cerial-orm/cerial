/**
 * E2E Tests: @readonly Decorator
 *
 * Schema: readonly.cerial
 *
 * object ReadonlyAddress {
 *   street String
 *   city String @readonly
 *   zip String?
 * }
 *
 * object ReadonlyMeta {
 *   label String @readonly
 *   value Int
 * }
 *
 * model ReadonlyTest {
 *   id Record @id
 *   name String
 *   code String @readonly
 *   score Int? @readonly
 *   tags String[]
 *   createdBy String @readonly @default("system")
 *   address ReadonlyAddress
 *   meta ReadonlyMeta?
 * }
 *
 * model ReadonlyRecord {
 *   id Record @id
 *   name String
 *   authorId Record @readonly
 *   author Relation @field(authorId) @model(ReadonlyTest)
 * }
 *
 * @readonly behavior:
 * - Field is writable on CREATE
 * - Field is immutable after creation (SurrealDB READONLY)
 * - Excluded from Update types at compile time
 * - Runtime error if passed to update
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../../test-helper';

const READONLY_TABLES = ['readonly_test', 'readonly_record'];

describe('E2E @readonly Decorator', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, READONLY_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, READONLY_TABLES);
  });

  // ─── CREATE with @readonly fields ──────────────────────────────────

  describe('create with @readonly fields', () => {
    test('create: @readonly field can be set on creation', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Alice',
          code: 'ABC',
          address: { street: '1 Main', city: 'NYC' },
        },
      });

      expect(record.code).toBe('ABC');
      expect(record.name).toBe('Alice');
    });

    test('create: @readonly optional field can be null on creation', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Bob',
          code: 'XYZ',
          address: { street: '2 Elm', city: 'LA' },
        },
      });

      // score is optional, should be null when not provided (NONE → null mapping)
      expect(record.score == null).toBe(true);
    });

    test('create: @readonly optional field can be set on creation', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Carol',
          code: 'DEF',
          score: 100,
          address: { street: '3 Oak', city: 'SF' },
        },
      });

      expect(record.score).toBe(100);
    });

    test('create: @readonly @default field auto-fills when omitted', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Dave',
          code: 'GHI',
          address: { street: '4 Pine', city: 'LA' },
        },
      });

      expect(record.createdBy).toBe('system');
    });

    test('create: @readonly @default field accepts user value', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Eve',
          code: 'JKL',
          createdBy: 'admin',
          address: { street: '5 Maple', city: 'DC' },
        },
      });

      expect(record.createdBy).toBe('admin');
    });

    test('create: @readonly object sub-field can be set on creation', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Frank',
          code: 'MNO',
          address: { street: '6 Cedar', city: 'Boston' },
        },
      });

      expect(record.address.city).toBe('Boston');
      expect(record.address.street).toBe('6 Cedar');
    });

    test('create: @readonly meta sub-field can be set on creation', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Grace',
          code: 'PQR',
          address: { street: '7 Birch', city: 'Miami' },
          meta: { label: 'frozen', value: 42 },
        },
      });

      expect(record.meta).toBeDefined();
      expect(record.meta!.label).toBe('frozen');
      expect(record.meta!.value).toBe(42);
    });
  });

  // ─── UPDATE non-readonly fields (should succeed) ───────────────────

  describe('update non-readonly fields', () => {
    test('update: can update non-readonly field', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Alice',
          code: 'ABC',
          address: { street: '1 Main', city: 'NYC' },
        },
      });

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { name: 'Alice Updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Alice Updated');
      // Readonly fields should be preserved
      expect(updated!.code).toBe('ABC');
    });

    test('update: can update tags array (non-readonly)', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Bob',
          code: 'XYZ',
          tags: ['a'],
          address: { street: '2 Elm', city: 'LA' },
        },
      });

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { tags: ['a', 'b', 'c'] },
      });

      expect(updated).toBeDefined();
      expect(updated!.tags).toEqual(['a', 'b', 'c']);
    });

    test('update: can update non-readonly object sub-field', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Carol',
          code: 'DEF',
          address: { street: '3 Oak', city: 'SF' },
        },
      });

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { address: { street: '999 New St' } },
      });

      expect(updated).toBeDefined();
      expect(updated!.address.street).toBe('999 New St');
      // @readonly sub-field should be preserved
      expect(updated!.address.city).toBe('SF');
    });

    test('update: can update non-readonly meta sub-field', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Dave',
          code: 'GHI',
          address: { street: '4 Pine', city: 'LA' },
          meta: { label: 'original', value: 1 },
        },
      });

      const updated = await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { meta: { value: 99 } },
      });

      expect(updated).toBeDefined();
      expect(updated!.meta!.value).toBe(99);
      // @readonly sub-field should be preserved
      expect(updated!.meta!.label).toBe('original');
    });

    test('update: readonly fields preserved through multiple updates', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Eve',
          code: 'JKL',
          score: 50,
          address: { street: '5 Maple', city: 'DC' },
        },
      });

      await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { name: 'Eve v2' },
      });

      const final = await client.db.ReadonlyTest.updateUnique({
        where: { id: record.id },
        data: { name: 'Eve v3' },
      });

      expect(final).toBeDefined();
      expect(final!.name).toBe('Eve v3');
      expect(final!.code).toBe('JKL');
      expect(final!.score).toBe(50);
      expect(final!.address.city).toBe('DC');
    });
  });

  // ─── UPDATE @readonly fields (should fail at runtime) ──────────────

  describe('update @readonly fields (runtime error)', () => {
    test('update: throws when trying to update @readonly field', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Alice',
          code: 'ABC',
          address: { street: '1 Main', city: 'NYC' },
        },
      });

      // Validation throws synchronously during compile, before CerialQueryPromise is created
      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — 'code' is excluded from Update type, testing runtime guard
          data: { code: 'NEW' },
        });
      }).toThrow("readonly field 'code'");
    });

    test('update: throws when trying to update @readonly optional field', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Bob',
          code: 'XYZ',
          score: 10,
          address: { street: '2 Elm', city: 'LA' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — 'score' is excluded from Update type
          data: { score: 999 },
        });
      }).toThrow("readonly field 'score'");
    });

    test('update: throws when trying to update @readonly @default field', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Carol',
          code: 'DEF',
          address: { street: '3 Oak', city: 'SF' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateUnique({
          where: { id: record.id },
          // @ts-expect-error — 'createdBy' is excluded from Update type
          data: { createdBy: 'hacker' },
        });
      }).toThrow("readonly field 'createdBy'");
    });

    test('updateMany: throws when trying to update @readonly field', async () => {
      await client.db.ReadonlyTest.create({
        data: {
          name: 'Dave',
          code: 'GHI',
          address: { street: '4 Pine', city: 'LA' },
        },
      });

      expect(() => {
        client.db.ReadonlyTest.updateMany({
          where: { name: 'Dave' },
          // @ts-expect-error — 'code' is excluded from Update type
          data: { code: 'CHANGED' },
        });
      }).toThrow("readonly field 'code'");
    });
  });

  // ─── @readonly on PK Record (relation management blocked) ──────────

  describe('@readonly on PK Record field', () => {
    test('create: @readonly Record field can be set via create', async () => {
      const author = await client.db.ReadonlyTest.create({
        data: {
          name: 'Author',
          code: 'A1',
          address: { street: '1 St', city: 'NYC' },
        },
      });

      const post = await client.db.ReadonlyRecord.create({
        data: { name: 'Post 1', authorId: author.id },
      });

      expect(post.name).toBe('Post 1');
      expect(post.authorId).toBeDefined();
    });

    test('create: @readonly Record field can be set via nested connect', async () => {
      const author = await client.db.ReadonlyTest.create({
        data: {
          name: 'Author2',
          code: 'A2',
          address: { street: '2 St', city: 'LA' },
        },
      });

      const post = await client.db.ReadonlyRecord.create({
        data: { name: 'Post 2', author: { connect: author.id } },
      });

      expect(post.name).toBe('Post 2');
    });

    test('update: @readonly Record field is preserved through updates', async () => {
      const author = await client.db.ReadonlyTest.create({
        data: {
          name: 'Author3',
          code: 'A3',
          address: { street: '3 St', city: 'SF' },
        },
      });

      const post = await client.db.ReadonlyRecord.create({
        data: { name: 'Post 3', authorId: author.id },
      });

      const updated = await client.db.ReadonlyRecord.updateUnique({
        where: { id: post.id },
        data: { name: 'Post 3 Updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Post 3 Updated');
      // authorId should be preserved (readonly)
      expect(updated!.authorId!.toString()).toBe(author.id.toString());
    });

    test('update: throws when trying to update @readonly Record field', async () => {
      const author1 = await client.db.ReadonlyTest.create({
        data: {
          name: 'Author4',
          code: 'A4',
          address: { street: '4 St', city: 'DC' },
        },
      });
      const author2 = await client.db.ReadonlyTest.create({
        data: {
          name: 'Author5',
          code: 'A5',
          address: { street: '5 St', city: 'Miami' },
        },
      });

      const post = await client.db.ReadonlyRecord.create({
        data: { name: 'Post 4', authorId: author1.id },
      });

      // Validation throws synchronously during compile
      expect(() => {
        client.db.ReadonlyRecord.updateUnique({
          where: { id: post.id },
          // @ts-expect-error — 'authorId' is excluded from Update type (readonly Record)
          data: { authorId: author2.id },
        });
      }).toThrow("readonly field 'authorId'");
    });
  });

  // ─── Fetch / Select with @readonly fields ──────────────────────────

  describe('fetch and select @readonly fields', () => {
    test('findMany: @readonly fields are present in output', async () => {
      await client.db.ReadonlyTest.create({
        data: {
          name: 'Reader',
          code: 'RD',
          score: 42,
          address: { street: '1 St', city: 'NYC' },
        },
      });

      const results = await client.db.ReadonlyTest.findMany({
        where: { name: 'Reader' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.code).toBe('RD');
      expect(results[0]!.score).toBe(42);
      expect(results[0]!.createdBy).toBe('system');
    });

    test('findUnique: @readonly fields are selectable', async () => {
      const record = await client.db.ReadonlyTest.create({
        data: {
          name: 'Sel',
          code: 'SEL',
          address: { street: '2 St', city: 'LA' },
        },
      });

      const found = await client.db.ReadonlyTest.findUnique({
        where: { id: record.id },
        select: { code: true, name: true },
      });

      expect(found).toBeDefined();
      expect(found!.code).toBe('SEL');
      expect(found!.name).toBe('Sel');
    });

    test('findMany: @readonly fields can be used in where clause', async () => {
      await client.db.ReadonlyTest.create({
        data: {
          name: 'Filter1',
          code: 'F1',
          address: { street: '1 St', city: 'NYC' },
        },
      });
      await client.db.ReadonlyTest.create({
        data: {
          name: 'Filter2',
          code: 'F2',
          address: { street: '2 St', city: 'LA' },
        },
      });

      const results = await client.db.ReadonlyTest.findMany({
        where: { code: 'F1' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Filter1');
    });
  });

  // ─── Include with @readonly Record field ───────────────────────────

  describe('include with @readonly Record relation', () => {
    test('include: can include relation even though PK Record is @readonly', async () => {
      const author = await client.db.ReadonlyTest.create({
        data: {
          name: 'IncAuthor',
          code: 'INC',
          address: { street: '1 St', city: 'NYC' },
        },
      });

      const post = await client.db.ReadonlyRecord.create({
        data: { name: 'IncPost', authorId: author.id },
      });

      const result = await client.db.ReadonlyRecord.findUnique({
        where: { id: post.id },
        include: { author: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('IncPost');
      expect((result as any).author).toBeDefined();
      expect((result as any).author.name).toBe('IncAuthor');
    });
  });
});
