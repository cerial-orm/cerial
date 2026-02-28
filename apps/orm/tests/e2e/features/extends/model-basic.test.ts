import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
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

describe('E2E Extends: Basic Model Inheritance', () => {
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

  describe('create with inherited fields', () => {
    test('creates ExtUser with all inherited + own fields', async () => {
      const email = uniqueEmail('basic');
      const result = await client.db.ExtUser.create({
        data: {
          email,
          name: 'John Doe',
          age: 25,
          role: 'admin',
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.email).toBe(email);
      expect(result.name).toBe('John Doe');
      expect(result.age).toBe(25);
      expect(result.role).toBe('admin');
      expect(result.isActive).toBe(true); // @default(true) from ExtBaseUser
    });

    test('creates ExtUser with only required fields (defaults applied)', async () => {
      const email = uniqueEmail('minimal');
      const result = await client.db.ExtUser.create({
        data: { email, name: 'Min' },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.email).toBe(email);
      expect(result.name).toBe('Min');
      expect(result.isActive).toBe(true); // inherited default
      expect(result.role).toBe('user'); // own default
      expect(result.age).toBeUndefined(); // optional
    });

    test('creates ExtUser with explicit isActive override', async () => {
      const email = uniqueEmail('inactive');
      const result = await client.db.ExtUser.create({
        data: { email, name: 'Inactive', isActive: false },
      });

      expect(result.isActive).toBe(false);
    });
  });

  describe('findMany with where on inherited fields', () => {
    test('filters by inherited email field', async () => {
      const email = uniqueEmail('find');
      await client.db.ExtUser.create({ data: { email, name: 'Target' } });
      await client.db.ExtUser.create({ data: { email: uniqueEmail('other'), name: 'Other' } });

      const results = await client.db.ExtUser.findMany({
        where: { email },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.email).toBe(email);
    });

    test('filters by inherited isActive field', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('a1'), name: 'Active', isActive: true },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('a2'), name: 'Inactive', isActive: false },
      });

      const active = await client.db.ExtUser.findMany({
        where: { isActive: true },
      });

      expect(active).toHaveLength(1);
      expect(active[0]!.name).toBe('Active');
    });

    test('filters by own age field with comparison', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('young'), name: 'Young', age: 15 },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('adult'), name: 'Adult', age: 25 },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('senior'), name: 'Senior', age: 65 },
      });

      const adults = await client.db.ExtUser.findMany({
        where: { age: { gte: 18 } },
      });

      expect(adults).toHaveLength(2);
      const names = adults.map((a) => a.name).sort();
      expect(names).toEqual(['Adult', 'Senior']);
    });

    test('filters with AND on inherited + own fields', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('x1'), name: 'Alice', isActive: true, age: 30, role: 'admin' },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('x2'), name: 'Bob', isActive: true, age: 20, role: 'user' },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('x3'), name: 'Carol', isActive: false, age: 40, role: 'admin' },
      });

      const results = await client.db.ExtUser.findMany({
        where: { AND: [{ isActive: true }, { role: 'admin' }] },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Alice');
    });
  });

  describe('update inherited fields', () => {
    test('updates inherited name field', async () => {
      const email = uniqueEmail('upd');
      const created = await client.db.ExtUser.create({
        data: { email, name: 'Before' },
      });

      const updated = await client.db.ExtUser.updateMany({
        where: { id: created.id },
        data: { name: 'After' },
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]!.name).toBe('After');
    });

    test('updates inherited isActive field', async () => {
      const email = uniqueEmail('active-upd');
      const created = await client.db.ExtUser.create({
        data: { email, name: 'User', isActive: true },
      });

      const updated = await client.db.ExtUser.updateMany({
        where: { id: created.id },
        data: { isActive: false },
      });

      expect(updated[0]!.isActive).toBe(false);
    });

    test('updates own age field', async () => {
      const email = uniqueEmail('age-upd');
      const created = await client.db.ExtUser.create({
        data: { email, name: 'User', age: 20 },
      });

      const updated = await client.db.ExtUser.updateMany({
        where: { id: created.id },
        data: { age: 30 },
      });

      expect(updated[0]!.age).toBe(30);
    });
  });

  describe('select inherited fields', () => {
    test('selects only inherited fields', async () => {
      const email = uniqueEmail('sel');
      await client.db.ExtUser.create({
        data: { email, name: 'Selector', age: 25, role: 'admin' },
      });

      const results = await client.db.ExtUser.findMany({
        where: { email },
        select: { id: true, email: true },
      });

      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.id).toBeInstanceOf(CerialId);
      expect(result.email).toBe(email);
      // Non-selected fields should not be present
      expect('name' in result).toBe(false);
      expect('age' in result).toBe(false);
      expect('role' in result).toBe(false);
    });

    test('selects mix of inherited and own fields', async () => {
      const email = uniqueEmail('mix-sel');
      await client.db.ExtUser.create({
        data: { email, name: 'Mixed', age: 30, role: 'editor' },
      });

      const results = await client.db.ExtUser.findMany({
        where: { email },
        select: { name: true, age: true, role: true },
      });

      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.name).toBe('Mixed');
      expect(result.age).toBe(30);
      expect(result.role).toBe('editor');
      expect('id' in result).toBe(false);
      expect('email' in result).toBe(false);
    });
  });

  describe('orderBy on inherited fields', () => {
    test('orders by inherited createdAt asc', async () => {
      const e1 = uniqueEmail('o1');
      const e2 = uniqueEmail('o2');
      const e3 = uniqueEmail('o3');

      await client.db.ExtUser.create({ data: { email: e1, name: 'First' } });
      await client.db.ExtUser.create({ data: { email: e2, name: 'Second' } });
      await client.db.ExtUser.create({ data: { email: e3, name: 'Third' } });

      const results = await client.db.ExtUser.findMany({
        orderBy: { name: 'asc' },
      });

      expect(results).toHaveLength(3);
      expect(results[0]!.name).toBe('First');
      expect(results[1]!.name).toBe('Second');
      expect(results[2]!.name).toBe('Third');
    });

    test('orders by own age desc', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('y1'), name: 'Young', age: 20 },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('y2'), name: 'Old', age: 50 },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('y3'), name: 'Mid', age: 35 },
      });

      const results = await client.db.ExtUser.findMany({
        orderBy: { age: 'desc' },
      });

      expect(results[0]!.name).toBe('Old');
      expect(results[1]!.name).toBe('Mid');
      expect(results[2]!.name).toBe('Young');
    });
  });

  describe('delete', () => {
    test('deletes record by inherited field', async () => {
      const email = uniqueEmail('del');
      await client.db.ExtUser.create({ data: { email, name: 'ToDelete' } });

      const count = await client.db.ExtUser.deleteMany({
        where: { email },
      });

      expect(count).toBe(1);

      const found = await client.db.ExtUser.findOne({ where: { email } });
      expect(found).toBeNull();
    });

    test('deleteUnique by email (inherited @unique)', async () => {
      const email = uniqueEmail('del-uni');
      await client.db.ExtUser.create({ data: { email, name: 'Unique' } });

      const deleted = await client.db.ExtUser.deleteUnique({
        where: { email },
        return: true,
      });

      expect(deleted).toBe(true);
    });
  });

  describe('multiple models extending same base', () => {
    test('ExtUser and ExtProfile are independent tables', async () => {
      const email = uniqueEmail('indep');
      const user = await client.db.ExtUser.create({
        data: { email, name: 'User' },
      });

      await client.db.ExtProfile.create({
        data: { userId: new RecordId('ext_user', user.id.id), tags: ['a'] },
      });

      const users = await client.db.ExtUser.findMany();
      const profiles = await client.db.ExtProfile.findMany();

      expect(users).toHaveLength(1);
      expect(profiles).toHaveLength(1);
      expect(users[0]!.name).toBe('User');
      expect(profiles[0]!.tags).toEqual(['a']);
    });

    test('ExtUser and ExtAdmin share no data', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('u1'), name: 'User' },
      });
      await client.db.ExtAdmin.create({
        data: { email: uniqueEmail('a1'), name: 'Admin' },
      });

      const users = await client.db.ExtUser.findMany();
      const admins = await client.db.ExtAdmin.findMany();

      expect(users).toHaveLength(1);
      expect(admins).toHaveLength(1);
      expect(users[0]!.name).toBe('User');
      expect(admins[0]!.name).toBe('Admin');
    });
  });

  describe('findUnique on inherited @unique field', () => {
    test('finds by email (inherited @unique)', async () => {
      const email = uniqueEmail('uniq');
      await client.db.ExtUser.create({ data: { email, name: 'Unique' } });

      const found = await client.db.ExtUser.findUnique({
        where: { email },
      });

      expect(found).not.toBeNull();
      expect(found!.email).toBe(email);
      expect(found!.name).toBe('Unique');
    });

    test('returns null when not found', async () => {
      const found = await client.db.ExtUser.findUnique({
        where: { email: 'nonexistent@example.com' },
      });

      expect(found).toBeNull();
    });
  });

  describe('count and exists', () => {
    test('count with inherited field filter', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('c1'), name: 'A', isActive: true },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('c2'), name: 'B', isActive: false },
      });

      const total = await client.db.ExtUser.count();
      const active = await client.db.ExtUser.count({ isActive: true });

      expect(total).toBe(2);
      expect(active).toBe(1);
    });

    test('exists with inherited field filter', async () => {
      const email = uniqueEmail('exists');
      await client.db.ExtUser.create({
        data: { email, name: 'Exists' },
      });

      const exists = await client.db.ExtUser.exists({ email });
      const notExists = await client.db.ExtUser.exists({ email: 'nope@nope.com' });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('findMany (no args)', () => {
    test('returns all records with inherited fields', async () => {
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('all1'), name: 'A' },
      });
      await client.db.ExtUser.create({
        data: { email: uniqueEmail('all2'), name: 'B' },
      });

      const all = await client.db.ExtUser.findMany();

      expect(all).toHaveLength(2);
      for (const user of all) {
        expect(user.id).toBeInstanceOf(CerialId);
        expect(user.email).toBeDefined();
        expect(user.name).toBeDefined();
        expect(user.isActive).toBe(true);
        expect(user.role).toBe('user');
      }
    });
  });
});
