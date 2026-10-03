/**
 * E2E Tests for `unset` on nested-operation updates
 *
 * A write that carries a nested relation op must apply `unset` exactly as the same write without it.
 * Every case runs the nested call and a plain control on a fresh seed and asserts they agree.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core, ...tables.relationWithObjects, 'tuple_with_relation', 'tuple_related_post'];

describe('E2E Nested update unset', () => {
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

  const seedUsers = async () => {
    const a = await client.db.User.create({ data: { email: 'a@x.io', name: 'a', isActive: true, age: 10 } });
    await client.db.User.create({ data: { email: 'b@x.io', name: 'b', isActive: true, age: 20 } });
    const tag = await client.db.Tag.create({ data: { name: 't1' } });

    return { a, tag };
  };

  const users = async () =>
    (await client.db.User.findMany({ orderBy: { email: 'asc' } })).map(({ name, age }) => ({ name, age }));

  const runUsers = async <T>(write: (s: Awaited<ReturnType<typeof seedUsers>>) => PromiseLike<T>) => {
    await truncateTables(client, TABLES);
    const returned = await write(await seedUsers());

    return { returned, rows: await users() };
  };

  describe('flat field', () => {
    test('updateUnique clears the field as the plain call does', async () => {
      const nested = await runUsers(({ a, tag }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );
      const plain = await runUsers(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id }, data: {}, unset: { age: true } }),
      );

      expect(plain.rows[0]?.age).toBeUndefined();
      expect(nested.rows).toEqual(plain.rows);
      expect(nested.returned?.age).toBeUndefined();
    });

    test('updateUnique still links the tag', async () => {
      const { a, tag } = await seedUsers();
      await client.db.User.updateUnique({
        where: { id: a.id },
        data: { tags: { connect: [tag.id] } },
        unset: { age: true },
      });

      const after = await client.db.User.findOne({ where: { id: a.id } });
      expect(after?.tagIds.length).toBe(1);
    });

    test('updateMany clears the field only on matched rows, as the plain call does', async () => {
      const nested = await runUsers(({ tag }) =>
        client.db.User.updateMany({
          where: { name: 'a' },
          data: { tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );
      const plain = await runUsers(() =>
        client.db.User.updateMany({ where: { name: 'a' }, data: {}, unset: { age: true } }),
      );

      expect(nested.rows).toEqual(plain.rows);
      expect(nested.rows).toEqual([
        { name: 'a', age: undefined },
        { name: 'b', age: 20 },
      ]);
    });

    test('unset combined with a data field writes both', async () => {
      const nested = await runUsers(({ a, tag }) =>
        client.db.User.updateUnique({
          where: { id: a.id },
          data: { name: 'renamed', tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );
      const plain = await runUsers(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id }, data: { name: 'renamed' }, unset: { age: true } }),
      );

      expect(nested.rows).toEqual(plain.rows);
      expect(nested.rows[0]).toEqual({ name: 'renamed', age: undefined });
    });

    test('without unset the field is untouched', async () => {
      const nested = await runUsers(({ a, tag }) =>
        client.db.User.updateUnique({ where: { id: a.id }, data: { tags: { connect: [tag.id] } } }),
      );

      expect(nested.rows[0]?.age).toBe(10);
    });

    test('a non-matching guard key unsets nothing', async () => {
      const nested = await runUsers(({ a, tag }) =>
        client.db.User.updateUnique({
          where: { id: a.id, name: 'WRONG' },
          data: { tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );
      const plain = await runUsers(({ a }) =>
        client.db.User.updateUnique({ where: { id: a.id, name: 'WRONG' }, data: {}, unset: { age: true } }),
      );

      expect(nested.returned).toBeNull();
      expect(nested.rows).toEqual(plain.rows);
      expect(nested.rows[0]?.age).toBe(10);
    });

    test('a field in both data and unset is rejected on the nested call, as on the plain one', async () => {
      const { a, tag } = await seedUsers();

      await expect(
        (async () => {
          await client.db.User.updateUnique({
            where: { id: a.id },
            data: { age: 5, tags: { connect: [tag.id] } },
            // @ts-expect-error SafeUnset rejects a field present in both data and unset at compile time
            unset: { age: true },
          });
        })(),
      ).rejects.toThrow();
      expect((await client.db.User.findOne({ where: { id: a.id } }))?.age).toBe(10);
    });
  });

  describe('object sub-field', () => {
    const seedCompanies = async () => {
      await client.db.RelObjCompany.create({
        data: {
          id: 'c1',
          name: 'c1',
          headquarters: { street: 's', city: 'c', state: 'st' },
          meta: { industry: 'tech', founded: 1999 },
        },
      });
      await client.db.RelObjEmployee.create({
        data: { id: 'e1', name: 'e1', homeAddress: { street: 's', city: 'c', state: 'st' }, companyId: 'c1' },
      });
    };

    const company = async () => {
      const c = await client.db.RelObjCompany.findOne({ where: { id: 'c1' } });

      return { meta: c?.meta, name: c?.name };
    };

    test('unsetting one sub-field keeps its siblings, as the plain call does', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({
        where: { id: 'c1' },
        data: { employees: { connect: ['e1'] } },
        unset: { meta: { founded: true } },
      });
      const nested = await company();

      await truncateTables(client, TABLES);
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({ where: { id: 'c1' }, data: {}, unset: { meta: { founded: true } } });
      const plain = await company();

      expect(plain.meta).toEqual({ industry: 'tech' });
      expect(nested).toEqual(plain);
    });

    test('unsetting the whole optional object clears it, as the plain call does', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.updateMany({
        where: { id: 'c1' },
        data: { employees: { connect: ['e1'] } },
        unset: { meta: true },
      });
      const nested = await company();

      await truncateTables(client, TABLES);
      await seedCompanies();
      await client.db.RelObjCompany.updateMany({ where: { id: 'c1' }, data: {}, unset: { meta: true } });
      const plain = await company();

      expect(plain.meta).toBeUndefined();
      expect(nested).toEqual(plain);
    });

    test('the nested op still lands beside an object unset', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({
        where: { id: 'c1' },
        data: { employees: { connect: ['e1'] } },
        unset: { meta: { founded: true } },
      });

      expect((await client.db.RelObjEmployee.findOne({ where: { id: 'e1' } }))?.companyId.toString()).toContain('c1');
      expect((await company()).name).toBe('c1');
    });
  });

  describe('optional tuple', () => {
    const seedPost = async () => {
      await client.db.TupleWithRelation.create({ data: { id: 'p1', name: 'p1', location: [1, 2] } });
      await client.db.TupleWithRelation.create({ data: { id: 'p2', name: 'p2', location: [3, 4] } });
      await client.db.TupleRelatedPost.create({
        data: { id: 'post1', title: 't', position: [5, 6], authorId: 'p1' },
      });
    };

    const post = async () => {
      const r = await client.db.TupleRelatedPost.findOne({ where: { id: 'post1' } });

      return { title: r?.title, position: r?.position };
    };

    test('unsetting the whole tuple clears it, as the plain call does', async () => {
      await seedPost();
      await client.db.TupleRelatedPost.updateUnique({
        where: { id: 'post1' },
        data: { author: { connect: 'p2' } },
        unset: { position: true },
      });
      const nested = await post();

      await truncateTables(client, TABLES);
      await seedPost();
      await client.db.TupleRelatedPost.updateUnique({ where: { id: 'post1' }, data: {}, unset: { position: true } });
      const plain = await post();

      expect(plain.position).toBeUndefined();
      expect(nested).toEqual(plain);
    });

    test('without unset the tuple is untouched', async () => {
      await seedPost();
      await client.db.TupleRelatedPost.updateUnique({ where: { id: 'post1' }, data: { author: { connect: 'p2' } } });

      expect((await post()).position).toEqual([5, 6]);
    });
  });
});
