/**
 * E2E Tests for `select` returning exactly the requested keys
 *
 * A to-one relation's foreign key is a nullable record field the mapper used to backfill with
 * null whenever it was absent from the row, so a narrowed `select` also carried `profileId`. The
 * generated type never admits it. Every case asserts the exact key set, not just the wanted field.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

/** The keys a row carries, sorted. */
const keysOf = (row: object | null | undefined) => (row ? Object.keys(row).sort() : row);

describe('E2E select returns exactly the requested keys', () => {
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

  describe('reads', () => {
    test('findOne', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.findOne({ where: { name: 'probe' }, select: { name: true } });

      expect(keysOf(row)).toEqual(['name']);
    });

    test('findMany', async () => {
      await client.db.User.create({ data: userData });
      const rows = await client.db.User.findMany({ select: { name: true } });

      expect(rows.map(keysOf)).toEqual([['name']]);
    });

    test('findUnique', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.findUnique({ where: { email: 'probe@x.io' }, select: { name: true } });

      expect(keysOf(row)).toEqual(['name']);
    });

    test('without select every field is still returned, nullable FK included', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.findOne({ where: { name: 'probe' } });

      expect(row?.profileId).toBeNull();
      expect(keysOf(row)).toContain('profileId');
    });
  });

  describe('writes', () => {
    test('create', async () => {
      const row = await client.db.User.create({ data: userData, select: { name: true } });

      expect(keysOf(row)).toEqual(['name']);
    });

    test('updateMany', async () => {
      await client.db.User.create({ data: userData });
      const rows = await client.db.User.updateMany({
        where: { name: 'probe' },
        data: { age: 3 },
        select: { name: true },
      });

      expect(rows.map(keysOf)).toEqual([['name']]);
    });

    test('updateUnique', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.updateUnique({
        where: { email: 'probe@x.io' },
        data: { age: 3 },
        select: { name: true },
      });

      expect(keysOf(row)).toEqual(['name']);
    });

    test('upsert, create half', async () => {
      const row = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: userData,
        update: { age: 3 },
        select: { name: true },
      });

      expect(keysOf(row)).toEqual(['name']);
    });

    test('upsert, update half', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.upsert({
        where: { email: 'probe@x.io' },
        create: userData,
        update: { age: 3 },
        select: { name: true },
      });

      expect(keysOf(row)).toEqual(['name']);
    });
  });

  describe('$transaction', () => {
    test('array mode maps a narrowed select to the requested keys', async () => {
      const [created, found] = await client.$transaction([
        client.db.User.create({ data: userData, select: { name: true } }),
        client.db.User.findMany({ select: { name: true } }),
      ]);

      expect(keysOf(created)).toEqual(['name']);
      expect(found.map(keysOf)).toEqual([['name']]);
    });
  });

  describe('select with include', () => {
    test('returns the selected keys and the relation, without the FK', async () => {
      const profile = await client.db.Profile.create({ data: { bio: 'hi' } });
      await client.db.User.create({ data: { ...userData, profileId: profile.id } });

      const row = await client.db.User.findOne({
        where: { name: 'probe' },
        select: { name: true },
        include: { profile: true },
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile?.bio).toBe('hi');
    });

    test('a user with no profile gets a null relation and still no FK', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.findOne({
        where: { name: 'probe' },
        select: { name: true },
        include: { profile: true },
      });

      expect(keysOf(row)).toEqual(['name', 'profile']);
      expect(row?.profile).toBeNull();
    });
  });

  describe('an explicitly selected FK', () => {
    test('is returned when set', async () => {
      const profile = await client.db.Profile.create({ data: { bio: 'hi' } });
      await client.db.User.create({ data: { ...userData, profileId: profile.id } });
      const row = await client.db.User.findOne({ where: { name: 'probe' }, select: { profileId: true } });

      expect(keysOf(row)).toEqual(['profileId']);
      expect(row?.profileId?.equals(profile.id)).toBe(true);
    });

    test('is returned as null when unset', async () => {
      await client.db.User.create({ data: userData });
      const row = await client.db.User.findOne({ where: { name: 'probe' }, select: { profileId: true } });

      expect(keysOf(row)).toEqual(['profileId']);
      expect(row?.profileId).toBeNull();
    });

    test('is returned alongside another field on a write', async () => {
      const row = await client.db.User.create({ data: userData, select: { name: true, profileId: true } });

      expect(keysOf(row)).toEqual(['name', 'profileId']);
    });
  });

  describe('array relations', () => {
    test('the array FK does not leak, on a read and a write', async () => {
      const tag = await client.db.Tag.create({ data: { name: 't1' } });
      const created = await client.db.User.create({ data: { ...userData, tagIds: [tag.id] }, select: { name: true } });
      const read = await client.db.User.findOne({ where: { name: 'probe' }, select: { name: true } });
      const withTags = await client.db.User.findOne({
        where: { name: 'probe' },
        select: { name: true },
        include: { tags: true },
      });

      expect(keysOf(created)).toEqual(['name']);
      expect(keysOf(read)).toEqual(['name']);
      expect(keysOf(withTags)).toEqual(['name', 'tags']);
    });

    test('an explicitly selected array FK is returned', async () => {
      const tag = await client.db.Tag.create({ data: { name: 't1' } });
      await client.db.User.create({ data: { ...userData, tagIds: [tag.id] } });
      const row = await client.db.User.findOne({ where: { name: 'probe' }, select: { tagIds: true } });

      expect(keysOf(row)).toEqual(['tagIds']);
      expect(row?.tagIds).toHaveLength(1);
    });
  });
});
