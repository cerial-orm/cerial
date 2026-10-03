/**
 * E2E Tests for `select` and `include` on nested-operation writes
 *
 * A write that carries a nested relation op must project its result the way the same write without
 * it does. Every case runs the nested call and a plain control on a fresh seed and asserts they
 * agree. `create` and `updateMany` accept `select` only; `updateUnique` and `upsert` accept both.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

/** Narrows a row the test just created: a missing one is a broken setup, not a failed assertion. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);

  return value;
}

/** The keys a row carries, sorted: the shape `select` is meant to control. */
const keysOf = (row: object | null) => (row ? Object.keys(row).sort() : row);

describe('E2E Nested write select and include', () => {
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

  const seed = async () => {
    const tag1 = await client.db.Tag.create({ data: { name: 't1' } });
    const tag2 = await client.db.Tag.create({ data: { name: 't2' } });
    const a = await client.db.User.create({
      data: { email: 'a@x.io', name: 'a', isActive: true, age: 10, tagIds: [tag1.id] },
    });
    await client.db.Post.create({ data: { title: 'p1', authorId: a.id } });

    return { a, tag1, tag2 };
  };

  type Seed = Awaited<ReturnType<typeof seed>>;

  const run = async <T>(write: (s: Seed) => PromiseLike<T>) => {
    await truncateTables(client, tables.core);

    return write(await seed());
  };

  const tagNames = (tags: Array<{ name: string }> | undefined) => (tags ? tags.map((t) => t.name).sort() : tags);

  describe('create select', () => {
    test('returns only the selected fields, as the plain call does', async () => {
      const nested = await run(({ tag1 }) =>
        client.db.User.create({
          data: { email: 'n@x.io', name: 'n', isActive: true, tags: { connect: [tag1.id] } },
          select: { name: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.create({ data: { email: 'n@x.io', name: 'n', isActive: true }, select: { name: true } }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(nested.name).toBe('n');
    });

    test('still returns the full row without select', async () => {
      const nested = await run(({ tag1 }) =>
        client.db.User.create({
          data: { email: 'n@x.io', name: 'n', isActive: true, tags: { connect: [tag1.id] } },
        }),
      );

      expect(keysOf(nested)).toContain('email');
      expect(keysOf(nested)).toContain('tagIds');
      expect(nested.tagIds).toHaveLength(1);
    });

    test('still writes the link when select is given', async () => {
      const { tag1 } = await seed();
      await client.db.User.create({
        data: { email: 'n@x.io', name: 'n', isActive: true, tags: { connect: [tag1.id] } },
        select: { name: true },
      });
      const row = must(await client.db.User.findOne({ where: { email: 'n@x.io' } }), 'user');

      expect(row.tagIds).toHaveLength(1);
    });

    test('selects several fields, including a nullable one', async () => {
      const nested = await run(({ tag1 }) =>
        client.db.User.create({
          data: { email: 'n@x.io', name: 'n', isActive: true, age: 5, tags: { connect: [tag1.id] } },
          select: { name: true, age: true, email: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.create({
          data: { email: 'n@x.io', name: 'n', isActive: true, age: 5 },
          select: { name: true, age: true, email: true },
        }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).toEqual(expect.arrayContaining(['age', 'email', 'name']));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(nested.age).toBe(5);
    });
  });

  describe('updateMany select', () => {
    test('returns only the selected fields, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateMany({
          where: { id: a.id },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          select: { name: true },
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateMany({ where: { id: a.id }, data: { name: 'NEW' }, select: { name: true } }),
      );

      expect(nested.map(keysOf)).toEqual(plain.map(keysOf));
      expect(nested[0]?.name).toBe('NEW');
    });

    test('a non-matching where returns an empty array, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateMany({
          where: { id: a.id, name: 'WRONG' },
          data: { tags: { connect: [tag2.id] } },
          select: { name: true },
        }),
      );

      expect(nested).toEqual([]);
    });
  });

  describe('updateUnique select', () => {
    test('returns only the selected fields, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          select: { name: true },
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id }, data: { name: 'NEW' }, select: { name: true } }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(nested?.name).toBe('NEW');
    });

    test('works through a unique field where, as the plain call does', async () => {
      const nested = await run(({ tag2 }) =>
        client.db.User.updateUnique({
          where: { email: 'a@x.io' },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          select: { name: true, email: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.updateUnique({
          where: { email: 'a@x.io' },
          data: { name: 'NEW' },
          select: { name: true, email: true },
        }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
    });

    test('a non-matching guard key returns null, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id, name: 'WRONG' },
          data: { tags: { connect: [tag2.id] } },
          select: { name: true },
        }),
      );

      expect(nested).toBeNull();
    });

    test('return: true is unaffected by select', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { connect: [tag2.id] } },
          select: { name: true },
          return: true,
        }),
      );

      expect(nested).toBe(true);
    });

    test('return: before gives the full prior row, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          select: { name: true },
          return: 'before',
        }),
      );
      const plain = await run(({ a }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW' },
          select: { name: true },
          return: 'before',
        }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(nested?.name).toBe('a');
    });
  });

  describe('updateUnique include', () => {
    test('returns the related rows, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW', tags: { connect: [tag2.id] } },
          include: { tags: true },
        }),
      );
      const plain = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'NEW', tagIds: [...a.tagIds, tag2.id] },
          include: { tags: true },
        }),
      );

      expect(tagNames(plain?.tags)).toEqual(['t1', 't2']);
      expect(tagNames(nested?.tags)).toEqual(['t1', 't2']);
      expect(nested?.name).toBe('NEW');
    });

    test('reflects a disconnect made by the same call', async () => {
      const nested = await run(({ a, tag1 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { disconnect: [tag1.id] } },
          include: { tags: true },
        }),
      );

      expect(nested?.tags).toEqual([]);
    });

    test('includes a reverse relation', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { connect: [tag2.id] } },
          include: { posts: true },
        }),
      );

      expect(nested?.posts.map((p) => p.title)).toEqual(['p1']);
    });

    test('includes a relation with its own include options', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { connect: [tag2.id] } },
          include: { tags: { orderBy: { name: 'desc' }, limit: 1 } },
        }),
      );

      expect(tagNames(nested?.tags)).toEqual(['t2']);
    });

    test('combines with select, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { connect: [tag2.id] } },
          select: { name: true },
          include: { tags: true },
        }),
      );
      const plain = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tagIds: [...a.tagIds, tag2.id] },
          select: { name: true },
          include: { tags: true },
        }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(tagNames(nested?.tags)).toEqual(['t1', 't2']);
    });

    test('a non-matching guard key returns null, as the plain call does', async () => {
      const nested = await run(({ a, tag2 }) =>
        client.db.User.updateUnique({
          where: { id: a.id, name: 'WRONG' },
          data: { tags: { connect: [tag2.id] } },
          include: { tags: true },
        }),
      );

      expect(nested).toBeNull();
    });

    test('rejects an unknown relation name, as the plain call does', async () => {
      const { a, tag2 } = await seed();
      const plain = async () => {
        await client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'x' },
          // @ts-expect-error negative test: 'nope' is not a relation on User
          include: { nope: true },
        });
      };
      const nested = async () => {
        await client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { connect: [tag2.id] } },
          // @ts-expect-error negative test: 'nope' is not a relation on User
          include: { nope: true },
        });
      };

      await expect(plain()).rejects.toThrow(/Unknown field 'nope'/);
      await expect(nested()).rejects.toThrow(/Unknown field 'nope'/);
    });

    test('rejects a scalar field named in include', async () => {
      const { a, tag2 } = await seed();

      await expect(
        (async () => {
          await client.db.User.updateUnique({
            where: { id: a.id },
            data: { tags: { connect: [tag2.id] } },
            // @ts-expect-error negative test: 'name' is a scalar, not a relation
            include: { name: true },
          });
        })(),
      ).rejects.toThrow(/not a relation/);
    });

    test('an include rejected before the write leaves the row untouched', async () => {
      const { a, tag2 } = await seed();

      await expect(
        (async () => {
          await client.db.User.updateUnique({
            where: { id: a.id },
            data: { name: 'CHANGED', tags: { connect: [tag2.id] } },
            // @ts-expect-error negative test: 'nope' is not a relation on User
            include: { nope: true },
          });
        })(),
      ).rejects.toThrow();
      const row = must(await client.db.User.findOne({ where: { id: a.id } }), 'user');

      expect(row.name).toBe('a');
      expect(row.tagIds).toHaveLength(1);
    });
  });

  describe('upsert, create half', () => {
    const where = { email: 'new@x.io' };
    const base = { email: 'new@x.io', name: 'new', isActive: true };

    test('select returns only the selected fields, as the plain call does', async () => {
      const nested = await run(({ tag1 }) =>
        client.db.User.upsert({
          where,
          create: { ...base, tags: { connect: [tag1.id] } },
          update: { name: 'upd' },
          select: { name: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.upsert({ where, create: base, update: { name: 'upd' }, select: { name: true } }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(nested?.name).toBe('new');
    });

    test('include returns the related rows, as the plain call does', async () => {
      const nested = await run(({ tag1, tag2 }) =>
        client.db.User.upsert({
          where,
          create: { ...base, tags: { connect: [tag1.id, tag2.id] } },
          update: { name: 'upd' },
          include: { tags: true },
        }),
      );
      const plain = await run(({ tag1, tag2 }) =>
        client.db.User.upsert({
          where,
          create: { ...base, tagIds: [tag1.id, tag2.id] },
          update: { name: 'upd' },
          include: { tags: true },
        }),
      );

      expect(tagNames(plain?.tags)).toEqual(['t1', 't2']);
      expect(tagNames(nested?.tags)).toEqual(['t1', 't2']);
    });

    test('select and include together, as the plain call does', async () => {
      const nested = await run(({ tag1 }) =>
        client.db.User.upsert({
          where,
          create: { ...base, tags: { connect: [tag1.id] } },
          update: { name: 'upd' },
          select: { name: true },
          include: { tags: true },
        }),
      );

      const plain = await run(({ tag1 }) =>
        client.db.User.upsert({
          where,
          create: { ...base, tagIds: [tag1.id] },
          update: { name: 'upd' },
          select: { name: true },
          include: { tags: true },
        }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).toContain('tags');
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(tagNames(nested?.tags)).toEqual(['t1']);
    });

    test('rejects an unknown include relation, as the plain call does', async () => {
      const { tag1 } = await seed();

      await expect(
        (async () => {
          await client.db.User.upsert({
            where,
            create: { ...base, tags: { connect: [tag1.id] } },
            update: { name: 'upd' },
            // @ts-expect-error negative test: 'nope' is not a relation on User
            include: { nope: true },
          });
        })(),
      ).rejects.toThrow(/Unknown field 'nope'/);
      expect(await client.db.User.findOne({ where })).toBeNull();
    });
  });

  describe('upsert, update half', () => {
    const where = { email: 'a@x.io' };
    const base = { email: 'a@x.io', name: 'a', isActive: true };

    test('select returns only the selected fields, as the plain call does', async () => {
      const nested = await run(({ tag2 }) =>
        client.db.User.upsert({
          where,
          create: base,
          update: { name: 'upd', tags: { connect: [tag2.id] } },
          select: { name: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.upsert({ where, create: base, update: { name: 'upd' }, select: { name: true } }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(nested?.name).toBe('upd');
    });

    test('include returns the related rows, as the plain call does', async () => {
      const nested = await run(({ tag2 }) =>
        client.db.User.upsert({
          where,
          create: base,
          update: { name: 'upd', tags: { connect: [tag2.id] } },
          include: { tags: true },
        }),
      );
      const plain = await run(({ tag1, tag2 }) =>
        client.db.User.upsert({
          where,
          create: base,
          update: { name: 'upd', tagIds: [tag1.id, tag2.id] },
          include: { tags: true },
        }),
      );

      expect(tagNames(plain?.tags)).toEqual(['t1', 't2']);
      expect(tagNames(nested?.tags)).toEqual(['t1', 't2']);
    });

    test('with no update data, select and include still shape the existing row', async () => {
      const nested = await run(() =>
        client.db.User.upsert({
          where,
          create: { ...base, tags: { connect: [] } },
          select: { name: true },
          include: { tags: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.upsert({ where, create: base, select: { name: true }, include: { tags: true } }),
      );

      expect(keysOf(nested)).toEqual(keysOf(plain));
      expect(keysOf(nested)).not.toContain('createdAt');
      expect(tagNames(nested?.tags)).toEqual(['t1']);
    });

    test('rejects an unknown include relation, as the plain call does', async () => {
      const { tag2 } = await seed();

      await expect(
        (async () => {
          await client.db.User.upsert({
            where,
            create: base,
            update: { name: 'CHANGED', tags: { connect: [tag2.id] } },
            // @ts-expect-error negative test: 'nope' is not a relation on User
            include: { nope: true },
          });
        })(),
      ).rejects.toThrow(/Unknown field 'nope'/);
      expect(must(await client.db.User.findOne({ where }), 'user').name).toBe('a');
    });
  });
});
