import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { RecordId } from 'surrealdb';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  MULTI_LEVEL_TABLES,
  testConfig,
  truncateTables,
} from './helpers';

describe('E2E Extends: Multi-Level Chains', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, MULTI_LEVEL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, MULTI_LEVEL_TABLES);
  });

  describe('ExtL4Concrete (L1 → L2 → L3 → L4)', () => {
    // ExtL4Concrete: id, createdAt?, name, description?, tags[], metadata?, status, priority

    test('create with all accumulated fields', async () => {
      const result = await client.db.ExtL4Concrete.create({
        data: {
          name: 'Concrete Item',
          description: 'A description',
          tags: ['tag1', 'tag2'],
          metadata: 42,
          status: 'pending',
          priority: 5,
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('Concrete Item'); // from L2
      expect(result.description).toBe('A description'); // from L2
      expect(result.tags).toEqual(['tag1', 'tag2']); // from L3
      expect(result.metadata).toBe(42); // from L3
      expect(result.status).toBe('pending'); // own
      expect(result.priority).toBe(5); // own
    });

    test('create with defaults only', async () => {
      const result = await client.db.ExtL4Concrete.create({
        data: { name: 'Minimal' },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('Minimal');
      expect(result.description).toBeUndefined();
      expect(result.tags).toEqual([]); // array default
      expect(result.metadata).toBeUndefined();
      expect(result.status).toBe('active'); // @default('active')
      expect(result.priority).toBe(0); // @default(0)
    });

    test('field accumulation — all levels contribute', async () => {
      const metadata = client.db.ExtL4Concrete.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);

      // L1: id, createdAt
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('createdAt');
      // L2: name, description
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('description');
      // L3: tags, metadata
      expect(fieldNames).toContain('tags');
      expect(fieldNames).toContain('metadata');
      // L4: status, priority
      expect(fieldNames).toContain('status');
      expect(fieldNames).toContain('priority');
    });

    test('update fields from different levels', async () => {
      const created = await client.db.ExtL4Concrete.create({
        data: { name: 'Original', status: 'active', priority: 1 },
      });

      const updated = await client.db.ExtL4Concrete.updateMany({
        where: { id: created.id },
        data: { name: 'Updated', status: 'done', priority: 10 },
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]!.name).toBe('Updated'); // L2 field
      expect(updated[0]!.status).toBe('done'); // L4 field
      expect(updated[0]!.priority).toBe(10); // L4 field
    });

    test('filter by fields from different levels', async () => {
      await client.db.ExtL4Concrete.create({
        data: { name: 'Alpha', status: 'active', priority: 1, tags: ['important'] },
      });
      await client.db.ExtL4Concrete.create({
        data: { name: 'Beta', status: 'done', priority: 2, tags: ['done'] },
      });

      const active = await client.db.ExtL4Concrete.findMany({
        where: { status: 'active' },
      });
      expect(active).toHaveLength(1);
      expect(active[0]!.name).toBe('Alpha');

      const byName = await client.db.ExtL4Concrete.findMany({
        where: { name: { contains: 'lph' } },
      });
      expect(byName).toHaveLength(1);
    });
  });

  describe('ExtL6UltraDeep (6-level chain)', () => {
    // L1: id, createdAt
    // L2: name, description
    // L3: tags, metadata
    // L4: status, priority
    // L5: archived
    // L6: archiveReason, archivedAt

    test('create with all fields from 6 levels', async () => {
      const result = await client.db.ExtL6UltraDeep.create({
        data: {
          name: 'Ultra Deep',
          description: 'Deep chain',
          tags: ['deep'],
          metadata: 99,
          status: 'archived',
          priority: 1,
          archived: true,
          archiveReason: 'Obsolete',
          archivedAt: new Date('2024-01-01'),
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('Ultra Deep'); // L2
      expect(result.description).toBe('Deep chain'); // L2
      expect(result.tags).toEqual(['deep']); // L3
      expect(result.metadata).toBe(99); // L3
      expect(result.status).toBe('archived'); // L4
      expect(result.priority).toBe(1); // L4
      expect(result.archived).toBe(true); // L5
      expect(result.archiveReason).toBe('Obsolete'); // L6
      expect(result.archivedAt).toBeInstanceOf(Date); // L6
    });

    test('create with defaults across all levels', async () => {
      const result = await client.db.ExtL6UltraDeep.create({
        data: { name: 'Defaults Only' },
      });

      expect(result.name).toBe('Defaults Only');
      expect(result.description).toBeUndefined();
      expect(result.tags).toEqual([]);
      expect(result.metadata).toBeUndefined();
      expect(result.status).toBe('active');
      expect(result.priority).toBe(0);
      expect(result.archived).toBe(false);
      expect(result.archiveReason).toBeUndefined();
      expect(result.archivedAt).toBeUndefined();
    });

    test('field count matches 6-level accumulation', () => {
      const metadata = client.db.ExtL6UltraDeep.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);

      // All 11 fields: id, createdAt, name, description, tags, metadata, status, priority, archived, archiveReason, archivedAt
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('description');
      expect(fieldNames).toContain('tags');
      expect(fieldNames).toContain('metadata');
      expect(fieldNames).toContain('status');
      expect(fieldNames).toContain('priority');
      expect(fieldNames).toContain('archived');
      expect(fieldNames).toContain('archiveReason');
      expect(fieldNames).toContain('archivedAt');
    });
  });

  describe('ExtL5VeryDeep (5-level chain)', () => {
    // L5: id, createdAt, name, description, tags, metadata, status, priority, archived

    test('create and verify fields from L1 through L5', async () => {
      const result = await client.db.ExtL5VeryDeep.create({
        data: {
          name: 'Five Deep',
          tags: ['l5'],
          archived: true,
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('Five Deep');
      expect(result.tags).toEqual(['l5']);
      expect(result.status).toBe('active');
      expect(result.priority).toBe(0);
      expect(result.archived).toBe(true);
    });
  });

  describe('Omit at intermediate level', () => {
    // ExtL4OmitConcrete: L3Omit extends L2Mid[!description]
    // Fields: id, createdAt, name, type, subtype?, version

    test('omitted field (description) is absent', async () => {
      const result = await client.db.ExtL4OmitConcrete.create({
        data: { name: 'OmitTest', type: 'typeA' },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('OmitTest'); // name from L2 (not omitted)
      expect(result.type).toBe('typeA'); // from L3Omit
      expect(result.version).toBe(1); // @default(1) from L4
      expect('description' in result).toBe(false); // omitted at L3
    });

    test('metadata shows no description field', () => {
      const metadata = client.db.ExtL4OmitConcrete.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);

      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('name');
      expect(fieldNames).not.toContain('description'); // omitted
      expect(fieldNames).toContain('type');
      expect(fieldNames).toContain('subtype');
      expect(fieldNames).toContain('version');
    });

    test('CRUD without description field', async () => {
      const created = await client.db.ExtL4OmitConcrete.create({
        data: { name: 'Crud', type: 'test', subtype: 'sub' },
      });

      const found = await client.db.ExtL4OmitConcrete.findOne({
        where: { id: created.id },
      });
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Crud');
      expect(found!.subtype).toBe('sub');

      const updated = await client.db.ExtL4OmitConcrete.updateMany({
        where: { id: created.id },
        data: { type: 'updated-type' },
      });
      expect(updated[0]!.type).toBe('updated-type');
    });
  });

  describe('Branch independence', () => {
    test('ExtL4Concrete and ExtL4AltConcrete have different fields', async () => {
      // ExtL4Concrete: id, createdAt, name, description, tags, metadata, status, priority
      const concrete = await client.db.ExtL4Concrete.create({
        data: { name: 'Concrete', status: 'active' },
      });

      // Create a record to use as owner (standalone Record field needs a real RecordId)
      const ownerRecord = await client.db.ExtL4Concrete.create({
        data: { name: 'OwnerTarget' },
      });

      // ExtL4AltConcrete: id, createdAt, name, description, owner (Record), isPublic, viewCount, lastViewed
      const alt = await client.db.ExtL4AltConcrete.create({
        data: { name: 'Alt', owner: new RecordId('ext_l4_concrete', ownerRecord.id.id) },
      });

      // Concrete has status/priority, not owner/isPublic
      expect(concrete.status).toBe('active');
      expect(concrete.priority).toBe(0);
      expect('owner' in concrete).toBe(false);
      expect('isPublic' in concrete).toBe(false);

      // Alt has owner/isPublic, not status/priority
      expect(alt.owner).toBeInstanceOf(CerialId);
      expect(alt.isPublic).toBe(false);
      expect('status' in alt).toBe(false);
      expect('priority' in alt).toBe(false);
    });

    test('ExtL4PickConcrete has category from L3Pick', async () => {
      // ExtL4PickConcrete: id, createdAt, name, description, category, subcategory?, rank?
      // L3Pick extends L2Mid (inherits all: name, description) + adds category
      const result = await client.db.ExtL4PickConcrete.create({
        data: { name: 'Picked', category: 'A' },
      });

      expect(result.name).toBe('Picked');
      expect(result.category).toBe('A');
      expect(result.subcategory).toBeUndefined();
      expect(result.rank).toBeUndefined();
    });

    test('branches do not share data', async () => {
      await client.db.ExtL4Concrete.create({ data: { name: 'BranchA' } });
      // Use a fabricated RecordId — standalone Record fields don't enforce FK existence
      await client.db.ExtL4AltConcrete.create({
        data: { name: 'BranchB', owner: new RecordId('ext_l4_concrete', 'fakeref') },
      });
      await client.db.ExtL4PickConcrete.create({
        data: { name: 'BranchC', category: 'cat' },
      });
      await client.db.ExtL4OmitConcrete.create({
        data: { name: 'BranchD', type: 'omit' },
      });

      const concretes = await client.db.ExtL4Concrete.findMany();
      const alts = await client.db.ExtL4AltConcrete.findMany();
      const picks = await client.db.ExtL4PickConcrete.findMany();
      const omits = await client.db.ExtL4OmitConcrete.findMany();

      expect(concretes).toHaveLength(1);
      expect(alts).toHaveLength(1);
      expect(picks).toHaveLength(1);
      expect(omits).toHaveLength(1);
    });
  });

  describe('select and orderBy on deep chains', () => {
    test('select fields from different levels in deep chain', async () => {
      await client.db.ExtL6UltraDeep.create({
        data: { name: 'SelectDeep', archived: true, archiveReason: 'test' },
      });

      const results = await client.db.ExtL6UltraDeep.findMany({
        select: { name: true, archived: true, archiveReason: true },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('SelectDeep');
      expect(results[0]!.archived).toBe(true);
      expect(results[0]!.archiveReason).toBe('test');
      expect('status' in results[0]!).toBe(false);
      expect('priority' in results[0]!).toBe(false);
    });

    test('orderBy on fields from different levels', async () => {
      await client.db.ExtL4Concrete.create({
        data: { name: 'Zebra', priority: 1 },
      });
      await client.db.ExtL4Concrete.create({
        data: { name: 'Apple', priority: 3 },
      });
      await client.db.ExtL4Concrete.create({
        data: { name: 'Mango', priority: 2 },
      });

      const byName = await client.db.ExtL4Concrete.findMany({
        orderBy: { name: 'asc' },
      });
      expect(byName[0]!.name).toBe('Apple');
      expect(byName[1]!.name).toBe('Mango');
      expect(byName[2]!.name).toBe('Zebra');

      const byPriority = await client.db.ExtL4Concrete.findMany({
        orderBy: { priority: 'desc' },
      });
      expect(byPriority[0]!.priority).toBe(3);
      expect(byPriority[1]!.priority).toBe(2);
      expect(byPriority[2]!.priority).toBe(1);
    });
  });
});
