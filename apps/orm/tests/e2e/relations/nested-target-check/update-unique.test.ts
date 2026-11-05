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
  userName,
} from './helpers';

const TABLES = tables.basics;

describe('E2E nested target check: updateUnique', () => {
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
    operation: 'updateUnique',
    message: missingMessage(model, field, verb, target, id),
  });

  const tagUsers = async (id: string) =>
    (await client.db.BasicsTag.findOne({ where: { id } }))?.userIds.map(String).sort();

  describe('to-many forward connect (tags)', () => {
    test('one present id links it on both sides', async () => {
      await seedUser(client);
      await seedTag(client, 't1');
      await client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['t1'] } } });

      expect(await linkedTags(client)).toEqual(['basics_tag:t1']);
      expect(await tagUsers('t1')).toEqual(['basics_user:u1']);
    });

    test('N present ids link all of them beside other data', async () => {
      await seedUser(client);
      for (const id of ['t1', 't2', 't3']) await seedTag(client, id);
      await client.db.BasicsUser.updateUnique({
        where: { id: 'u1' },
        data: { name: 'changed', tags: { connect: ['t1', 't2', 't3'] } },
      });

      expect(await linkedTags(client)).toEqual(['basics_tag:t1', 'basics_tag:t2', 'basics_tag:t3']);
      expect(await userName(client)).toBe('changed');
    });

    test('one missing id is refused, nothing is linked and other data is unchanged', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({
            where: { id: 'u1' },
            data: { name: 'changed', tags: { connect: ['nosuchtag'] } },
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual([]);
      expect(await userName(client)).toBe('n');
    });

    test('one of N missing is refused and the present ones stay unlinked', async () => {
      await seedUser(client);
      await seedTag(client, 't1');
      await seedTag(client, 't2');
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({
            where: { id: 'u1' },
            data: { tags: { connect: ['t1', 'nosuchtag', 't2'] } },
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual([]);
      expect(await tagUsers('t1')).toEqual([]);
      expect(await tagUsers('t2')).toEqual([]);
    });

    test('all of N missing names the first in request order', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({
            where: { id: 'u1' },
            data: { tags: { connect: ['ghostb', 'ghosta', 'ghostc'] } },
          }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:ghostb'),
      );

      expect(await linkedTags(client)).toEqual([]);
    });

    test('existing links survive a refused connect', async () => {
      await seedTag(client, 't1');
      await client.db.BasicsUser.create({
        data: { name: 'n', email: 'u1@x.io', isActive: true, id: 'u1', tags: { connect: ['t1'] } },
      });
      await expectRefused(
        () => client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual(['basics_tag:t1']);
      expect(await tagUsers('t1')).toEqual(['basics_user:u1']);
    });

    test('a where that matches nothing still refuses a missing target', async () => {
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'nobody' }, data: { tags: { connect: ['nosuchtag'] } } }),
        refusal('tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
      );
    });
  });

  describe('to-many forward set (tags)', () => {
    const linkedFirst = async () => {
      await seedTag(client, 't1');
      await client.db.BasicsUser.create({
        data: { name: 'n', email: 'u1@x.io', isActive: true, id: 'u1', tags: { connect: ['t1'] } },
      });
    };

    test('one and N present ids replace the links', async () => {
      await linkedFirst();
      await seedTag(client, 't2');
      await seedTag(client, 't3');
      await client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['t2', 't3'] } } });

      expect(await linkedTags(client)).toEqual(['basics_tag:t2', 'basics_tag:t3']);

      await client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['t2'] } } });

      expect(await linkedTags(client)).toEqual(['basics_tag:t2']);
    });

    test('one missing id is refused and the links are kept', async () => {
      await linkedFirst();
      await expectRefused(
        () => client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['nosuchtag'] } } }),
        refusal('tags', 'set', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual(['basics_tag:t1']);
      expect(await tagUsers('t1')).toEqual(['basics_user:u1']);
    });

    test('one of N missing is refused and the links are kept', async () => {
      await linkedFirst();
      await seedTag(client, 't2');
      await expectRefused(
        () => client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['t2', 'nosuchtag'] } } }),
        refusal('tags', 'set', 'BasicsTag', 'basics_tag:nosuchtag'),
      );

      expect(await linkedTags(client)).toEqual(['basics_tag:t1']);
      expect(await tagUsers('t2')).toEqual([]);
    });

    test('all of N missing names the first in request order', async () => {
      await linkedFirst();
      await expectRefused(
        () => client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['ghostb', 'ghosta'] } } }),
        refusal('tags', 'set', 'BasicsTag', 'basics_tag:ghostb'),
      );

      expect(await linkedTags(client)).toEqual(['basics_tag:t1']);
    });

    test('set to an empty list clears the links with no check', async () => {
      await linkedFirst();
      await client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: [] } } });

      expect(await linkedTags(client)).toEqual([]);
    });
  });

  describe('to-one forward connect', () => {
    test('optional: a present id links it', async () => {
      await seedUser(client);
      await client.db.BasicsProfile.create({ data: { id: 'p1' } });
      await client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { profile: { connect: 'p1' } } });

      expect(await profileOf(client)).toBe('basics_profile:p1');
    });

    test('optional: a missing id is refused and the field stays unset', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { profile: { connect: 'nosuchprofile' } } }),
        refusal('profile', 'connect', 'BasicsProfile', 'basics_profile:nosuchprofile'),
      );

      expect(await profileOf(client)).toBeNull();
    });

    test('required: a present id switches the author', async () => {
      await seedUser(client, 'author');
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'author');
      await client.db.BasicsPost.updateUnique({ where: { id: 'post1' }, data: { author: { connect: 'other' } } });

      expect(await authorOf(client, 'post1')).toBe('basics_user:other');
    });

    test('required: a missing id is refused and the author is kept', async () => {
      await seedUser(client, 'author');
      await seedPost(client, 'post1', 'author');
      await expectRefused(
        () =>
          client.db.BasicsPost.updateUnique({
            where: { id: 'post1' },
            data: { title: 'changed', author: { connect: 'nosuchuser' } },
          }),
        refusal('author', 'connect', 'BasicsUser', 'basics_user:nosuchuser', 'BasicsPost'),
      );

      const post = await client.db.BasicsPost.findOne({ where: { id: 'post1' } });
      expect(post?.authorId.toString()).toBe('basics_user:author');
      expect(post?.title).toBe('t');
    });
  });

  describe('reverse connect (posts)', () => {
    test('1 and N present ids repoint the posts', async () => {
      await seedUser(client);
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'other');
      await seedPost(client, 'post2', 'other');
      await client.db.BasicsUser.updateUnique({
        where: { id: 'u1' },
        data: { posts: { connect: ['post1', 'post2'] } },
      });

      expect(await authorOf(client, 'post1')).toBe('basics_user:u1');
      expect(await authorOf(client, 'post2')).toBe('basics_user:u1');
    });

    test('one missing id is refused', async () => {
      await seedUser(client);
      await expectRefused(
        () => client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { posts: { connect: ['nosuchpost'] } } }),
        refusal('posts', 'connect', 'BasicsPost', 'basics_post:nosuchpost'),
      );
    });

    test('one of N missing leaves the present post with its author', async () => {
      await seedUser(client);
      await seedUser(client, 'other');
      await seedPost(client, 'post1', 'other');
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({
            where: { id: 'u1' },
            data: { posts: { connect: ['post1', 'nosuchpost'] } },
          }),
        refusal('posts', 'connect', 'BasicsPost', 'basics_post:nosuchpost'),
      );

      expect(await authorOf(client, 'post1')).toBe('basics_user:other');
    });

    test('all of N missing names the first in request order', async () => {
      await seedUser(client);
      await expectRefused(
        () =>
          client.db.BasicsUser.updateUnique({
            where: { id: 'u1' },
            data: { posts: { connect: ['ghostb', 'ghosta'] } },
          }),
        refusal('posts', 'connect', 'BasicsPost', 'basics_post:ghostb'),
      );
    });
  });

  describe('round trips', () => {
    test('a connect makes one query call, present or missing', async () => {
      await seedUser(client);
      await seedTag(client, 't1');

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['t1'] } } }),
        ),
      ).toBe(1);
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
        ),
      ).toBe(1);
    });

    test('a set makes one query call, present or missing', async () => {
      await seedUser(client);
      await seedTag(client, 't1');

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['t1'] } } }),
        ),
      ).toBe(1);
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['nosuchtag'] } } }),
        ),
      ).toBe(1);
    });

    test('an empty set and an empty connect issue no check', async () => {
      await seedUser(client);

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: [] } } }),
        ),
      ).toBe(1);
      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: [] } } }),
        ),
      ).toBe(1);
    });

    test('a plain update with no nested op makes one query call', async () => {
      await seedUser(client);

      expect(
        await queryCalls(client, () =>
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { name: 'changed' } }),
        ),
      ).toBe(1);
      expect(await userName(client)).toBe('changed');
    });
  });
});
