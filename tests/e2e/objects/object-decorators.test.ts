/**
 * E2E Tests: Object Field Decorators
 *
 * Schema: object-decorators.cerial
 * Tests @default, @now, @distinct, @unique, and @index decorators on object fields.
 *
 * object ContactInfo {
 *   email Email
 *   phone String?
 *   city String @default("Unknown")
 *   createdAt Date @now
 *   tags String[] @distinct
 * }
 *
 * object LocationInfo {
 *   address String
 *   zip String @unique
 *   country String @index
 * }
 *
 * model ObjDecUser {
 *   id Record @id
 *   name String
 *   contact ContactInfo
 *   location LocationInfo
 *   altLocation LocationInfo?
 * }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { isCerialId } from 'cerial';

describe('E2E Objects: Decorators', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.objectDecorators);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.objectDecorators);
  });

  describe('@default on object fields', () => {
    test('should apply default value when field is omitted', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Alice',
          contact: { email: 'alice@example.com' },
          location: { address: '123 Main St', zip: '10001', country: 'US' },
        },
      });

      expect(user.contact.city).toBe('Unknown');
    });

    test('should use provided value when explicitly set', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Bob',
          contact: { email: 'bob@example.com', city: 'NYC' },
          location: { address: '456 Oak Ave', zip: '10002', country: 'US' },
        },
      });

      expect(user.contact.city).toBe('NYC');
    });

    test('should apply default to multiple records independently', async () => {
      const user1 = await client.db.ObjDecUser.create({
        data: {
          name: 'Charlie',
          contact: { email: 'charlie@example.com' },
          location: { address: '1 First St', zip: '20001', country: 'US' },
        },
      });

      const user2 = await client.db.ObjDecUser.create({
        data: {
          name: 'Dave',
          contact: { email: 'dave@example.com', city: 'Boston' },
          location: { address: '2 Second St', zip: '20002', country: 'US' },
        },
      });

      expect(user1.contact.city).toBe('Unknown');
      expect(user2.contact.city).toBe('Boston');
    });
  });

  describe('@createdAt on object fields', () => {
    test('should auto-fill createdAt when omitted', async () => {
      const before = new Date();
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Eve',
          contact: { email: 'eve@example.com' },
          location: { address: '3 Third St', zip: '30001', country: 'US' },
        },
      });
      const after = new Date();

      expect(user.contact.createdAt).toBeDefined();
      expect(user.contact.createdAt).toBeInstanceOf(Date);
      // Timestamp should be between before and after (with 2s tolerance for DB clock)
      const ts = user.contact.createdAt!.getTime();
      expect(ts).toBeGreaterThanOrEqual(before.getTime() - 2000);
      expect(ts).toBeLessThanOrEqual(after.getTime() + 2000);
    });

    test('should auto-fill createdAt on each independent record', async () => {
      const user1 = await client.db.ObjDecUser.create({
        data: {
          name: 'Frank',
          contact: { email: 'frank@example.com' },
          location: { address: '4 Fourth St', zip: '30002', country: 'US' },
        },
      });

      // Small delay to ensure timestamps differ
      await new Promise((r) => setTimeout(r, 50));

      const user2 = await client.db.ObjDecUser.create({
        data: {
          name: 'Grace',
          contact: { email: 'grace@example.com' },
          location: { address: '5 Fifth St', zip: '30003', country: 'US' },
        },
      });

      expect(user1.contact.createdAt).toBeDefined();
      expect(user2.contact.createdAt).toBeDefined();
      // Both should have timestamps, potentially different
      expect(user1.contact.createdAt).toBeInstanceOf(Date);
      expect(user2.contact.createdAt).toBeInstanceOf(Date);
    });

    test('should preserve createdAt when queried back', async () => {
      const created = await client.db.ObjDecUser.create({
        data: {
          name: 'Hank',
          contact: { email: 'hank@example.com' },
          location: { address: '6 Sixth St', zip: '30004', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found!.contact.createdAt).toBeInstanceOf(Date);
      // Should be same timestamp
      expect(found!.contact.createdAt!.getTime()).toBe(created.contact.createdAt!.getTime());
    });
  });

  describe('@distinct on object array fields', () => {
    test('should deduplicate tags on create', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Ivy',
          contact: { email: 'ivy@example.com', tags: ['vip', 'active', 'vip', 'active', 'new'] },
          location: { address: '7 Seventh St', zip: '40001', country: 'US' },
        },
      });

      expect(user.contact.tags).toHaveLength(3);
      expect(user.contact.tags).toContain('vip');
      expect(user.contact.tags).toContain('active');
      expect(user.contact.tags).toContain('new');
    });

    test('should deduplicate tags with empty array', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Jack',
          contact: { email: 'jack@example.com', tags: [] },
          location: { address: '8 Eighth St', zip: '40002', country: 'US' },
        },
      });

      expect(user.contact.tags).toEqual([]);
    });

    test('should default tags to empty array when omitted', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Kate',
          contact: { email: 'kate@example.com' },
          location: { address: '9 Ninth St', zip: '40003', country: 'US' },
        },
      });

      expect(user.contact.tags).toEqual([]);
    });

    test('should preserve unique tags unchanged', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Leo',
          contact: { email: 'leo@example.com', tags: ['a', 'b', 'c'] },
          location: { address: '10 Tenth St', zip: '40004', country: 'US' },
        },
      });

      expect(user.contact.tags).toHaveLength(3);
    });

    test('should deduplicate on update', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Mike',
          contact: { email: 'mike@example.com', tags: ['x'] },
          location: { address: '11 Eleventh St', zip: '40005', country: 'US' },
        },
      });

      const updated = await client.db.ObjDecUser.updateUnique({
        where: { id: user.id },
        data: { contact: { tags: ['x', 'y', 'x', 'y', 'z'] } },
      });

      expect(updated).toBeDefined();
      expect(updated!.contact.tags).toHaveLength(3);
      expect(updated!.contact.tags).toContain('x');
      expect(updated!.contact.tags).toContain('y');
      expect(updated!.contact.tags).toContain('z');
    });
  });

  describe('@default + @createdAt combined in create', () => {
    test('should apply both @default and @createdAt when all are omitted', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Nora',
          contact: { email: 'nora@example.com' },
          location: { address: '12 Twelfth St', zip: '50001', country: 'US' },
        },
      });

      expect(user.contact.city).toBe('Unknown');
      expect(user.contact.createdAt).toBeInstanceOf(Date);
      expect(user.contact.tags).toEqual([]);
    });

    test('should allow overriding @default while @createdAt still fills', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Owen',
          contact: { email: 'owen@example.com', city: 'Seattle' },
          location: { address: '13 Thirteenth St', zip: '50002', country: 'US' },
        },
      });

      expect(user.contact.city).toBe('Seattle');
      expect(user.contact.createdAt).toBeInstanceOf(Date);
    });

    test('should include all fields in full create (no defaults applied)', async () => {
      const now = new Date();
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Pat',
          contact: {
            email: 'pat@example.com',
            phone: '555-0123',
            city: 'Denver',
            createdAt: now,
            tags: ['premium'],
          },
          location: { address: '14 Fourteenth St', zip: '50003', country: 'US' },
        },
      });

      expect(user.contact.email).toBe('pat@example.com');
      expect(user.contact.phone).toBe('555-0123');
      expect(user.contact.city).toBe('Denver');
      expect(user.contact.tags).toEqual(['premium']);
    });
  });

  describe('findUnique by object @unique field', () => {
    test('should find by location.zip', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Quinn',
          contact: { email: 'quinn@example.com' },
          location: { address: '100 Main', zip: '60001', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '60001' } },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Quinn');
      expect(found!.location.zip).toBe('60001');
    });

    test('should find by altLocation.zip', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Ray',
          contact: { email: 'ray@example.com' },
          location: { address: '101 Main', zip: '60002', country: 'US' },
          altLocation: { address: '102 Oak', zip: '60003', country: 'CA' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { altLocation: { zip: '60003' } },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Ray');
      expect(found!.altLocation!.zip).toBe('60003');
    });

    test('should return null when zip not found', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Sam',
          contact: { email: 'sam@example.com' },
          location: { address: '103 Main', zip: '60004', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '99999' } },
      });

      expect(found).toBeNull();
    });

    test('should find by id alongside object unique keys', async () => {
      const created = await client.db.ObjDecUser.create({
        data: {
          name: 'Tina',
          contact: { email: 'tina@example.com' },
          location: { address: '104 Main', zip: '60005', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { id: created.id },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Tina');
    });

    test('should find with additional where filters', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Uma',
          contact: { email: 'uma@example.com' },
          location: { address: '105 Main', zip: '60006', country: 'US' },
        },
      });

      // Match: zip matches and name filter matches
      const found = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '60006' }, name: 'Uma' },
      });
      expect(found).toBeDefined();
      expect(found!.name).toBe('Uma');

      // No match: zip matches but name filter doesn't
      const notFound = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '60006' }, name: 'NonExistent' },
      });
      expect(notFound).toBeNull();
    });

    test('should find with select on object unique query', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Vera',
          contact: { email: 'vera@example.com' },
          location: { address: '106 Main', zip: '60007', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '60007' } },
        select: { name: true, location: true },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Vera');
      expect(found!.location.zip).toBe('60007');
      // Non-selected fields should be absent
      expect((found as Record<string, unknown>).contact).toBeUndefined();
    });

    test('should find with sub-select on object fields', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Wendy',
          contact: { email: 'wendy@example.com', city: 'Portland' },
          location: { address: '107 Main', zip: '60008', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '60008' } },
        select: { name: true, contact: { email: true } },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Wendy');
      expect(found!.contact.email).toBe('wendy@example.com');
      // Sub-selected: only email should be present in contact
      expect((found!.contact as Record<string, unknown>).city).toBeUndefined();
    });
  });

  describe('updateUnique by object @unique field', () => {
    test('should update by location.zip', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Xander',
          contact: { email: 'xander@example.com' },
          location: { address: '200 Main', zip: '70001', country: 'US' },
        },
      });

      const updated = await client.db.ObjDecUser.updateUnique({
        where: { location: { zip: '70001' } },
        data: { name: 'Xander Updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Xander Updated');
    });

    test('should update by altLocation.zip', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Yara',
          contact: { email: 'yara@example.com' },
          location: { address: '201 Main', zip: '70002', country: 'US' },
          altLocation: { address: '202 Oak', zip: '70003', country: 'CA' },
        },
      });

      const updated = await client.db.ObjDecUser.updateUnique({
        where: { altLocation: { zip: '70003' } },
        data: { name: 'Yara Updated' },
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Yara Updated');
    });

    test('should update object sub-fields via updateUnique', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Zane',
          contact: { email: 'zane@example.com' },
          location: { address: '203 Main', zip: '70004', country: 'US' },
        },
      });

      const updated = await client.db.ObjDecUser.updateUnique({
        where: { location: { zip: '70004' } },
        data: { contact: { phone: '555-9999' } },
      });

      expect(updated).toBeDefined();
      expect(updated!.contact.phone).toBe('555-9999');
      // Other contact fields should remain
      expect(updated!.contact.email).toBe('zane@example.com');
    });

    test('should return before state with return: before', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Aria',
          contact: { email: 'aria@example.com' },
          location: { address: '204 Main', zip: '70005', country: 'US' },
        },
      });

      const before = await client.db.ObjDecUser.updateUnique({
        where: { location: { zip: '70005' } },
        data: { name: 'Aria Updated' },
        return: 'before',
      });

      expect(before).toBeDefined();
      expect(before!.name).toBe('Aria');
    });

    test('should return boolean with return: true', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Blake',
          contact: { email: 'blake@example.com' },
          location: { address: '205 Main', zip: '70006', country: 'US' },
        },
      });

      const result = await client.db.ObjDecUser.updateUnique({
        where: { location: { zip: '70006' } },
        data: { name: 'Blake Updated' },
        return: true,
      });

      expect(result).toBe(true);
    });

    test('should return false when record not found with return: true', async () => {
      const result = await client.db.ObjDecUser.updateUnique({
        where: { location: { zip: '99998' } },
        data: { name: 'Nobody' },
        return: true,
      });

      expect(result).toBe(false);
    });
  });

  describe('deleteUnique by object @unique field', () => {
    test('should delete by location.zip', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Carmen',
          contact: { email: 'carmen@example.com' },
          location: { address: '300 Main', zip: '80001', country: 'US' },
        },
      });

      const result = await client.db.ObjDecUser.deleteUnique({
        where: { location: { zip: '80001' } },
        return: true,
      });

      expect(result).toBe(true);

      // Verify deleted
      const found = await client.db.ObjDecUser.findUnique({
        where: { location: { zip: '80001' } },
      });
      expect(found).toBeNull();
    });

    test('should delete by altLocation.zip', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Drew',
          contact: { email: 'drew@example.com' },
          location: { address: '301 Main', zip: '80002', country: 'US' },
          altLocation: { address: '302 Oak', zip: '80003', country: 'CA' },
        },
      });

      const result = await client.db.ObjDecUser.deleteUnique({
        where: { altLocation: { zip: '80003' } },
        return: true,
      });

      expect(result).toBe(true);
    });

    test('should return false when record not found', async () => {
      const result = await client.db.ObjDecUser.deleteUnique({
        where: { location: { zip: '99997' } },
        return: true,
      });

      expect(result).toBe(false);
    });

    test('should return before state with return: before', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Elena',
          contact: { email: 'elena@example.com' },
          location: { address: '303 Main', zip: '80004', country: 'US' },
        },
      });

      const before = await client.db.ObjDecUser.deleteUnique({
        where: { location: { zip: '80004' } },
        return: 'before',
      });

      expect(before).toBeDefined();
      expect(before!.name).toBe('Elena');
      expect(before!.location.zip).toBe('80004');
    });
  });

  describe('upsert by object @unique field', () => {
    test('should create when record does not exist', async () => {
      const result = await client.db.ObjDecUser.upsert({
        where: { location: { zip: '90001' } },
        create: {
          name: 'Fiona',
          contact: { email: 'fiona@example.com' },
          location: { address: '400 Main', zip: '90001', country: 'US' },
        },
      });

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Fiona');
      expect(result!.location.zip).toBe('90001');
    });

    test('should update when record exists', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Gina',
          contact: { email: 'gina@example.com' },
          location: { address: '401 Main', zip: '90002', country: 'US' },
        },
      });

      const result = await client.db.ObjDecUser.upsert({
        where: { location: { zip: '90002' } },
        create: {
          name: 'Gina New',
          contact: { email: 'gina-new@example.com' },
          location: { address: '401 Main', zip: '90002', country: 'US' },
        },
        update: { name: 'Gina Updated' },
      });

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Gina Updated');
    });

    test('should upsert with select', async () => {
      const result = await client.db.ObjDecUser.upsert({
        where: { location: { zip: '90003' } },
        create: {
          name: 'Holly',
          contact: { email: 'holly@example.com' },
          location: { address: '402 Main', zip: '90003', country: 'US' },
        },
        select: { name: true, location: true },
      });

      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Holly');
      expect(result!.location.zip).toBe('90003');
      expect((result as Record<string, unknown>).contact).toBeUndefined();
    });
  });

  describe('where filtering on object sub-fields', () => {
    test('should filter by object sub-field in findMany', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Ian',
          contact: { email: 'ian@example.com' },
          location: { address: '500 Main', zip: 'A0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Jane',
          contact: { email: 'jane@example.com' },
          location: { address: '501 Main', zip: 'A0002', country: 'CA' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Kim',
          contact: { email: 'kim@example.com' },
          location: { address: '502 Main', zip: 'A0003', country: 'US' },
        },
      });

      const usUsers = await client.db.ObjDecUser.findMany({
        where: { location: { country: 'US' } },
      });

      expect(usUsers).toHaveLength(2);
      expect(usUsers.map((u) => u.name).sort()).toEqual(['Ian', 'Kim']);
    });

    test('should filter by nested object email (contact)', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Larry',
          contact: { email: 'larry@example.com', city: 'NYC' },
          location: { address: '503 Main', zip: 'B0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Mary',
          contact: { email: 'mary@example.com', city: 'LA' },
          location: { address: '504 Main', zip: 'B0002', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findMany({
        where: { contact: { city: 'NYC' } },
      });

      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('Larry');
    });

    test('should support AND with object sub-fields', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Nancy',
          contact: { email: 'nancy@example.com', city: 'Boston' },
          location: { address: '505 Main', zip: 'C0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Oscar',
          contact: { email: 'oscar@example.com', city: 'Boston' },
          location: { address: '506 Main', zip: 'C0002', country: 'CA' },
        },
      });

      const found = await client.db.ObjDecUser.findMany({
        where: {
          AND: [{ contact: { city: 'Boston' } }, { location: { country: 'US' } }],
        },
      });

      expect(found).toHaveLength(1);
      expect(found[0]!.name).toBe('Nancy');
    });
  });

  describe('count and exists with object sub-fields', () => {
    test('should count records matching object sub-field filter', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Pete',
          contact: { email: 'pete@example.com' },
          location: { address: '600 Main', zip: 'D0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Rita',
          contact: { email: 'rita@example.com' },
          location: { address: '601 Main', zip: 'D0002', country: 'CA' },
        },
      });

      const count = await client.db.ObjDecUser.count({ location: { country: 'US' } });
      expect(count).toBe(1);
    });

    test('should check existence with object sub-field filter', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Steve',
          contact: { email: 'steve@example.com' },
          location: { address: '602 Main', zip: 'E0001', country: 'US' },
        },
      });

      const exists = await client.db.ObjDecUser.exists({ location: { country: 'US' } });
      expect(exists).toBe(true);

      const notExists = await client.db.ObjDecUser.exists({ location: { country: 'JP' } });
      expect(notExists).toBe(false);
    });
  });

  describe('@unique constraint enforcement', () => {
    test('should reject duplicate location.zip values', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'User1',
          contact: { email: 'user1@example.com' },
          location: { address: '700 Main', zip: 'U0001', country: 'US' },
        },
      });

      await expect(
        (async () => {
          await client.db.ObjDecUser.create({
            data: {
              name: 'User2',
              contact: { email: 'user2@example.com' },
              location: { address: '701 Main', zip: 'U0001', country: 'CA' },
            },
          });
        })(),
      ).rejects.toThrow();
    });

    test('should allow same zip in different fields (location vs altLocation)', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'User3',
          contact: { email: 'user3@example.com' },
          location: { address: '702 Main', zip: 'U0002', country: 'US' },
          altLocation: { address: '703 Oak', zip: 'U0002', country: 'CA' },
        },
      });

      // Different indexes: location.zip and altLocation.zip are separate UNIQUE constraints
      expect(user.location.zip).toBe('U0002');
      expect(user.altLocation!.zip).toBe('U0002');
    });

    test('should reject duplicate altLocation.zip values', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'User4',
          contact: { email: 'user4@example.com' },
          location: { address: '704 Main', zip: 'U0003', country: 'US' },
          altLocation: { address: '705 Oak', zip: 'U0004', country: 'CA' },
        },
      });

      await expect(
        (async () => {
          await client.db.ObjDecUser.create({
            data: {
              name: 'User5',
              contact: { email: 'user5@example.com' },
              location: { address: '706 Main', zip: 'U0005', country: 'US' },
              altLocation: { address: '707 Oak', zip: 'U0004', country: 'CA' },
            },
          });
        })(),
      ).rejects.toThrow();
    });
  });

  describe('updateMany with object sub-field where', () => {
    test('should update multiple records matching object filter', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'User6',
          contact: { email: 'user6@example.com' },
          location: { address: '800 Main', zip: 'M0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'User7',
          contact: { email: 'user7@example.com' },
          location: { address: '801 Main', zip: 'M0002', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'User8',
          contact: { email: 'user8@example.com' },
          location: { address: '802 Main', zip: 'M0003', country: 'CA' },
        },
      });

      const updated = await client.db.ObjDecUser.updateMany({
        where: { location: { country: 'US' } },
        data: { name: 'Updated US User' },
      });

      expect(updated).toHaveLength(2);
      for (const u of updated) {
        expect(u.name).toBe('Updated US User');
      }
    });
  });

  describe('deleteMany with object sub-field where', () => {
    test('should delete multiple records matching object filter', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'User9',
          contact: { email: 'user9@example.com' },
          location: { address: '900 Main', zip: 'N0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'User10',
          contact: { email: 'user10@example.com' },
          location: { address: '901 Main', zip: 'N0002', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'User11',
          contact: { email: 'user11@example.com' },
          location: { address: '902 Main', zip: 'N0003', country: 'CA' },
        },
      });

      const deleted = await client.db.ObjDecUser.deleteMany({
        where: { location: { country: 'US' } },
      });

      expect(deleted).toBe(2);

      // Verify only CA record remains
      const remaining = await client.db.ObjDecUser.findMany({});
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.location.country).toBe('CA');
    });
  });

  describe('optional object with decorators', () => {
    test('should create with altLocation omitted', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Zara',
          contact: { email: 'zara@example.com' },
          location: { address: '1000 Main', zip: 'O0001', country: 'US' },
        },
      });

      expect(user.altLocation).toBeUndefined();
    });

    test('should create with altLocation provided', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Abe',
          contact: { email: 'abe@example.com' },
          location: { address: '1001 Main', zip: 'O0002', country: 'US' },
          altLocation: { address: '1002 Oak', zip: 'O0003', country: 'CA' },
        },
      });

      expect(user.altLocation).toBeDefined();
      expect(user.altLocation!.zip).toBe('O0003');
    });

    test('should update to add altLocation', async () => {
      const user = await client.db.ObjDecUser.create({
        data: {
          name: 'Beth',
          contact: { email: 'beth@example.com' },
          location: { address: '1003 Main', zip: 'O0004', country: 'US' },
        },
      });

      const updated = await client.db.ObjDecUser.updateUnique({
        where: { id: user.id },
        data: {
          altLocation: { set: { address: '1004 Oak', zip: 'O0005', country: 'CA' } },
        },
      });

      expect(updated).toBeDefined();
      expect(updated!.altLocation).toBeDefined();
      expect(updated!.altLocation!.zip).toBe('O0005');
    });
  });

  describe('findOne with object sub-field filters', () => {
    test('should find one record by object sub-field', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Cole',
          contact: { email: 'cole@example.com' },
          location: { address: '1100 Main', zip: 'P0001', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findOne({
        where: { location: { zip: 'P0001' } },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Cole');
    });

    test('should return null when no match', async () => {
      const found = await client.db.ObjDecUser.findOne({
        where: { location: { zip: 'NONEXISTENT' } },
      });

      expect(found).toBeNull();
    });
  });

  describe('select on object sub-fields', () => {
    test('should select specific contact sub-fields', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Dana',
          contact: { email: 'dana@example.com', phone: '555-1234', city: 'Miami' },
          location: { address: '1200 Main', zip: 'Q0001', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findOne({
        where: { name: 'Dana' },
        select: { name: true, contact: { email: true, city: true } },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Dana');
      expect(found!.contact.email).toBe('dana@example.com');
      expect(found!.contact.city).toBe('Miami');
      // phone not selected
      expect((found!.contact as Record<string, unknown>).phone).toBeUndefined();
    });

    test('should select entire object with boolean true', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Evan',
          contact: { email: 'evan@example.com' },
          location: { address: '1201 Main', zip: 'Q0002', country: 'US' },
        },
      });

      const found = await client.db.ObjDecUser.findOne({
        where: { name: 'Evan' },
        select: { name: true, location: true },
      });

      expect(found).toBeDefined();
      expect(found!.name).toBe('Evan');
      expect(found!.location.address).toBe('1201 Main');
      expect(found!.location.zip).toBe('Q0002');
      expect(found!.location.country).toBe('US');
    });
  });

  describe('orderBy on object sub-fields', () => {
    test('should order by object sub-field ascending', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Faye',
          contact: { email: 'faye@example.com' },
          location: { address: '1300 Main', zip: 'R0003', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Gail',
          contact: { email: 'gail@example.com' },
          location: { address: '1301 Main', zip: 'R0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Hope',
          contact: { email: 'hope@example.com' },
          location: { address: '1302 Main', zip: 'R0002', country: 'US' },
        },
      });

      const results = await client.db.ObjDecUser.findMany({
        orderBy: { location: { zip: 'asc' } },
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.location.zip).toBe('R0001');
      expect(results[1]!.location.zip).toBe('R0002');
      expect(results[2]!.location.zip).toBe('R0003');
    });

    test('should order by object sub-field descending', async () => {
      await client.db.ObjDecUser.create({
        data: {
          name: 'Iris',
          contact: { email: 'iris@example.com', city: 'Austin' },
          location: { address: '1400 Main', zip: 'S0001', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'June',
          contact: { email: 'june@example.com', city: 'Chicago' },
          location: { address: '1401 Main', zip: 'S0002', country: 'US' },
        },
      });
      await client.db.ObjDecUser.create({
        data: {
          name: 'Kate2',
          contact: { email: 'kate2@example.com', city: 'Boston' },
          location: { address: '1402 Main', zip: 'S0003', country: 'US' },
        },
      });

      const results = await client.db.ObjDecUser.findMany({
        orderBy: { contact: { city: 'desc' } },
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.contact.city).toBe('Chicago');
      expect(results[1]!.contact.city).toBe('Boston');
      expect(results[2]!.contact.city).toBe('Austin');
    });
  });
});
