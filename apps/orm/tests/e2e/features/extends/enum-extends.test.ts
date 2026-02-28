import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import { type CerialClient, cleanupTables, createTestClient, ENUM_TABLES, testConfig, truncateTables } from './helpers';

describe('E2E Extends: Enum Inheritance', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ENUM_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ENUM_TABLES);
  });

  describe('create with ExtExtendedRole (inherit + add)', () => {
    test('creates with inherited ADMIN value', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: {
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.role).toBe('ADMIN');
    });

    test('creates with inherited USER value', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'USER', status: 'ACTIVE' },
      });

      expect(result.role).toBe('USER');
    });

    test('creates with inherited MODERATOR value', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'MODERATOR', status: 'ACTIVE' },
      });

      expect(result.role).toBe('MODERATOR');
    });

    test('creates with new SUPERADMIN value', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'SUPERADMIN', status: 'ACTIVE' },
      });

      expect(result.role).toBe('SUPERADMIN');
    });

    test('creates with new GUEST value', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'GUEST', status: 'PENDING' },
      });

      expect(result.role).toBe('GUEST');
    });
  });

  describe('create with ExtDetailedStatus (inherit + add)', () => {
    test('creates with inherited ACTIVE status', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });

      expect(result.status).toBe('ACTIVE');
    });

    test('creates with inherited INACTIVE status', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'INACTIVE' },
      });

      expect(result.status).toBe('INACTIVE');
    });

    test('creates with inherited PENDING status', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'PENDING' },
      });

      expect(result.status).toBe('PENDING');
    });

    test('creates with new ARCHIVED status', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ARCHIVED' },
      });

      expect(result.status).toBe('ARCHIVED');
    });

    test('creates with new DELETED status', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'DELETED' },
      });

      expect(result.status).toBe('DELETED');
    });

    test('creates with new SUSPENDED status', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'SUSPENDED' },
      });

      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('where filtering on inherited enum values', () => {
    test('filters by inherited role value', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'USER', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'GUEST', status: 'ACTIVE' } });

      const results = await client.db.ExtEnumModel.findMany({
        where: { role: 'ADMIN' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.role).toBe('ADMIN');
    });

    test('filters by inherited status with eq operator', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'USER', status: 'PENDING' } });

      const results = await client.db.ExtEnumModel.findMany({
        where: { status: { eq: 'ACTIVE' } },
      });

      expect(results).toHaveLength(1);
    });

    test('filters by inherited values using in operator', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'USER', status: 'INACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'GUEST', status: 'ARCHIVED' } });

      const results = await client.db.ExtEnumModel.findMany({
        where: { status: { in: ['ACTIVE', 'INACTIVE'] } },
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('where filtering on new enum values', () => {
    test('filters by new SUPERADMIN value', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'SUPERADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });

      const results = await client.db.ExtEnumModel.findMany({
        where: { role: 'SUPERADMIN' },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.role).toBe('SUPERADMIN');
    });

    test('filters by new status values with notIn', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ARCHIVED' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'SUSPENDED' } });

      const results = await client.db.ExtEnumModel.findMany({
        where: { status: { notIn: ['ACTIVE'] } },
      });

      expect(results).toHaveLength(2);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual(['ARCHIVED', 'SUSPENDED']);
    });

    test('filters with AND on inherited + new values', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'SUPERADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'SUPERADMIN', status: 'SUSPENDED' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });

      const results = await client.db.ExtEnumModel.findMany({
        where: { AND: [{ role: 'SUPERADMIN' }, { status: 'ACTIVE' }] },
      });

      expect(results).toHaveLength(1);
    });
  });

  describe('orderBy on enum fields', () => {
    test('orders by role asc', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'USER', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'GUEST', status: 'ACTIVE' } });

      const results = await client.db.ExtEnumModel.findMany({
        orderBy: { role: 'asc' },
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.role).toBe('ADMIN');
      expect(results[1]!.role).toBe('GUEST');
      expect(results[2]!.role).toBe('USER');
    });

    test('orders by status desc', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'PENDING' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'DELETED' } });

      const results = await client.db.ExtEnumModel.findMany({
        orderBy: { status: 'desc' },
      });

      expect(results[0]!.status).toBe('PENDING');
      expect(results[1]!.status).toBe('DELETED');
      expect(results[2]!.status).toBe('ACTIVE');
    });
  });

  describe('ExtCoreRole pick verification', () => {
    test('creates with coreRole ADMIN (picked value)', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE', coreRole: 'ADMIN' },
      });

      expect(result.coreRole).toBe('ADMIN');
    });

    test('creates with coreRole USER (picked value)', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE', coreRole: 'USER' },
      });

      expect(result.coreRole).toBe('USER');
    });

    test('coreRole is optional', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });

      expect(result.coreRole).toBeUndefined();
    });
  });

  describe('ExtNonAdminRole omit verification', () => {
    test('creates with nonAdminRole USER (ADMIN omitted)', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE', nonAdminRole: 'USER' },
      });

      expect(result.nonAdminRole).toBe('USER');
    });

    test('creates with nonAdminRole MODERATOR (ADMIN omitted)', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE', nonAdminRole: 'MODERATOR' },
      });

      expect(result.nonAdminRole).toBe('MODERATOR');
    });

    test('nonAdminRole is optional', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });

      expect(result.nonAdminRole).toBeUndefined();
    });
  });

  describe('array of extended enums', () => {
    test('creates with roles array (inherited + new values)', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: {
          role: 'ADMIN',
          status: 'ACTIVE',
          roles: ['ADMIN', 'SUPERADMIN', 'GUEST'],
        },
      });

      expect(result.roles).toEqual(['ADMIN', 'SUPERADMIN', 'GUEST']);
    });

    test('creates with empty roles array', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });

      expect(result.roles).toEqual([]);
    });

    test('creates with statuses array', async () => {
      const result = await client.db.ExtEnumModel.create({
        data: {
          role: 'ADMIN',
          status: 'ACTIVE',
          statuses: ['ACTIVE', 'ARCHIVED', 'DELETED'],
        },
      });

      expect(result.statuses).toEqual(['ACTIVE', 'ARCHIVED', 'DELETED']);
    });

    test('filters array with has operator', async () => {
      await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE', roles: ['ADMIN', 'SUPERADMIN'] },
      });
      await client.db.ExtEnumModel.create({
        data: { role: 'USER', status: 'ACTIVE', roles: ['USER', 'GUEST'] },
      });

      const results = await client.db.ExtEnumModel.findMany({
        where: { roles: { has: 'SUPERADMIN' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.roles).toContain('SUPERADMIN');
    });

    test('pushes to roles array', async () => {
      const created = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE', roles: ['ADMIN'] },
      });

      const updated = await client.db.ExtEnumModel.updateMany({
        where: { id: created.id },
        data: { roles: { push: 'MODERATOR' } },
      });

      expect(updated[0]!.roles).toContain('ADMIN');
      expect(updated[0]!.roles).toContain('MODERATOR');
    });
  });

  describe('object with extended enum fields (ExtEnumContainer)', () => {
    test('creates container with enum object', async () => {
      const result = await client.db.ExtEnumContainer.create({
        data: {
          name: 'Container1',
          details: {
            role: 'SUPERADMIN',
            status: 'ACTIVE',
            backupRole: 'ADMIN',
          },
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.name).toBe('Container1');
      expect(result.details.role).toBe('SUPERADMIN');
      expect(result.details.status).toBe('ACTIVE');
      expect(result.details.backupRole).toBe('ADMIN');
    });

    test('creates container with optional backupRole omitted', async () => {
      const result = await client.db.ExtEnumContainer.create({
        data: {
          name: 'Container2',
          details: { role: 'GUEST', status: 'PENDING' },
        },
      });

      expect(result.details.role).toBe('GUEST');
      expect(result.details.backupRole).toBeUndefined();
    });

    test('creates container with detailsList array', async () => {
      const result = await client.db.ExtEnumContainer.create({
        data: {
          name: 'Container3',
          details: { role: 'ADMIN', status: 'ACTIVE' },
          detailsList: [
            { role: 'USER', status: 'ACTIVE', backupRole: 'USER' },
            { role: 'MODERATOR', status: 'SUSPENDED' },
          ],
        },
      });

      expect(result.detailsList).toHaveLength(2);
      expect(result.detailsList[0]!.role).toBe('USER');
      expect(result.detailsList[1]!.role).toBe('MODERATOR');
    });

    test('filters container by details enum sub-field', async () => {
      await client.db.ExtEnumContainer.create({
        data: {
          name: 'FindMe',
          details: { role: 'SUPERADMIN', status: 'ACTIVE' },
        },
      });
      await client.db.ExtEnumContainer.create({
        data: {
          name: 'NotMe',
          details: { role: 'GUEST', status: 'INACTIVE' },
        },
      });

      const results = await client.db.ExtEnumContainer.findMany({
        where: { details: { role: 'SUPERADMIN' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('FindMe');
    });
  });

  describe('update enum fields', () => {
    test('updates role to new extended value', async () => {
      const created = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });

      const updated = await client.db.ExtEnumModel.updateMany({
        where: { id: created.id },
        data: { role: 'SUPERADMIN' },
      });

      expect(updated[0]!.role).toBe('SUPERADMIN');
    });

    test('updates status from inherited to new value', async () => {
      const created = await client.db.ExtEnumModel.create({
        data: { role: 'ADMIN', status: 'ACTIVE' },
      });

      const updated = await client.db.ExtEnumModel.updateMany({
        where: { id: created.id },
        data: { status: 'ARCHIVED' },
      });

      expect(updated[0]!.status).toBe('ARCHIVED');
    });
  });

  describe('select on enum fields', () => {
    test('selects only role field', async () => {
      await client.db.ExtEnumModel.create({
        data: { role: 'SUPERADMIN', status: 'DELETED' },
      });

      const results = await client.db.ExtEnumModel.findMany({
        select: { role: true },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.role).toBe('SUPERADMIN');
      expect('status' in results[0]!).toBe(false);
    });
  });

  describe('count and exists', () => {
    test('count with enum filter', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'INACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'USER', status: 'ACTIVE' } });

      const count = await client.db.ExtEnumModel.count({ role: 'ADMIN' });

      expect(count).toBe(2);
    });

    test('exists with new enum value', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'SUPERADMIN', status: 'ACTIVE' } });

      const exists = await client.db.ExtEnumModel.exists({ role: 'SUPERADMIN' });
      const notExists = await client.db.ExtEnumModel.exists({ role: 'GUEST' });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('findMany (no args)', () => {
    test('returns all with extended enum values', async () => {
      await client.db.ExtEnumModel.create({ data: { role: 'ADMIN', status: 'ACTIVE' } });
      await client.db.ExtEnumModel.create({ data: { role: 'SUPERADMIN', status: 'ARCHIVED' } });

      const all = await client.db.ExtEnumModel.findMany();

      expect(all).toHaveLength(2);
      for (const item of all) {
        expect(item.id).toBeInstanceOf(CerialId);
        expect(item.role).toBeDefined();
        expect(item.status).toBeDefined();
      }
    });
  });
});
