/**
 * Nested connect on `create`: the target check runs in the write's own round trip, refuses with the same
 * CerialValidationError as before, and creates nothing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import {
  authorOf,
  expectRefused,
  linkedTags,
  missingMessage,
  profileOf,
  queryCalls,
  seedPost,
  seedTag,
  seedUser,
  userData,
} from './helpers';

const TABLES = tables.basics;

describe('E2E nested target check: create', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
  });

  const refusal = (field: string, target: string, id: string, model = 'BasicsUser') => ({
    model,
    field,
    operation: 'create',
    message: missingMessage(model, field, 'connect', target, id),
  });

  const userRow = () => client.db.BasicsUser.findOne({ where: { id: 'u1' } });

  describe('to-many forward (tags)', () => {
    test('one present id links it on both sides', async () => {
      await seedTag(client, 't1');
      await client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: ['t1'] } } });

      expect(await linkedTags(client)).toEqual(['basics_tag:t1']);
      expect((await client.db.BasicsTag.findOne({ where: { id: 't1' } }))?.userIds.map(String)).toEqual([
        'basics_user:u1',
      ]);
    });

    test('N present ids link all of them', async () => {
      for (const id of ['t1', 't2', 't3']) await seedTag(client, id);
      const created = await client.db.BasicsUser.create({
        data: { ...userData, id: 'u1', tags: { connect: ['t1', 't2', 't3'] } },
      });

      expect(created.tagIds.map(String).sort()).toEqual(['basics_tag:t1', 'basics_tag:t2', 'basics_tag:t3']);
      expect(await linkedTags(client)).toEqual(['basics_tag:t1', 'basics_tag:t2', 'basics_tag:t3']);
    });

    test('one missing id is refused and no row is created', async () => {
      await expectRefused(
        () => client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: ['nosuchtag'] } } }),
        refusal('tags', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await userRow()).toBeNull();
    });

    test('one of N missing is refused, names the missing id, and links nothing', async () => {
      await seedTag(client, 't1');
      await seedTag(client, 't2');
      await expectRefused(
        () =>
          client.db.BasicsUser.create({
            data: { ...userData, id: 'u1', tags: { connect: ['t1', 'nosuchtag', 't2'] } },
          }),
        refusal('tags', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await userRow()).toBeNull();
      for (const id of ['t1', 't2']) {
        expect((await client.db.BasicsTag.findOne({ where: { id } }))?.userIds).toEqual([]);
      }
    });

    test('all of N missing names the first in request order', async () => {
      await expectRefused(
        () =>
          client.db.BasicsUser.create({
            data: { ...userData, id: 'u1', tags: { connect: ['ghostb', 'ghosta', 'ghostc'] } },
          }),
        refusal('tags', 'BasicsTag', 'basics_tag:ghostb'),
      );

      expect(await userRow()).toBeNull();
    });

    test('an empty connect list issues no check and creates the row', async () => {
      await client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: [] } } });

      expect(await linkedTags(client)).toEqual([]);
    });
  });

  describe('to-one forward', () => {
    test('optional: a present id links it', async () => {
      await client.db.BasicsProfile.create({ data: { id: 'p1' } });
      await client.db.BasicsUser.create({ data: { ...userData, id: 'u1', profile: { connect: 'p1' } } });

      expect(await profileOf(client)).toBe('basics_profile:p1');
    });

    test('optional: a missing id is refused and no row is created', async () => {
      await expectRefused(
        () => client.db.BasicsUser.create({ data: { ...userData, id: 'u1', profile: { connect: 'nosuchprofile' } } }),
        refusal('profile', 'BasicsProfile', 'basics_profile:nosuchprofile'),
      );

      expect(await userRow()).toBeNull();
    });

    test('required: a present id links it', async () => {
      await seedUser(client, 'author');
      await client.db.BasicsPost.create({ data: { id: 'post1', title: 't', author: { connect: 'author' } } });

      expect(await authorOf(client, 'post1')).toBe('basics_user:author');
    });

    test('required: a missing id is refused and no row is created', async () => {
      await expectRefused(
        () => client.db.BasicsPost.create({ data: { id: 'post1', title: 't', author: { connect: 'nosuchuser' } } }),
        refusal('author', 'BasicsUser', 'basics_user:nosuchuser', 'BasicsPost'),
      );

      expect(await client.db.BasicsPost.findOne({ where: { id: 'post1' } })).toBeNull();
    });
  });

  describe('reverse (posts)', () => {
    test('1 and N present ids point each post at the new user', async () => {
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'other');
      await seedPost(client, 'post2', 'other');
      await client.db.BasicsUser.create({ data: { ...userData, id: 'u1', posts: { connect: ['post1', 'post2'] } } });

      expect(await authorOf(client, 'post1')).toBe('basics_user:u1');
      expect(await authorOf(client, 'post2')).toBe('basics_user:u1');
    });

    test('one missing id is refused and no row is created', async () => {
      await expectRefused(
        () => client.db.BasicsUser.create({ data: { ...userData, id: 'u1', posts: { connect: ['nosuchpost'] } } }),
        refusal('posts', 'BasicsPost', 'basics_post:nosuchpost'),
      );

      expect(await userRow()).toBeNull();
    });

    test('one of N missing leaves the present post with its author', async () => {
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'other');
      await expectRefused(
        () =>
          client.db.BasicsUser.create({
            data: { ...userData, id: 'u1', posts: { connect: ['post1', 'nosuchpost'] } },
          }),
        refusal('posts', 'BasicsPost', 'basics_post:nosuchpost'),
      );

      expect(await userRow()).toBeNull();
      expect(await authorOf(client, 'post1')).toBe('basics_user:other');
    });

    test('all of N missing names the first in request order', async () => {
      await expectRefused(
        () =>
          client.db.BasicsUser.create({ data: { ...userData, id: 'u1', posts: { connect: ['ghostb', 'ghosta'] } } }),
        refusal('posts', 'BasicsPost', 'basics_post:ghostb'),
      );
    });
  });

  describe('round trips', () => {
    test('a create with a connect makes one query call, present or missing', async () => {
      await seedTag(client, 't1');

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: ['t1'] } } }),
        ),
      ).toBe(1);
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.create({
            data: { ...userData, id: 'u2', email: 'u2@x.io', tags: { connect: ['nosuchtag'] } },
          }),
        ),
      ).toBe(1);
    });

    test('a plain create with no nested op makes one query call', async () => {
      expect(await queryCalls(client, () => client.db.BasicsUser.create({ data: { ...userData, id: 'u1' } }))).toBe(1);
      expect(await userRow()).not.toBeNull();
    });

    test('an empty connect list makes one query call and no check', async () => {
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: [] } } }),
        ),
      ).toBe(1);
    });
  });
});
