import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  MODEL_TABLES,
  testConfig,
  truncateTables,
  uniqueEmail,
} from './helpers';

describe('E2E Extends: Abstract Model Behavior', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, MODEL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, MODEL_TABLES);
  });

  describe('abstract model has no client accessor', () => {
    test('ExtBaseEntity is not accessible on client.db', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- checking abstract model absence
      expect((client.db as unknown as Record<string, unknown>).ExtBaseEntity).toBeUndefined();
    });

    test('ExtBaseUser is not accessible on client.db', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- checking abstract model absence
      expect((client.db as unknown as Record<string, unknown>).ExtBaseUser).toBeUndefined();
    });
  });

  describe('concrete child full CRUD', () => {
    test('create + findOne + update + delete on ExtUser', async () => {
      const email = uniqueEmail('crud');

      // Create
      const created = await client.db.ExtUser.create({
        data: { email, name: 'CRUD Test', age: 30, role: 'tester' },
      });
      expect(created.id).toBeInstanceOf(CerialId);
      expect(created.email).toBe(email);
      expect(created.name).toBe('CRUD Test');
      expect(created.age).toBe(30);
      expect(created.role).toBe('tester');
      expect(created.isActive).toBe(true);

      // FindOne
      const found = await client.db.ExtUser.findOne({
        where: { id: created.id },
      });
      expect(found).not.toBeNull();
      expect(found!.email).toBe(email);

      // Update
      const updated = await client.db.ExtUser.updateUnique({
        where: { id: created.id },
        data: { name: 'Updated', age: 31 },
      });
      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
      expect(updated!.age).toBe(31);

      // Delete
      const deleted = await client.db.ExtUser.deleteUnique({
        where: { id: created.id },
        return: true,
      });
      expect(deleted).toBe(true);

      // Verify deleted
      const afterDelete = await client.db.ExtUser.findOne({
        where: { id: created.id },
      });
      expect(afterDelete).toBeNull();
    });
  });

  describe('multiple children of same abstract base', () => {
    test('ExtUser and ExtAdmin extend ExtBaseUser independently', async () => {
      const userEmail = uniqueEmail('user');
      const adminEmail = uniqueEmail('admin');

      // ExtUser has: id, createdAt, updatedAt, email, name, isActive, age, role
      const user = await client.db.ExtUser.create({
        data: { email: userEmail, name: 'User' },
      });

      // ExtAdmin has: id, createdAt, updatedAt, email, name, level, permissions (no isActive)
      const admin = await client.db.ExtAdmin.create({
        data: { email: adminEmail, name: 'Admin' },
      });

      expect(user.id).toBeInstanceOf(CerialId);
      expect(admin.id).toBeInstanceOf(CerialId);

      // Different tables
      expect(user.id.table).not.toBe(admin.id.table);

      // ExtUser has isActive, ExtAdmin does not
      expect(user.isActive).toBe(true);
      expect('isActive' in admin).toBe(false);

      // ExtAdmin has level and permissions
      expect(admin.level).toBe(1); // @default(1)
      expect(admin.permissions).toEqual([]); // array default

      // Data isolation — each table has 1 record
      const users = await client.db.ExtUser.findMany();
      const admins = await client.db.ExtAdmin.findMany();
      expect(users).toHaveLength(1);
      expect(admins).toHaveLength(1);
    });

    test('ExtAdmin omits isActive from ExtBaseUser', async () => {
      const admin = await client.db.ExtAdmin.create({
        data: { email: uniqueEmail('admin-omit'), name: 'Admin' },
      });

      // Verify isActive is not on the model
      expect('isActive' in admin).toBe(false);
      expect(admin.email).toBeDefined();
      expect(admin.name).toBe('Admin');
      expect(admin.level).toBe(1);
      expect(admin.permissions).toEqual([]);
    });

    test('ExtModerator picks id and createdAt from ExtBaseEntity, adds own email and name', async () => {
      const email = uniqueEmail('mod');
      const mod = await client.db.ExtModerator.create({
        data: { email, name: 'Moderator' },
      });

      // Has picked fields from ExtBaseEntity
      expect(mod.id).toBeDefined();
      expect(mod.createdAt).toBeDefined();

      // Has own fields
      expect(mod.email).toBe(email);
      expect(mod.name).toBe('Moderator');
      expect(mod.bannedUntil).toBeUndefined();
      expect(mod.notes).toBeUndefined();

      // Does NOT have isActive or updatedAt (not picked, not own)
      expect('isActive' in mod).toBe(false);
      expect('updatedAt' in mod).toBe(false);
    });

    test('ExtModerator findUnique by id (has id field from pick)', async () => {
      const email = uniqueEmail('mod-find');
      const created = await client.db.ExtModerator.create({
        data: { email, name: 'FindMod' },
      });

      const found = await client.db.ExtModerator.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.name).toBe('FindMod');
    });
  });

  describe('empty-body model inheriting @id from abstract parent', () => {
    test('ExtEmptyChild has all inherited fields in metadata', () => {
      const metadata = client.db.ExtEmptyChild.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);
      // Inherits ALL from ExtBaseEntity: id, createdAt, updatedAt
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('updatedAt');
      expect(fieldNames).toHaveLength(3);
    });

    test('can create record with no data (all fields auto-generated)', async () => {
      const result = await client.db.ExtEmptyChild.create({
        data: {},
      });

      // Inherited id field works
      expect(result.id).toBeDefined();
      expect(result.id).toBeInstanceOf(CerialId);

      // Inherited timestamp decorators work
      expect(result.createdAt).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeDefined();
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    test('findUnique by inherited id', async () => {
      const created = await client.db.ExtEmptyChild.create({ data: {} });

      const found = await client.db.ExtEmptyChild.findUnique({
        where: { id: created.id },
      });

      expect(found).not.toBeNull();
      expect(found!.id.equals(created.id)).toBe(true);
      expect(found!.createdAt).toBeInstanceOf(Date);
    });

    test('findMany returns all records', async () => {
      await client.db.ExtEmptyChild.create({ data: {} });
      await client.db.ExtEmptyChild.create({ data: {} });

      const all = await client.db.ExtEmptyChild.findMany({});
      expect(all.length).toBeGreaterThanOrEqual(2);
      // Each has inherited id
      for (const record of all) {
        expect(record.id).toBeDefined();
        expect(record.id).toBeInstanceOf(CerialId);
      }
    });

    test('getTableName returns correct table', () => {
      expect(client.db.ExtEmptyChild.getTableName()).toBe('ext_empty_child');
    });

    test('getName returns correct model name', () => {
      expect(client.db.ExtEmptyChild.getName()).toBe('ExtEmptyChild');
    });
  });

  describe('abstract model metadata not in registry', () => {
    test('getTableName returns correct table for concrete model', () => {
      const tableName = client.db.ExtUser.getTableName();
      expect(tableName).toBe('ext_user');
    });

    test('getName returns correct model name', () => {
      const modelName = client.db.ExtUser.getName();
      expect(modelName).toBe('ExtUser');
    });

    test('getMetadata has correct field information', () => {
      const metadata = client.db.ExtUser.getMetadata();
      expect(metadata.name).toBe('ExtUser');
      expect(metadata.tableName).toBe('ext_user');

      // Should have all inherited + own fields
      const fieldNames = metadata.fields.map((f) => f.name);
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('updatedAt');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('isActive');
      expect(fieldNames).toContain('age');
      expect(fieldNames).toContain('role');
    });

    test('ExtAdmin getMetadata does not include isActive', () => {
      const metadata = client.db.ExtAdmin.getMetadata();
      const fieldNames = metadata.fields.map((f) => f.name);
      expect(fieldNames).not.toContain('isActive');
      expect(fieldNames).toContain('level');
      expect(fieldNames).toContain('permissions');
    });
  });

  describe('private fields inherited correctly', () => {
    test('ExtPrivateUser inherits id and createdAt from ExtBaseEntity', async () => {
      const email = uniqueEmail('priv');
      const priv = await client.db.ExtPrivateUser.create({
        data: { email, name: 'Private', publicBio: 'Hello' },
      });

      expect(priv.id).toBeInstanceOf(CerialId);
      expect(priv.email).toBe(email);
      expect(priv.name).toBe('Private');
      expect(priv.publicBio).toBe('Hello');
    });

    test('ExtPrivateUser fields are queryable', async () => {
      const email = uniqueEmail('priv-query');
      await client.db.ExtPrivateUser.create({
        data: { email, name: 'QueryPriv' },
      });

      const found = await client.db.ExtPrivateUser.findMany({
        where: { email },
      });

      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('QueryPriv');
    });
  });
});
