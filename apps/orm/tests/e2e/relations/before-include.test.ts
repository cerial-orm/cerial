/**
 * E2E Tests for `include` on `return: 'before'`
 *
 * The generated type offers `include` with `return: 'before'`, so the relation has to come back, as
 * it stood before the write. Every case asserts the exact key set and pairs a write that changes the
 * relation with a read of what it was.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

/** The keys a row carries, sorted. */
const keysOf = (row: object | null | undefined) => (row ? Object.keys(row).sort() : row);

describe('E2E return before honours include', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  const userData = { name: 'probe', email: 'probe@x.io', isActive: true };

  /** A user pointing at `old`, plus the profile it will be moved to. */
  const seed = async () => {
    const old = await client.db.Profile.create({ data: { bio: 'old' } });
    const next = await client.db.Profile.create({ data: { bio: 'new' } });
    const user = await client.db.User.create({ data: { ...userData, profileId: old.id } });

    return { old, next, user };
  };

  describe('updateUnique', () => {
    test('by id returns the relation as it was before the write', async () => {
      const { next, user } = await seed();
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profileId: next.id },
        include: { profile: true },
        return: 'before',
      });

      expect(row?.profile?.bio).toBe('old');
      expect(keysOf(row)).toContain('profile');
      expect(keysOf(row)).toContain('email');
      const after = await client.db.User.findOne({ where: { id: user.id }, include: { profile: true } });
      expect(after?.profile?.bio).toBe('new');
    });

    test('by unique field returns the relation as it was before the write', async () => {
      const { next } = await seed();
      const row = await client.db.User.updateUnique({
        where: { email: 'probe@x.io' },
        data: { profileId: next.id },
        include: { profile: true },
        return: 'before',
      });

      expect(row?.profile?.bio).toBe('old');
    });

    test('with select returns the selected keys and the relation, nothing else', async () => {
      const { next, user } = await seed();
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profileId: next.id },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
    });

    test('an array relation is the set it was before the write', async () => {
      const t1 = await client.db.Tag.create({ data: { name: 't1' } });
      const t2 = await client.db.Tag.create({ data: { name: 't2' } });
      const user = await client.db.User.create({ data: { ...userData, tagIds: [t1.id] } });
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { tagIds: [t2.id] },
        select: { name: true },
        include: { tags: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'tags']);
      expect(row?.tags.map((t) => t.name)).toEqual(['t1']);
    });

    test('a user with no profile gets a null relation', async () => {
      const user = await client.db.User.create({ data: userData });
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { age: 3 },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile).toBeNull();
    });

    test('a nested relation write is read before it applies', async () => {
      const { user } = await seed();
      const tag = await client.db.Tag.create({ data: { name: 'fresh' } });
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { tags: { connect: [tag.id] } },
        select: { name: true },
        include: { tags: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'tags']);
      expect(row?.tags).toEqual([]);
    });

    test('a non-matching where returns null', async () => {
      const { next } = await seed();
      const row = await client.db.User.updateUnique({
        where: { email: 'nobody@x.io' },
        data: { profileId: next.id },
        include: { profile: true },
        return: 'before',
      });

      expect(row).toBeNull();
    });

    test('without include there is no relation key', async () => {
      const { next, user } = await seed();
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profileId: next.id },
        return: 'before',
      });

      expect(keysOf(row)).not.toContain('profile');
      expect(keysOf(row)).toContain('email');
    });

    test('return after still resolves the relation after the write', async () => {
      const { next, user } = await seed();
      const row = await client.db.User.updateUnique({
        where: { id: user.id },
        data: { profileId: next.id },
        include: { profile: true },
      });

      expect(row?.profile?.bio).toBe('new');
    });
  });

  describe('upsert', () => {
    test('by unique field returns the relation as it was before the write', async () => {
      const { next } = await seed();
      const row = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: userData,
        update: { profileId: next.id },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
    });

    test('by id returns the relation as it was before the write', async () => {
      const { next, user } = await seed();
      const row = await client.db.User.upsert({
        where: { id: user.id },
        create: userData,
        update: { profileId: next.id },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
    });

    test('by a non-unique where returns each matched row with its relation', async () => {
      const { next } = await seed();
      const rows = await client.db.User.upsert({
        where: { name: 'probe' },
        create: userData,
        update: { profileId: next.id },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      expect(rows.map(keysOf)).toEqual([['name', 'profile']]);
      expect(rows[0]?.profile?.bio).toBe('old');
    });

    test('with nested relation operations returns the relation as it was', async () => {
      const { user } = await seed();
      const tag = await client.db.Tag.create({ data: { name: 'fresh' } });
      const row = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: userData,
        update: { tags: { connect: [tag.id] } },
        select: { name: true },
        include: { tags: true, profile: true },
        return: 'before',
      });

      expect(user.id).toBeDefined();
      expect(keysOf(row)).toEqual(['name', 'profile', 'tags']);
      expect(row?.tags).toEqual([]);
      expect(row?.profile?.bio).toBe('old');
    });

    test('with nested operations and an empty update returns the relation', async () => {
      await seed();
      const row = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: { ...userData, tags: { create: [{ name: 'c' }] } },
        update: {},
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
    });

    test('a new record returns null whatever is included', async () => {
      const plain = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: userData,
        update: { age: 3 },
        include: { profile: true },
        return: 'before',
      });
      await truncateTables(client, tables.core);
      const byId = await client.db.User.upsert({
        where: { id: 'fresh' },
        create: userData,
        update: { age: 3 },
        include: { profile: true },
        return: 'before',
      });

      expect(plain).toBeNull();
      expect(byId).toBeNull();
    });

    test('without include there is no relation key', async () => {
      const { next } = await seed();
      const row = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: userData,
        update: { profileId: next.id },
        return: 'before',
      });

      expect(keysOf(row)).not.toContain('profile');
    });
  });

  describe('inside a $transaction', () => {
    test('array mode equals the plain call', async () => {
      const first = await seed();
      const plain = await client.db.User.updateUnique({
        where: { id: first.user.id },
        data: { profileId: first.next.id },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });

      await truncateTables(client, tables.core);
      const second = await seed();
      const [row] = await client.$transaction([
        client.db.User.updateUnique({
          where: { id: second.user.id },
          data: { profileId: second.next.id },
          select: { name: true },
          include: { profile: true },
          return: 'before',
        }),
      ]);

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
      expect(keysOf(row?.profile)).toEqual(keysOf(plain?.profile));
      expect(row?.name).toBe(plain?.name);
    });

    test('array mode upsert returns the relation as it was', async () => {
      const { next, user } = await seed();
      const [byId, byField] = await client.$transaction([
        client.db.User.upsert({
          where: { id: user.id },
          create: userData,
          update: { profileId: next.id },
          select: { name: true },
          include: { profile: true },
          return: 'before',
        }),
        client.db.User.upsert({
          where: { email: 'probe@x.io' },
          create: userData,
          update: { age: 4 },
          select: { name: true },
          include: { profile: true },
          return: 'before',
        }),
      ]);

      expect(keysOf(byId)).toEqual(['name', 'profile']);
      expect(byId?.profile?.bio).toBe('old');
      // Items are independent, so the second one sees the first one's write
      expect(keysOf(byField)).toEqual(['name', 'profile']);
      expect(byField?.profile?.bio).toBe('new');
    });

    test('callback mode returns the relation as it was', async () => {
      const { next, user } = await seed();
      const row = await client.$transaction(async (tx) =>
        tx.User.updateUnique({
          where: { id: user.id },
          data: { profileId: next.id },
          select: { name: true },
          include: { profile: true },
          return: 'before',
        }),
      );

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
    });

    test('manual mode returns the relation as it was', async () => {
      const { next, user } = await seed();
      const txn = await client.$transaction();
      const row = await txn.User.updateUnique({
        where: { id: user.id },
        data: { profileId: next.id },
        select: { name: true },
        include: { profile: true },
        return: 'before',
      });
      await txn.commit();

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('old');
    });

    test('a cancelled transaction leaves the write undone', async () => {
      const { next, user } = await seed();
      const txn = await client.$transaction();
      await txn.User.updateUnique({
        where: { id: user.id },
        data: { profileId: next.id },
        include: { profile: true },
        return: 'before',
      });
      await txn.cancel();
      const after = await client.db.User.findOne({ where: { id: user.id }, include: { profile: true } });

      expect(after?.profile?.bio).toBe('old');
    });
  });
});
