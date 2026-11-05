/**
 * Nested connect and set on `upsert`, both halves. The target check of the half that runs is part of the
 * write; a missing target is refused with the same CerialValidationError and writes nothing. A half the
 * record's existence rules out is not checked.
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
  userName,
} from './helpers';

const TABLES = tables.basics;

describe('E2E nested target check: upsert', () => {
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

  const refusal = (field: string, verb: 'connect' | 'set', target: string, id: string, model = 'BasicsUser') => ({
    model,
    field,
    operation: 'upsert',
    message: missingMessage(model, field, verb, target, id),
  });

  const tagUsers = async (id: string) =>
    (await client.db.BasicsTag.findOne({ where: { id } }))?.userIds.map(String).sort();

  const userRow = (id = 'u1') => client.db.BasicsUser.findOne({ where: { id } });

  describe('create half (the record does not exist)', () => {
    test('1 and N present tags link all of them', async () => {
      for (const id of ['t1', 't2']) await seedTag(client, id);
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: { ...userData, tags: { connect: ['t1', 't2'] } },
        update: {},
      });

      expect(await linkedTags(client)).toEqual(['basics_tag:t1', 'basics_tag:t2']);
      expect(await tagUsers('t1')).toEqual(['basics_user:u1']);
    });

    test('one missing tag is refused and no row is created', async () => {
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: { ...userData, tags: { connect: ['nosuchtag'] } },
            update: {},
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await userRow()).toBeNull();
    });

    test('one of N missing is refused and the present tag stays unlinked', async () => {
      await seedTag(client, 't1');
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: { ...userData, tags: { connect: ['t1', 'nosuchtag'] } },
            update: {},
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await userRow()).toBeNull();
      expect(await tagUsers('t1')).toEqual([]);
    });

    test('all of N missing names the first in request order', async () => {
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: { ...userData, tags: { connect: ['ghostb', 'ghosta'] } },
            update: {},
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:ghostb'),
      );

      expect(await userRow()).toBeNull();
    });

    test('to-one: a present profile links, a missing one is refused', async () => {
      await client.db.BasicsProfile.create({ data: { id: 'p1' } });
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: { ...userData, profile: { connect: 'p1' } },
        update: {},
      });

      expect(await profileOf(client)).toBe('basics_profile:p1');

      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u2' },
            create: { ...userData, email: 'u2@x.io', profile: { connect: 'nosuchprofile' } },
            update: {},
          }),
        refusal('profile', 'connect', 'BasicsProfile', 'basics_profile:nosuchprofile'),
      );

      expect(await userRow('u2')).toBeNull();
    });

    test('required to-one: a present author links, a missing one is refused', async () => {
      await seedUser(client, 'author');
      await client.db.BasicsPost.upsert({
        where: { id: 'post1' },
        create: { title: 't', author: { connect: 'author' } },
        update: {},
      });

      expect(await authorOf(client, 'post1')).toBe('basics_user:author');

      await expectRefused(
        () =>
          client.db.BasicsPost.upsert({
            where: { id: 'post2' },
            create: { title: 't', author: { connect: 'nosuchuser' } },
            update: {},
          }),
        refusal('author', 'connect', 'BasicsUser', 'basics_user:nosuchuser', 'BasicsPost'),
      );

      expect(await client.db.BasicsPost.findOne({ where: { id: 'post2' } })).toBeNull();
    });

    test('reverse: present posts are repointed, a missing one is refused', async () => {
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'other');
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: { ...userData, posts: { connect: ['post1'] } },
        update: {},
      });

      expect(await authorOf(client, 'post1')).toBe('basics_user:u1');

      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u2' },
            create: { ...userData, email: 'u2@x.io', posts: { connect: ['post1', 'nosuchpost'] } },
            update: {},
          }),
        refusal('posts', 'connect', 'BasicsPost', 'basics_post:nosuchpost'),
      );

      expect(await userRow('u2')).toBeNull();
      expect(await authorOf(client, 'post1')).toBe('basics_user:u1');
    });

    test('an empty connect list creates the row with no links', async () => {
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: { ...userData, tags: { connect: [] } },
        update: {},
      });

      expect(await linkedTags(client)).toEqual([]);
    });
  });

  describe('update half (the record exists)', () => {
    test('1 and N present tags link all of them beside other data', async () => {
      await seedUser(client);
      for (const id of ['t1', 't2']) await seedTag(client, id);
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: userData,
        update: { name: 'changed', tags: { connect: ['t1', 't2'] } },
      });

      expect(await linkedTags(client)).toEqual(['basics_tag:t1', 'basics_tag:t2']);
      expect(await userName(client)).toBe('changed');
    });

    test('one missing tag is refused and nothing changes', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { name: 'changed', tags: { connect: ['nosuchtag'] } },
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual([]);
      expect(await userName(client)).toBe('n');
    });

    test('one of N missing is refused and the present tag stays unlinked', async () => {
      await seedUser(client);
      await seedTag(client, 't1');
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { tags: { connect: ['t1', 'nosuchtag'] } },
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual([]);
      expect(await tagUsers('t1')).toEqual([]);
    });

    test('all of N missing names the first in request order', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { tags: { connect: ['ghostb', 'ghosta'] } },
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:ghostb'),
      );
    });

    test('set: present ids replace the links, a missing one is refused and keeps them', async () => {
      await seedTag(client, 't1');
      await seedTag(client, 't2');
      await client.db.BasicsUser.create({
        data: { ...userData, id: 'u1', tags: { connect: ['t1'] } },
      });
      await client.db.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { tags: { set: ['t2'] } } });

      expect(await linkedTags(client)).toEqual(['basics_tag:t2']);

      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { tags: { set: ['t1', 'nosuchtag'] } },
          }),
        refusal('tags', 'set', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual(['basics_tag:t2']);
      expect(await tagUsers('t1')).toEqual([]);
    });

    test('set to an empty list clears the links with no check', async () => {
      await seedTag(client, 't1');
      await client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: ['t1'] } } });
      await client.db.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { tags: { set: [] } } });

      expect(await linkedTags(client)).toEqual([]);
    });

    test('to-one: a missing profile is refused and the field stays unset', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { profile: { connect: 'nosuchprofile' } },
          }),
        refusal('profile', 'connect', 'BasicsProfile', 'basics_profile:nosuchprofile'),
      );

      expect(await profileOf(client)).toBeNull();
    });

    test('required to-one: a present author switches, a missing one is refused and the author is kept', async () => {
      await seedUser(client, 'author');
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'author');
      await client.db.BasicsPost.upsert({
        where: { id: 'post1' },
        create: { title: 't', author: { connect: 'author' } },
        update: { author: { connect: 'other' } },
      });

      expect(await authorOf(client, 'post1')).toBe('basics_user:other');

      await expectRefused(
        () =>
          client.db.BasicsPost.upsert({
            where: { id: 'post1' },
            create: { title: 't', author: { connect: 'author' } },
            update: { author: { connect: 'nosuchuser' } },
          }),
        refusal('author', 'connect', 'BasicsUser', 'basics_user:nosuchuser', 'BasicsPost'),
      );

      expect(await authorOf(client, 'post1')).toBe('basics_user:other');
    });

    test('reverse: a missing post is refused and the present one keeps its author', async () => {
      await seedUser(client);
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'other');
      await expectRefused(
        () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { posts: { connect: ['post1', 'nosuchpost'] } },
          }),
        refusal('posts', 'connect', 'BasicsPost', 'basics_post:nosuchpost'),
      );

      expect(await authorOf(client, 'post1')).toBe('basics_user:other');
    });
  });

  describe('the half that does not run', () => {
    test('a missing target in the create half is not checked when the record exists', async () => {
      await seedUser(client);
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: { ...userData, tags: { connect: ['nosuchtag'] } },
        update: { name: 'changed' },
      });

      expect(await userName(client)).toBe('changed');
      expect(await linkedTags(client)).toEqual([]);
    });

    test('a missing target in the update half is not checked when the record is created', async () => {
      await client.db.BasicsUser.upsert({
        where: { id: 'u1' },
        create: userData,
        update: { tags: { connect: ['nosuchtag'] } },
      });

      expect(await userName(client)).toBe('n');
      expect(await linkedTags(client)).toEqual([]);
    });
  });

  describe('round trips', () => {
    test('an upsert with a connect makes two query calls on either half, present or missing', async () => {
      await seedTag(client, 't1');
      const create = (id: string, tag: string) => () =>
        client.db.BasicsUser.upsert({
          where: { id },
          create: { ...userData, email: `${id}@x.io`, tags: { connect: [tag] } },
          update: {},
        });
      const update = (tag: string) => () =>
        client.db.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { tags: { connect: [tag] } } });

      expect(await queryCalls(client, create('u1', 't1'))).toBe(2);
      expect(await queryCalls(client, create('u2', 'nosuchtag'))).toBe(2);
      expect(await queryCalls(client, update('t1'))).toBe(2);
      expect(await queryCalls(client, update('nosuchtag'))).toBe(2);
    });

    test('an upsert with a set makes two query calls', async () => {
      await seedUser(client);
      await seedTag(client, 't1');

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { tags: { set: ['t1'] } } }),
        ),
      ).toBe(2);
    });

    test('an upsert with no nested op makes one query call on either half', async () => {
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { name: 'x' } }),
        ),
      ).toBe(1);
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { name: 'x' } }),
        ),
      ).toBe(1);
      expect(await userName(client)).toBe('x');
    });

    test('an empty connect and set cost the same two calls as a non-empty one, with no extra check', async () => {
      await seedUser(client);

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { tags: { set: [], connect: [] } },
          }),
        ),
      ).toBe(2);
    });
  });
});
