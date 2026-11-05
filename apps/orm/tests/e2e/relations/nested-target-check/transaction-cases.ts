import type { CerialQueryPromise } from 'cerial';
import type { CerialClient } from '../../test-helper';
import { authorOf, linkedTags, missingMessage, profileOf, seedPost, seedTag, seedUser, userData } from './helpers';
import type { ExpectedRefusal } from './helpers';

/** The model accessors a case needs; a client's `db` and a transaction both fit. */
export interface Models {
  readonly BasicsUser: CerialClient['db']['BasicsUser'];
  readonly BasicsPost: CerialClient['db']['BasicsPost'];
}

/** A write the caller runs on `models`, which is whichever object the mode under test hands out. */
export type Write = (models: Models) => CerialQueryPromise<unknown>;

export interface PositiveCase {
  name: string;
  seed: (client: CerialClient) => Promise<void>;
  write: Write;
  /** Resolves when the committed state is the one the write asks for */
  verify: (client: CerialClient) => Promise<boolean>;
}

export interface NegativeCase {
  name: string;
  seed: (client: CerialClient) => Promise<void>;
  write: Write;
  expected: ExpectedRefusal;
  /** Resolves when the database still holds what it held after `seed` */
  unchanged: (client: CerialClient) => Promise<boolean>;
}

const tagIds = async (client: CerialClient, ids: string[]) => {
  for (const id of ids) await seedTag(client, id);
};

const noUser = async (client: CerialClient, id = 'u1') =>
  (await client.db.BasicsUser.findOne({ where: { id } })) === null;

const tagsOf = async (client: CerialClient, expected: string[]) =>
  JSON.stringify(await linkedTags(client)) === JSON.stringify(expected);

const refusal = (
  operation: string,
  field: string,
  verb: 'connect' | 'set',
  target: string,
  id: string,
  model = 'BasicsUser',
): ExpectedRefusal => ({ model, field, operation, message: missingMessage(model, field, verb, target, id) });

const createUser =
  (tags: string[]): Write =>
  (m) =>
    m.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: tags } } });

const updateManyTags =
  (tags: string[]): Write =>
  (m) =>
    m.BasicsUser.updateMany({ where: { id: 'u1' }, data: { tags: { connect: tags } } });

const updateUniqueTags =
  (tags: string[]): Write =>
  (m) =>
    m.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: tags } } });

const upsertCreateTags =
  (tags: string[]): Write =>
  (m) =>
    m.BasicsUser.upsert({ where: { id: 'u1' }, create: { ...userData, tags: { connect: tags } }, update: {} });

const upsertUpdateTags =
  (tags: string[]): Write =>
  (m) =>
    m.BasicsUser.upsert({ where: { id: 'u1' }, create: userData, update: { tags: { connect: tags } } });

const withUser = (seedTags: string[]) => async (client: CerialClient) => {
  await seedUser(client);
  await tagIds(client, seedTags);
};

const withTags = (ids: string[]) => (client: CerialClient) => tagIds(client, ids);

/** Every path and shape that carries a check, each with its present-targets control. */
export const positives: PositiveCase[] = [
  {
    name: 'create: N present tags link all of them',
    seed: withTags(['t1', 't2']),
    write: createUser(['t1', 't2']),
    verify: (c) => tagsOf(c, ['basics_tag:t1', 'basics_tag:t2']),
  },
  {
    name: 'updateMany: 1 present tag links it',
    seed: withUser(['t1']),
    write: updateManyTags(['t1']),
    verify: (c) => tagsOf(c, ['basics_tag:t1']),
  },
  {
    name: 'updateUnique: set with N present tags links all of them',
    seed: withUser(['t1', 't2']),
    write: updateUniqueTags(['t1', 't2']),
    verify: (c) => tagsOf(c, ['basics_tag:t1', 'basics_tag:t2']),
  },
  {
    name: 'upsert create half: N present tags link all of them',
    seed: withTags(['t1', 't2']),
    write: upsertCreateTags(['t1', 't2']),
    verify: (c) => tagsOf(c, ['basics_tag:t1', 'basics_tag:t2']),
  },
  {
    name: 'upsert update half: 1 present tag links it',
    seed: withUser(['t1']),
    write: upsertUpdateTags(['t1']),
    verify: (c) => tagsOf(c, ['basics_tag:t1']),
  },
  {
    name: 'to-one: a present profile links',
    seed: async (c) => {
      await seedUser(c);
      await c.db.BasicsProfile.create({ data: { id: 'p1' } });
    },
    write: (m) => m.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { profile: { connect: 'p1' } } }),
    verify: async (c) => (await profileOf(c)) === 'basics_profile:p1',
  },
  {
    name: 'reverse: a present post is repointed',
    seed: async (c) => {
      await seedUser(c);
      await seedUser(c, 'other');
      await seedPost(c, 'post1', 'other');
    },
    write: (m) => m.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { posts: { connect: ['post1'] } } }),
    verify: async (c) => (await authorOf(c, 'post1')) === 'basics_user:u1',
  },
];

