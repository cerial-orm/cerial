/**
 * E2E Tests: the exported builders need a registry for relations, findUnique keeps relation filters beside
 * the id, and an undefined unique key does not name a row
 *
 * Without the registry a relation filter compiled against the virtual relation field (always NONE), so a
 * NOT form matched every row, and a nested connect or disconnect was dropped while the write reported
 * success. findUnique by id compiled the rest of its where without the registry, so a NOT relation filter
 * returned the row findMany excludes. An upsert whose unique key was present but undefined counted as
 * naming one row, so a relation op ran over every row the rest of the where matched.
 *
 * Schema: basics-isolated (BasicsUser, BasicsPost, BasicsTag)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { buildDeleteQuery, buildUpdateManyQuery, executeQuery, QueryBuilderStatic } from '../../../src';
import { CerialValidationError as ClientValidationError } from 'cerial';
import { CerialValidationError } from '../../../src/errors';
import { modelRegistry } from '../generated/internal/model-registry';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';
import { NN_TABLES, uniqueEmail } from '../decorators/unique-nulls/helpers';

type Models = CerialClient['db'];

describe('Registry required, findUnique relation filters and unique key presence', () => {
  let client: CerialClient;
  const user = () => client.db.BasicsUser.getMetadata();

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
    await cleanupTables(client, NN_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
    await truncateTables(client, NN_TABLES);
  });

  const seed = async () => {
    const ann = await client.db.BasicsUser.create({
      data: { email: 'ann@x.io', name: 'ann', isActive: true },
    });
    const bob = await client.db.BasicsUser.create({
      data: { email: 'bob@x.io', name: 'bob', isActive: true },
    });
    const post = await client.db.BasicsPost.create({ data: { title: 'p', authorId: ann.id } });

    return { ann, bob, post };
  };

  /** Runs the call in every way the client takes it; a refusal at compile time throws inside the thunk. */
  const MODES: Record<string, (run: (m: Models) => PromiseLike<unknown>) => Promise<unknown>> = {
    direct: async (run) => run(client.db),
    'array transaction': async (run) => (await client.$transaction([run(client.db) as never]))[0],
    'callback transaction': async (run) => client.$transaction(async (tx) => run(tx as unknown as Models)),
    'manual transaction': async (run) => {
      const txn = await client.$transaction();
      try {
        return await run(txn as unknown as Models);
      } finally {
        await txn.cancel();
      }
    },
  };

  const caught = async (run: () => Promise<unknown>): Promise<unknown> => {
    try {
      await run();
    } catch (error) {
      return error;
    }

    return undefined;
  };

  describe('relation filters in the exported builders', () => {
    const NOT_POSTS = { NOT: { posts: { some: { title: 'p' } } } };

    test('negative: buildDeleteQuery without a registry refuses and deletes nothing', async () => {
      await seed();

      expect(() => buildDeleteQuery(user(), NOT_POSTS as never)).toThrow(CerialValidationError);
      expect(() => buildDeleteQuery(user(), NOT_POSTS as never)).toThrow(/model registry is required/);
      expect(await client.db.BasicsUser.count()).toBe(2);
    });

    test('negative: QueryBuilderStatic.deleteMany without a registry refuses and deletes nothing', async () => {
      await seed();

      const error = await caught(() =>
        QueryBuilderStatic.deleteMany(client.getSurreal()!, user(), { where: NOT_POSTS as never }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(await client.db.BasicsUser.count()).toBe(2);
    });

    test('negative: a positive relation filter is refused, not matched against the virtual field', async () => {
      await seed();

      expect(() => buildUpdateManyQuery(user(), { posts: { some: { title: 'p' } } } as never, { age: 9 })).toThrow(
        /model registry is required/,
      );
    });

    test('positive: with a registry the NOT form deletes exactly the user without posts', async () => {
      await seed();

      await executeQuery(client.getSurreal()!, buildDeleteQuery(user(), NOT_POSTS as never, modelRegistry));

      expect((await client.db.BasicsUser.findMany()).map((u) => u.name)).toEqual(['ann']);
    });

    test('positive: without a registry a plain field filter still deletes', async () => {
      await seed();

      await executeQuery(client.getSurreal()!, buildDeleteQuery(user(), { name: 'bob' }));

      expect((await client.db.BasicsUser.findMany()).map((u) => u.name)).toEqual(['ann']);
    });
  });

  describe('nested operations in QueryBuilderStatic', () => {
    test('negative: a nested connect without a registry is refused and nothing links', async () => {
      const { ann } = await seed();
      const tag = await client.db.BasicsTag.create({ data: { name: 't' } });

      const error = await caught(() =>
        QueryBuilderStatic.updateMany(client.getSurreal()!, user(), {
          where: { id: String(ann.id) },
          data: { tags: { connect: [String(tag.id)] } },
        }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as Error).message).toContain("nested relation operation on 'tags' needs a model registry");
      expect((await client.db.BasicsUser.findOne({ where: { id: ann.id } }))?.tagIds).toEqual([]);
    });

    test('negative: a nested connect in create stores no row', async () => {
      const tag = await client.db.BasicsTag.create({ data: { name: 't' } });

      const error = await caught(() =>
        QueryBuilderStatic.create(client.getSurreal()!, user(), {
          data: { email: 'n@x.io', name: 'n', isActive: true, tags: { connect: [String(tag.id)] } },
        }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(await client.db.BasicsUser.count()).toBe(0);
    });

    test('positive: with a registry the same connect links the tag', async () => {
      const { ann } = await seed();
      const tag = await client.db.BasicsTag.create({ data: { name: 't' } });

      await QueryBuilderStatic.updateMany(
        client.getSurreal()!,
        user(),
        { where: { id: String(ann.id) }, data: { tags: { connect: [String(tag.id)] } } },
        modelRegistry,
      );

      expect((await client.db.BasicsUser.findOne({ where: { id: ann.id } }))?.tagIds).toEqual([tag.id]);
    });
  });

  describe('findUnique by id keeps the relation filters', () => {
    const CASES: [string, (ids: { ann: string; post: string }) => [keyof Models, object, boolean][]][] = [
      [
        'reverse relation',
        ({ ann }) => [
          ['BasicsUser', { id: ann, posts: { some: { title: 'p' } } }, true],
          ['BasicsUser', { id: ann, NOT: { posts: { some: { title: 'p' } } } }, false],
          ['BasicsUser', { id: ann, posts: { some: { title: 'other' } } }, false],
          ['BasicsUser', { id: ann, NOT: { posts: { some: { title: 'other' } } } }, true],
        ],
      ],
      [
        'forward relation',
        ({ post }) => [
          ['BasicsPost', { id: post, author: { name: 'ann' } }, true],
          ['BasicsPost', { id: post, NOT: { author: { name: 'ann' } } }, false],
          ['BasicsPost', { id: post, author: { name: 'bob' } }, false],
          ['BasicsPost', { id: post, NOT: { author: { name: 'bob' } } }, true],
        ],
      ],
    ];

    for (const [kind, build] of CASES) {
      for (const [mode, run] of Object.entries(MODES)) {
        test(`${kind}, ${mode}: findUnique returns the row findMany returns`, async () => {
          const { ann, post } = await seed();

          for (const [model, where, expected] of build({ ann: String(ann.id), post: String(post.id) })) {
            const found = (await run((m) =>
              (m[model] as never as { findUnique: (o: object) => PromiseLike<unknown> }).findUnique({ where }),
            )) as unknown;
            const many = (await (client.db[model] as never as { findMany: (o: object) => Promise<unknown[]> }).findMany(
              { where, limit: 1 },
            )) as unknown[];

            expect(Boolean(found), `${mode} ${JSON.stringify(where)}`).toBe(expected);
            expect(many.length, `findMany ${JSON.stringify(where)}`).toBe(expected ? 1 : 0);
          }
        });
      }
    }
  });

  describe('an undefined unique key is refused', () => {
    const seedShared = async () => {
      const a = await client.db.BasicsUser.create({ data: { email: 'a@x.io', name: 'shared', isActive: true } });
      const b = await client.db.BasicsUser.create({ data: { email: 'b@x.io', name: 'shared', isActive: true } });
      const tag = await client.db.BasicsTag.create({ data: { name: 't' } });

      return { a, b, tag };
    };

    const expectUntouched = async (tagId: unknown) => {
      const users = await client.db.BasicsUser.findMany({ orderBy: { email: 'asc' } });

      expect(users.map((u) => [u.age ?? null, u.tagIds.length])).toEqual([
        [null, 0],
        [null, 0],
      ]);
      expect((await client.db.BasicsTag.findOne({ where: { id: tagId as string } }))?.userIds).toEqual([]);
    };

    const upsertWith = (where: object, tagId: unknown) => (m: Models) =>
      m.BasicsUser.upsert({
        where: where as never,
        create: { email: 'n@x.io', name: 'shared', isActive: true },
        update: { age: 7, tags: { connect: [tagId as string] } },
      });

    for (const [mode, run] of Object.entries(MODES)) {
      for (const [label, where] of [
        ['beside a plain field', { email: undefined, name: 'shared' }],
        ['beside AND', { email: undefined, AND: [{ name: 'shared' }] }],
      ] as const) {
        test(`negative: ${mode}, upsert with an undefined email ${label} is refused and no row changes`, async () => {
          const { tag } = await seedShared();

          const error = await caught(() => run(upsertWith(where, tag.id)) as Promise<unknown>);

          expect(error).toBeInstanceOf(ClientValidationError);
          expect((error as Error).message).toContain('where.email is undefined; pass a value or leave the key out');
          await expectUntouched(tag.id);
        });
      }

      test(`negative: ${mode}, upsert without a relation op refuses an undefined email and updates no row`, async () => {
        const { tag } = await seedShared();

        const error = await caught(
          () =>
            run((m) =>
              m.BasicsUser.upsert({
                where: { email: undefined, name: 'shared' } as never,
                create: { email: 'n@x.io', name: 'shared', isActive: true },
                update: { age: 7 },
              }),
            ) as Promise<unknown>,
        );

        expect(error).toBeInstanceOf(ClientValidationError);
        expect((error as Error).message).toContain('where.email is undefined');
        await expectUntouched(tag.id);
      });

      test(`negative: ${mode}, findUnique, updateUnique and deleteUnique refuse an undefined email`, async () => {
        const { tag } = await seedShared();
        const where = { email: undefined, name: 'shared' } as never;
        const calls: ((m: Models) => PromiseLike<unknown>)[] = [
          (m) => m.BasicsUser.findUnique({ where }),
          (m) => m.BasicsUser.updateUnique({ where, data: { age: 7 } }),
          (m) => m.BasicsUser.deleteUnique({ where }),
        ];

        for (const call of calls) {
          const error = await caught(() => run(call) as Promise<unknown>);

          expect(error).toBeInstanceOf(ClientValidationError);
          expect((error as Error).message).toContain('where.email is undefined');
        }
        await expectUntouched(tag.id);
      });

      test(`positive: ${mode}, upsert with the unique key present updates that row only`, async () => {
        const { tag } = await seedShared();

        await run(upsertWith({ email: 'a@x.io', name: 'shared' }, tag.id));
        // the transaction modes that cancel keep nothing; the direct, array and callback modes commit
        const users = await client.db.BasicsUser.findMany({ orderBy: { email: 'asc' } });
        const committed = mode !== 'manual transaction';

        expect(users.map((u) => u.age ?? null)).toEqual(committed ? [7, null] : [null, null]);
        expect(users.map((u) => u.tagIds.length)).toEqual(committed ? [1, 0] : [0, 0]);
      });
    }
  });
  describe('upsert is single-row', () => {
    // the transaction modes that cancel keep nothing; the direct, array and callback modes commit
    const commits = (mode: string) => mode !== 'manual transaction';
    const nnNicknames = async () =>
      (await client.db.NnUser.findMany({ orderBy: { email: 'asc' } })).map((u) => u.nickname ?? null);

    for (const [mode, run] of Object.entries(MODES)) {
      test(`${mode}: a where of non-unique keys updates the first match only`, async () => {
        await client.db.BasicsUser.create({ data: { email: 'a@x.io', name: 'shared', isActive: true } });
        await client.db.BasicsUser.create({ data: { email: 'b@x.io', name: 'shared', isActive: true } });
        await client.db.BasicsUser.create({ data: { email: 'c@x.io', name: 'other', isActive: true } });

        const result = (await run((m) =>
          m.BasicsUser.upsert({
            where: { name: 'shared' },
            create: { email: 'n@x.io', name: 'shared', isActive: true },
            update: { age: 7 },
          }),
        )) as unknown[];

        expect(result).toHaveLength(1);
        const users = await client.db.BasicsUser.findMany({ orderBy: { email: 'asc' } });
        expect(users.filter((u) => u.age === 7)).toHaveLength(commits(mode) ? 1 : 0);
        expect(users.find((u) => u.email === 'c@x.io')?.age ?? null).toBeNull();
        expect(users).toHaveLength(3);
      });

      test(`${mode}: a null on a nullable unique key updates one of the rows holding null`, async () => {
        for (const plainNick of [null, null, 'k'])
          await client.db.NnUser.create({ data: { email: uniqueEmail(), plainNick } });

        const result = (await run((m) =>
          m.NnUser.upsert({
            where: { plainNick: null },
            create: { email: uniqueEmail(), plainNick: null },
            update: { nickname: 'x' },
          }),
        )) as { nickname: string | null };

        expect(result.nickname).toBe('x');
        const nicknames = (await nnNicknames()).filter((n) => n === 'x');
        expect(nicknames).toHaveLength(commits(mode) ? 1 : 0);
        expect(await client.db.NnUser.count()).toBe(3);
      });

      test(`${mode}: a null on a nullable unique key with return before gives one row`, async () => {
        for (const plainNick of [null, null])
          await client.db.NnUser.create({ data: { email: uniqueEmail(), plainNick } });

        const before = (await run((m) =>
          m.NnUser.upsert({
            where: { plainNick: null },
            create: { email: uniqueEmail(), plainNick: null },
            update: { nickname: 'x' },
            return: 'before',
          }),
        )) as { nickname: string | null } | null;

        expect(Array.isArray(before)).toBe(false);
        expect(before?.nickname ?? null).toBeNull();
        expect(await client.db.NnUser.count()).toBe(2);
      });

      test(`${mode}: a null on a nullsNotDistinct field is a real key, updated when held and created when free`, async () => {
        const held = await client.db.NnUser.create({ data: { email: uniqueEmail(), nickname: null } });

        const updated = (await run((m) =>
          m.NnUser.upsert({
            where: { nickname: null },
            create: { email: uniqueEmail(), nickname: null },
            update: { plainNick: 'p' },
          }),
        )) as { id: unknown; plainNick: string | null };

        expect(String(updated.id)).toBe(String(held.id));
        expect(updated.plainNick).toBe('p');
        expect(await client.db.NnUser.count()).toBe(1);

        await client.db.NnUser.updateMany({ where: {}, data: { nickname: 'taken' } });
        const created = (await run((m) =>
          m.NnUser.upsert({
            where: { nickname: null },
            create: { email: uniqueEmail(), nickname: null },
            update: { plainNick: 'q' },
          }),
        )) as { nickname: string | null };

        expect(created.nickname ?? null).toBeNull();
        expect(await client.db.NnUser.count()).toBe(commits(mode) ? 2 : 1);
      });

      test(`${mode}: a null tuple on a nullsNotDistinct composite is updated when held and created when free`, async () => {
        await client.db.NnSlot.create({ data: { tenantId: null, slug: null } });
        const where = { tenantSlug: { tenantId: null, slug: null } };

        const updated = (await run((m) =>
          m.NnSlot.upsert({ where, create: { tenantId: null, slug: null }, update: { slug: 's' } }),
        )) as { slug: string | null };

        expect(updated.slug).toBe('s');
        expect(await client.db.NnSlot.count()).toBe(1);

        const created = (await run((m) =>
          m.NnSlot.upsert({ where, create: { tenantId: null, slug: null }, update: { slug: 't' } }),
        )) as { slug: string | null };

        // the first upsert moved the row off [null, null] where it committed, so the second finds none
        expect(created.slug ?? null).toBe(commits(mode) ? null : 't');
        expect(await client.db.NnSlot.count()).toBe(commits(mode) ? 2 : 1);
      });

      test(`${mode}: an undefined part of an object unique key is refused and no row changes`, async () => {
        await client.db.NnUser.create({ data: { email: 'a@x.io', plainNick: null, profile: { handle: 'h1' } } });
        await client.db.NnUser.create({ data: { email: 'b@x.io', plainNick: null, profile: { handle: 'h2' } } });

        const error = await caught(
          () =>
            run((m) =>
              m.NnUser.upsert({
                where: { profile: { handle: undefined }, plainNick: null } as never,
                create: { email: 'n@x.io' },
                update: { nickname: 'x' },
              }),
            ) as Promise<unknown>,
        );

        expect(error).toBeInstanceOf(ClientValidationError);
        expect((error as Error).message).toContain("unique key 'profile.handle' has no value");
        expect(await nnNicknames()).toEqual([null, null]);
        expect(await client.db.NnUser.count()).toBe(2);
      });

      test(`${mode}: a defined part of an object unique key updates that row only`, async () => {
        await client.db.NnUser.create({ data: { email: 'a@x.io', plainNick: null, profile: { handle: 'h1' } } });
        await client.db.NnUser.create({ data: { email: 'b@x.io', plainNick: null, profile: { handle: 'h2' } } });

        await run((m) =>
          m.NnUser.upsert({
            where: { profile: { handle: 'h2' }, plainNick: null },
            create: { email: 'n@x.io' },
            update: { nickname: 'x' },
          }),
        );

        expect(await nnNicknames()).toEqual(commits(mode) ? [null, 'x'] : [null, null]);
      });
    }
  });
  describe('include options take only the keys an include has', () => {
    test('a misspelled include key is refused instead of including every related row', async () => {
      const { ann } = await seed();

      await expect(
        (async () => {
          await client.db.BasicsUser.findMany({
            where: { id: ann.id },
            include: { posts: { wehre: { title: 'nope' } } as never },
          });
        })(),
      ).rejects.toThrow("'wehre' is not an option of include 'posts'");
    });

    test('every key an include takes still works', async () => {
      const { ann } = await seed();

      const [found] = await client.db.BasicsUser.findMany({
        where: { id: ann.id },
        include: { posts: { where: { title: 'p' }, orderBy: { title: 'asc' }, limit: 1, offset: 0 } },
      });

      expect(found!.posts.map((p) => p.title)).toEqual(['p']);
    });
  });
});
