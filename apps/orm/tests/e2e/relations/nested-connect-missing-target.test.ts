/**
 * E2E Tests for a nested relation op that names a record that does not exist
 *
 * `connect` and `set` link to a record by id. The create half checked the target and raised a raw
 * database error; the update half wrote the id anyway, storing a link that pointed at nothing and
 * that `include` later resolved to nothing. Both halves now reject with CerialValidationError before
 * anything is written. `disconnect` of a missing id is a no-op: the end state it asks for, not linked,
 * already holds. Every case pairs the rejection with a control that connects a real record.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = tables.basics;

describe('E2E Nested relation op naming a missing record', () => {
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

  const userData = { name: 'n', email: 'n@x.io', isActive: true };

  /** The error a call rejects with; a call that resolves is a failed assertion, not a null. */
  const rejection = async (call: () => PromiseLike<unknown>): Promise<unknown> => {
    try {
      await call();
    } catch (error) {
      return error;
    }
    throw new Error('expected the call to reject');
  };

  const expectRejected = async (call: () => PromiseLike<unknown>, parts: string[]): Promise<void> => {
    const error = await rejection(call);
    expect(error).toBeInstanceOf(CerialValidationError);
    for (const part of parts) expect((error as CerialValidationError).message).toContain(part);
  };

  const seedUser = (id = 'u1') => client.db.User.create({ data: { ...userData, id, email: `${id}@x.io` } });
  const linkedTags = async (id = 'u1') => (await client.db.User.findOne({ where: { id } }))?.tagIds.map(String);

  describe('update half', () => {
    describe('to-many forward relation (tags)', () => {
      test('connect to a missing record rejects naming the model, field and id, and writes nothing', async () => {
        await seedUser();
        await expectRejected(
          () => client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
          ['User', 'tags', 'Tag', 'tag:nosuchtag'],
        );

        expect(await linkedTags()).toEqual([]);
      });

      test('connect to one real and one missing record links neither', async () => {
        await seedUser();
        const real = await client.db.Tag.create({ data: { name: 't1' } });
        await expectRejected(
          () =>
            client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: [real.id, 'nosuchtag'] } } }),
          ['tag:nosuchtag'],
        );

        expect(await linkedTags()).toEqual([]);
        expect((await client.db.Tag.findOne({ where: { id: real.id } }))?.userIds).toEqual([]);
      });

      test('the table-qualified form of a missing id rejects too', async () => {
        await seedUser();
        await expectRejected(
          () => client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['tag:nosuchtag'] } } }),
          ['tag:nosuchtag'],
        );
      });

      test('updateMany rejects as updateUnique does', async () => {
        await seedUser();
        await expectRejected(
          () => client.db.User.updateMany({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
          ['User', 'tags', 'tag:nosuchtag'],
        );

        expect(await linkedTags()).toEqual([]);
      });

      test('a missing record beside other data writes none of that data', async () => {
        await seedUser();
        await expectRejected(
          () =>
            client.db.User.updateUnique({
              where: { id: 'u1' },
              data: { name: 'changed', tags: { connect: ['nosuchtag'] } },
            }),
          ['tag:nosuchtag'],
        );

        expect((await client.db.User.findOne({ where: { id: 'u1' } }))?.name).toBe('n');
      });

      test('control: connect to a real record links it on both sides', async () => {
        await seedUser();
        const real = await client.db.Tag.create({ data: { name: 't1' } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: [real.id] } } });

        expect(await linkedTags()).toEqual([String(real.id)]);
        expect((await client.db.Tag.findOne({ where: { id: real.id } }))?.userIds.map(String)).toEqual(['user:u1']);
      });

      test('set to a missing record rejects and keeps the existing links', async () => {
        const real = await client.db.Tag.create({ data: { name: 't1' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [real.id] } } });
        await expectRejected(
          () => client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { set: ['nosuchtag'] } } }),
          ['User', 'tags', 'tag:nosuchtag'],
        );

        expect(await linkedTags()).toEqual([String(real.id)]);
        expect((await client.db.Tag.findOne({ where: { id: real.id } }))?.userIds.map(String)).toEqual(['user:u1']);
      });

      test('set to one real and one missing record changes nothing', async () => {
        const first = await client.db.Tag.create({ data: { name: 't1' } });
        const second = await client.db.Tag.create({ data: { name: 't2' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [first.id] } } });
        await expectRejected(
          () => client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { set: [second.id, 'nosuchtag'] } } }),
          ['tag:nosuchtag'],
        );

        expect(await linkedTags()).toEqual([String(first.id)]);
      });

      test('control: set to a real record replaces the links', async () => {
        const first = await client.db.Tag.create({ data: { name: 't1' } });
        const second = await client.db.Tag.create({ data: { name: 't2' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [first.id] } } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { set: [second.id] } } });

        expect(await linkedTags()).toEqual([String(second.id)]);
      });

      test('set to an empty list clears the links without any target to check', async () => {
        const first = await client.db.Tag.create({ data: { name: 't1' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [first.id] } } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { set: [] } } });

        expect(await linkedTags()).toEqual([]);
      });

      test('disconnect of a missing id is a no-op and keeps the real links', async () => {
        const real = await client.db.Tag.create({ data: { name: 't1' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [real.id] } } });
        const updated = await client.db.User.updateUnique({
          where: { id: 'u1' },
          data: { name: 'changed', tags: { disconnect: ['nosuchtag'] } },
        });

        expect(updated?.name).toBe('changed');
        expect(await linkedTags()).toEqual([String(real.id)]);
        expect((await client.db.Tag.findOne({ where: { id: real.id } }))?.userIds.map(String)).toEqual(['user:u1']);
      });

      test('control: disconnect of a linked record removes it', async () => {
        const real = await client.db.Tag.create({ data: { name: 't1' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [real.id] } } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { disconnect: [real.id] } } });

        expect(await linkedTags()).toEqual([]);
      });
    });

    describe('to-one forward relation', () => {
      test('optional: connect to a missing record rejects and leaves the field unset', async () => {
        await seedUser();
        await expectRejected(
          () => client.db.User.updateUnique({ where: { id: 'u1' }, data: { profile: { connect: 'nosuchprofile' } } }),
          ['User', 'profile', 'Profile', 'profile:nosuchprofile'],
        );

        const row = await client.db.User.findOne({ where: { id: 'u1' } });
        expect(row?.profileId ?? null).toBeNull();
      });

      test('optional: control, connect to a real record links it', async () => {
        await seedUser();
        const profile = await client.db.Profile.create({ data: { id: 'p1' } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { profile: { connect: profile.id } } });

        expect((await client.db.User.findOne({ where: { id: 'u1' } }))?.profileId?.toString()).toBe('profile:p1');
      });

      test('required: connect to a missing record rejects and keeps the current author', async () => {
        await seedUser('author');
        await client.db.Post.create({ data: { id: 'post1', title: 't', author: { connect: 'author' } } });
        await expectRejected(
          () => client.db.Post.updateUnique({ where: { id: 'post1' }, data: { author: { connect: 'nosuchuser' } } }),
          ['Post', 'author', 'User', 'user:nosuchuser'],
        );

        expect((await client.db.Post.findOne({ where: { id: 'post1' } }))?.authorId.toString()).toBe('user:author');
      });

      test('required: control, connect to a real record switches the author', async () => {
        await seedUser('author');
        await seedUser('other');
        await client.db.Post.create({ data: { id: 'post1', title: 't', author: { connect: 'author' } } });
        await client.db.Post.updateUnique({ where: { id: 'post1' }, data: { author: { connect: 'other' } } });

        expect((await client.db.Post.findOne({ where: { id: 'post1' } }))?.authorId.toString()).toBe('user:other');
      });

      test('disconnect on an optional relation clears it, with no id to be missing', async () => {
        const profile = await client.db.Profile.create({ data: { id: 'p1' } });
        await client.db.User.create({ data: { ...userData, id: 'u1', profile: { connect: profile.id } } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { profile: { disconnect: true } } });

        expect((await client.db.User.findOne({ where: { id: 'u1' } }))?.profileId ?? null).toBeNull();
      });
    });

    describe('reverse relation (posts)', () => {
      test('connect to a missing record rejects naming the model, field and id', async () => {
        await seedUser();
        await expectRejected(
          () => client.db.User.updateUnique({ where: { id: 'u1' }, data: { posts: { connect: ['nosuchpost'] } } }),
          ['User', 'posts', 'Post', 'post:nosuchpost'],
        );
      });

      test('connect to one real and one missing record points neither at the user', async () => {
        await seedUser();
        await seedUser('other');
        await client.db.Post.create({ data: { id: 'post1', title: 't', author: { connect: 'other' } } });
        await expectRejected(
          () =>
            client.db.User.updateUnique({ where: { id: 'u1' }, data: { posts: { connect: ['post1', 'nosuchpost'] } } }),
          ['post:nosuchpost'],
        );

        expect((await client.db.Post.findOne({ where: { id: 'post1' } }))?.authorId.toString()).toBe('user:other');
      });

      test('control: connect to a real record repoints it', async () => {
        await seedUser();
        await seedUser('other');
        await client.db.Post.create({ data: { id: 'post1', title: 't', author: { connect: 'other' } } });
        await client.db.User.updateUnique({ where: { id: 'u1' }, data: { posts: { connect: ['post1'] } } });

        expect((await client.db.Post.findOne({ where: { id: 'post1' } }))?.authorId.toString()).toBe('user:u1');
      });
    });

    test('a where that matches nothing still rejects a missing target', async () => {
      await expectRejected(
        () => client.db.User.updateUnique({ where: { id: 'nobody' }, data: { tags: { connect: ['nosuchtag'] } } }),
        ['tag:nosuchtag'],
      );
    });

    test('an upsert whose update half names a missing record rejects', async () => {
      await seedUser();
      await expectRejected(
        () =>
          client.db.User.upsert({
            where: { id: 'u1' },
            create: userData,
            update: { tags: { connect: ['nosuchtag'] } },
          }),
        ['User', 'tags', 'tag:nosuchtag'],
      );

      expect(await linkedTags()).toEqual([]);
    });
  });

  describe('create half', () => {
    test('to-many connect to a missing record rejects the same way and creates no row', async () => {
      await expectRejected(
        () => client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: ['nosuchtag'] } } }),
        ['User', 'tags', 'Tag', 'tag:nosuchtag'],
      );

      expect(await client.db.User.findOne({ where: { id: 'u1' } })).toBeNull();
    });

    test('to-one connect to a missing record rejects and creates no row', async () => {
      await expectRejected(
        () => client.db.User.create({ data: { ...userData, id: 'u1', profile: { connect: 'nosuchprofile' } } }),
        ['User', 'profile', 'Profile', 'profile:nosuchprofile'],
      );

      expect(await client.db.User.findOne({ where: { id: 'u1' } })).toBeNull();
    });

    test('required to-one connect to a missing record rejects and creates no row', async () => {
      await expectRejected(
        () => client.db.Post.create({ data: { id: 'post1', title: 't', author: { connect: 'nosuchuser' } } }),
        ['Post', 'author', 'User', 'user:nosuchuser'],
      );

      expect(await client.db.Post.findOne({ where: { id: 'post1' } })).toBeNull();
    });

    test('reverse connect to a missing record rejects and creates no row', async () => {
      await expectRejected(
        () => client.db.User.create({ data: { ...userData, id: 'u1', posts: { connect: ['nosuchpost'] } } }),
        ['User', 'posts', 'Post', 'post:nosuchpost'],
      );

      expect(await client.db.User.findOne({ where: { id: 'u1' } })).toBeNull();
    });

    test('connect to one real and one missing record creates no row and links nothing', async () => {
      const real = await client.db.Tag.create({ data: { name: 't1' } });
      await expectRejected(
        () => client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [real.id, 'nosuchtag'] } } }),
        ['tag:nosuchtag'],
      );

      expect(await client.db.User.findOne({ where: { id: 'u1' } })).toBeNull();
      expect((await client.db.Tag.findOne({ where: { id: real.id } }))?.userIds).toEqual([]);
    });

    test('control: connect to a real record creates the row and links it', async () => {
      const real = await client.db.Tag.create({ data: { name: 't1' } });
      await client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: [real.id] } } });

      expect(await linkedTags()).toEqual([String(real.id)]);
    });
  });

  describe('inside $transaction', () => {
    test('callback mode: the update half rejects and the transaction rolls back', async () => {
      await seedUser();
      await expectRejected(
        () =>
          client.$transaction(async (tx) => {
            await tx.User.updateUnique({ where: { id: 'u1' }, data: { name: 'changed' } });
            await tx.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } });
          }),
        ['tag:nosuchtag'],
      );

      expect((await client.db.User.findOne({ where: { id: 'u1' } }))?.name).toBe('n');
      expect(await linkedTags()).toEqual([]);
    });

    test('callback mode: the create half rejects with the same class', async () => {
      await expectRejected(
        () =>
          client.$transaction(async (tx) => {
            await tx.User.create({ data: { ...userData, id: 'u1', tags: { connect: ['nosuchtag'] } } });
          }),
        ['tag:nosuchtag'],
      );

      expect(await client.db.User.findOne({ where: { id: 'u1' } })).toBeNull();
    });

    test('array mode: the update half rejects and writes nothing', async () => {
      await seedUser();
      await expect(
        (async () => {
          await client.$transaction([
            client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
          ]);
        })(),
      ).rejects.toThrow();

      expect(await linkedTags()).toEqual([]);
    });

    test('array mode: the create half rejects and creates no row', async () => {
      await expect(
        (async () => {
          await client.$transaction([
            client.db.User.create({ data: { ...userData, id: 'u1', tags: { connect: ['nosuchtag'] } } }),
          ]);
        })(),
      ).rejects.toThrow();

      expect(await client.db.User.findOne({ where: { id: 'u1' } })).toBeNull();
    });
  });
});
