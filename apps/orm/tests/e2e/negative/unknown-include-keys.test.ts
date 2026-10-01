/**
 * E2E Tests: unresolvable include keys — negative cases
 *
 * An include key that is a typo or a non-relation field must throw instead of
 * silently dropping the relation. Falsy values remain an opt-out.
 *
 * Schema: core (User/Post/Profile/Tag)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Unknown include keys — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  test('findMany throws on a typo key and names key and model', () => {
    expect(() => {
      client.db.User.findMany({
        // @ts-expect-error — 'psots' is not a field, testing runtime guard
        include: { psots: true },
      });
    }).toThrow("Invalid include: Unknown field 'psots' on model User");
  });

  test('findUnique throws on a typo key', () => {
    expect(() => {
      client.db.User.findUnique({
        where: { id: 'user:1' },
        // @ts-expect-error — 'psots' is not a field, testing runtime guard
        include: { psots: true },
      });
    }).toThrow("Invalid include: Unknown field 'psots' on model User");
  });

  test('findMany throws when the key is a scalar field', () => {
    expect(() => {
      client.db.User.findMany({
        // @ts-expect-error — 'name' is not a relation, testing runtime guard
        include: { name: true },
      });
    }).toThrow("'name' on model User is a string field, not a relation");
  });

  test('a bad key nested one level deep throws and names the nested model', () => {
    expect(() => {
      client.db.User.findMany({
        // @ts-expect-error — 'athor' is not a field of Post, testing runtime guard
        include: { posts: { include: { athor: true } } },
      });
    }).toThrow("Unknown field 'athor' on model Post");
  });

  test('false and undefined values still opt out and the query runs', async () => {
    const user = await client.db.User.create({ data: { email: 'a@b.co', name: 'A', isActive: true } });
    await client.db.Post.create({ data: { title: 'T', authorId: user.id } });

    const result = await client.db.User.findMany({ include: { posts: false, profile: undefined } });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('posts');
  });

  test('a valid include still returns the relation', async () => {
    const user = await client.db.User.create({ data: { email: 'a@b.co', name: 'A', isActive: true } });
    await client.db.Post.create({ data: { title: 'T', authorId: user.id } });

    const result = await client.db.User.findUnique({ where: { id: user.id }, include: { posts: true } });
    expect(result!.posts).toHaveLength(1);
  });
});