export const negatives: NegativeCase[] = [
  {
    name: 'create: 1 missing tag',
    seed: async () => {},
    write: createUser(['nosuchtag']),
    expected: refusal('create', 'tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
    unchanged: (c) => noUser(c),
  },
  {
    name: 'create: one of N missing names the missing id and links nothing',
    seed: withTags(['t1', 't2']),
    write: createUser(['t1', 'nosuchtag', 't2']),
    expected: refusal('create', 'tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
    unchanged: async (c) => (await noUser(c)) && (await c.db.BasicsTag.findMany()).every((t) => !t.userIds.length),
  },
  {
    name: 'create: all of N missing names the first in request order',
    seed: async () => {},
    write: createUser(['ghostb', 'ghosta']),
    expected: refusal('create', 'tags', 'connect', 'BasicsTag', 'basics_tag:ghostb'),
    unchanged: (c) => noUser(c),
  },
  {
    name: 'updateMany: 1 missing tag leaves the tags and the row as they were',
    seed: withUser([]),
    write: (m) =>
      m.BasicsUser.updateMany({ where: { id: 'u1' }, data: { name: 'changed', tags: { connect: ['nosuchtag'] } } }),
    expected: refusal('updateMany', 'tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
    unchanged: async (c) => (await c.db.BasicsUser.findOne({ where: { id: 'u1' } }))?.name === userData.name,
  },
  {
    name: 'updateMany: one of N missing links the present one nowhere',
    seed: withUser(['t1']),
    write: updateManyTags(['t1', 'nosuchtag']),
    expected: refusal('updateMany', 'tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
    unchanged: (c) => tagsOf(c, []),
  },
  {
    name: 'updateUnique: set with all of N missing',
    seed: withUser([]),
    write: updateUniqueTags(['ghostb', 'ghosta']),
    expected: refusal('updateUnique', 'tags', 'set', 'BasicsTag', 'basics_tag:ghostb'),
    unchanged: (c) => tagsOf(c, []),
  },
  {
    name: 'updateUnique: to-one connect to a missing profile',
    seed: withUser([]),
    write: (m) => m.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { profile: { connect: 'nosuchprofile' } } }),
    expected: refusal('updateUnique', 'profile', 'connect', 'BasicsProfile', 'basics_profile:nosuchprofile'),
    unchanged: async (c) => (await profileOf(c)) === null,
  },
  {
    name: 'upsert create half: 1 missing tag creates no row',
    seed: async () => {},
    write: upsertCreateTags(['nosuchtag']),
    expected: refusal('upsert', 'tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
    unchanged: (c) => noUser(c),
  },
  {
    name: 'upsert update half: one of N missing leaves the row unlinked',
    seed: withUser(['t1']),
    write: upsertUpdateTags(['t1', 'nosuchtag']),
    expected: refusal('upsert', 'tags', 'connect', 'BasicsTag', 'basics_tag:nosuchtag'),
    unchanged: (c) => tagsOf(c, []),
  },
  {
    name: 'reverse: a missing post is refused and the present post keeps its author',
    seed: async (c) => {
      await seedUser(c);
      await seedUser(c, 'other');
      await seedPost(c, 'post1', 'other');
    },
    write: (m) =>
      m.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { posts: { connect: ['post1', 'nosuchpost'] } } }),
    expected: refusal('updateUnique', 'posts', 'connect', 'BasicsPost', 'basics_post:nosuchpost'),
    unchanged: async (c) => (await authorOf(c, 'post1')) === 'basics_user:other',
  },
];

/** A write the check lets through, so a case can show the rest of a transaction rolled back or kept. */
export const marker = (m: Models) => m.BasicsUser.create({ data: { ...userData, id: 'marker', email: 'marker@x.io' } });

export const markerPresent = async (client: CerialClient): Promise<boolean> =>
  (await client.db.BasicsUser.findOne({ where: { id: 'marker' } })) !== null;
