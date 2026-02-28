import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  MODEL_TABLES,
  testConfig,
  truncateTables,
  uniqueEmail,
} from './helpers';

describe('E2E Extends: Field Override & Default Behavior', () => {
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

  describe('ExtSuperAdmin defaults', () => {
    // ExtSuperAdmin extends ExtBaseUser: id, createdAt, updatedAt, email, name, isActive, role, level, canDeleteUsers

    test('role defaults to superadmin', async () => {
      const email = uniqueEmail('sa');
      const result = await client.db.ExtSuperAdmin.create({
        data: { email, name: 'Super' },
      });

      expect(result.role).toBe('superadmin'); // @default('superadmin')
    });

    test('level defaults to 99', async () => {
      const email = uniqueEmail('sa-level');
      const result = await client.db.ExtSuperAdmin.create({
        data: { email, name: 'LevelCheck' },
      });

      expect(result.level).toBe(99); // @default(99)
    });

    test('canDeleteUsers defaults to true', async () => {
      const email = uniqueEmail('sa-can');
      const result = await client.db.ExtSuperAdmin.create({
        data: { email, name: 'CanDelete' },
      });

      expect(result.canDeleteUsers).toBe(true); // @default(true)
    });

    test('all defaults applied together', async () => {
      const email = uniqueEmail('sa-all');
      const result = await client.db.ExtSuperAdmin.create({
        data: { email, name: 'AllDefaults' },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.email).toBe(email);
      expect(result.name).toBe('AllDefaults');
      expect(result.isActive).toBe(true); // from ExtBaseUser
      expect(result.role).toBe('superadmin'); // own default
      expect(result.level).toBe(99); // own default
      expect(result.canDeleteUsers).toBe(true); // own default
    });

    test('can override defaults on create', async () => {
      const email = uniqueEmail('sa-override');
      const result = await client.db.ExtSuperAdmin.create({
        data: {
          email,
          name: 'Custom',
          role: 'megaadmin',
          level: 100,
          canDeleteUsers: false,
          isActive: false,
        },
      });

      expect(result.role).toBe('megaadmin');
      expect(result.level).toBe(100);
      expect(result.canDeleteUsers).toBe(false);
      expect(result.isActive).toBe(false);
    });

    test('update overridden field', async () => {
      const email = uniqueEmail('sa-upd');
      const created = await client.db.ExtSuperAdmin.create({
        data: { email, name: 'Updatable' },
      });

      const updated = await client.db.ExtSuperAdmin.updateUnique({
        where: { id: created.id },
        data: { role: 'custom_role', level: 50 },
      });

      expect(updated).not.toBeNull();
      expect(updated!.role).toBe('custom_role');
      expect(updated!.level).toBe(50);
    });
  });

  describe('inherited defaults from parent', () => {
    test('ExtUser gets isActive: true from ExtBaseUser', async () => {
      const email = uniqueEmail('inh-def');
      const result = await client.db.ExtUser.create({
        data: { email, name: 'InheritDefault' },
      });

      expect(result.isActive).toBe(true);
    });

    test('ExtUser gets role: user from own @default', async () => {
      const email = uniqueEmail('inh-role');
      const result = await client.db.ExtUser.create({
        data: { email, name: 'DefaultRole' },
      });

      expect(result.role).toBe('user');
    });

    test('ExtAdmin gets level: 1 from own @default', async () => {
      const email = uniqueEmail('admin-def');
      const result = await client.db.ExtAdmin.create({
        data: { email, name: 'AdminDefault' },
      });

      expect(result.level).toBe(1);
    });

    test('ExtAdmin permissions defaults to empty array', async () => {
      const email = uniqueEmail('admin-perm');
      const result = await client.db.ExtAdmin.create({
        data: { email, name: 'PermDefault' },
      });

      expect(result.permissions).toEqual([]);
    });
  });

  describe('ExtPremiumUser (multi-level defaults)', () => {
    // ExtPremiumUser extends ExtUser extends ExtBaseUser extends ExtBaseEntity

    test('inherits all defaults from parent chain', async () => {
      const email = uniqueEmail('prem');
      const result = await client.db.ExtPremiumUser.create({
        data: { email, name: 'Premium' },
      });

      // From ExtBaseUser
      expect(result.isActive).toBe(true);
      // From ExtUser
      expect(result.role).toBe('user');
      // Own defaults
      expect(result.subscriptionTier).toBe('basic');
      expect(result.subscriptionEnd).toBeUndefined();
      expect(result.age).toBeUndefined();
    });

    test('can override all levels of defaults', async () => {
      const email = uniqueEmail('prem-over');
      const result = await client.db.ExtPremiumUser.create({
        data: {
          email,
          name: 'PremOver',
          isActive: false,
          role: 'vip',
          age: 35,
          subscriptionTier: 'gold',
          subscriptionEnd: new Date('2025-12-31'),
        },
      });

      expect(result.isActive).toBe(false);
      expect(result.role).toBe('vip');
      expect(result.age).toBe(35);
      expect(result.subscriptionTier).toBe('gold');
      expect(result.subscriptionEnd).toBeInstanceOf(Date);
    });
  });

  describe('ExtSystemAdmin (multi-level with omit)', () => {
    // ExtSystemAdmin extends ExtAdmin (which omits isActive from ExtBaseUser)

    test('inherits defaults from ExtAdmin', async () => {
      const email = uniqueEmail('sys');
      const result = await client.db.ExtSystemAdmin.create({
        data: { email, name: 'SysAdmin' },
      });

      // From ExtAdmin
      expect(result.level).toBe(1);
      expect(result.permissions).toEqual([]);
      // Own defaults
      expect(result.systemAccess).toBe(false);
      expect(result.auditLog).toEqual([]);
      // Still no isActive (omitted in ExtAdmin)
      expect('isActive' in result).toBe(false);
    });

    test('can set own fields', async () => {
      const email = uniqueEmail('sys-set');
      const result = await client.db.ExtSystemAdmin.create({
        data: {
          email,
          name: 'SysSet',
          systemAccess: true,
          auditLog: ['login', 'config_change'],
          level: 5,
          permissions: ['read', 'write', 'admin'],
        },
      });

      expect(result.systemAccess).toBe(true);
      expect(result.auditLog).toEqual(['login', 'config_change']);
      expect(result.level).toBe(5);
      expect(result.permissions).toEqual(['read', 'write', 'admin']);
    });

    test('update array fields from different levels', async () => {
      const email = uniqueEmail('sys-arr');
      const created = await client.db.ExtSystemAdmin.create({
        data: { email, name: 'SysArr' },
      });

      const updated = await client.db.ExtSystemAdmin.updateMany({
        where: { id: created.id },
        data: {
          permissions: { push: 'sudo' },
          auditLog: { push: 'sudo_used' },
        },
      });

      expect(updated[0]!.permissions).toContain('sudo');
      expect(updated[0]!.auditLog).toContain('sudo_used');
    });
  });

  describe('upsert with inherited defaults', () => {
    test('upsert creates with defaults', async () => {
      const email = uniqueEmail('ups-create');
      const result = await client.db.ExtUser.upsert({
        where: { email },
        create: { email, name: 'Upserted' },
        update: { name: 'Updated' },
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Upserted');
      expect(result!.isActive).toBe(true);
      expect(result!.role).toBe('user');
    });

    test('upsert updates existing', async () => {
      const email = uniqueEmail('ups-update');
      await client.db.ExtUser.create({
        data: { email, name: 'Original', role: 'admin' },
      });

      const result = await client.db.ExtUser.upsert({
        where: { email },
        create: { email, name: 'Should Not Create' },
        update: { name: 'Updated' },
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated');
      expect(result!.role).toBe('admin'); // preserved from original
    });
  });
});
