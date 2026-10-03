/**
 * E2E Tests for `unset` on the update half of a nested-operation upsert
 *
 * An upsert whose update carries a nested relation op must apply `unset` exactly as the same upsert
 * without it. Every case runs the nested call and a plain control on a fresh seed and asserts they agree.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core, ...tables.relationWithObjects];

describe('E2E Nested upsert unset', () => {
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

  const userData = { email: 'a@x.io', name: 'a', isActive: true, age: 10 };

  const seed = async () => {
    await client.db.User.create({ data: userData });

    return client.db.Tag.create({ data: { name: 't1' } });
  };

  const user = async () => {
    const row = await client.db.User.findOne({ where: { email: 'a@x.io' } });

    return { name: row?.name, age: row?.age, tagIds: row?.tagIds.length };
  };

  const run = async <T>(write: (tag: Awaited<ReturnType<typeof seed>>) => PromiseLike<T>) => {
    await truncateTables(client, TABLES);
    const returned = await write(await seed());

    return { returned, row: await user() };
  };

  describe('flat field', () => {
    test('clears the field as the plain upsert does', async () => {
      const nested = await run((tag) =>
        client.db.User.upsert({
          where: { email: 'a@x.io' },
          create: userData,
          update: { tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.upsert({ where: { email: 'a@x.io' }, create: userData, update: {}, unset: { age: true } }),
      );

      expect(nested.row.age).toBeUndefined();
      expect(nested.row.age).toBe(plain.row.age);
      expect(nested.returned?.age).toBe(plain.returned?.age);
    });

    test('still links the tag', async () => {
      const nested = await run((tag) =>
        client.db.User.upsert({
          where: { email: 'a@x.io' },
          create: userData,
          update: { tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );

      expect(nested.row.tagIds).toBe(1);
    });

    test('writes a data field and the unset together', async () => {
      const nested = await run((tag) =>
        client.db.User.upsert({
          where: { email: 'a@x.io' },
          create: userData,
          update: { name: 'renamed', tags: { connect: [tag.id] } },
          unset: { age: true },
        }),
      );
      const plain = await run(() =>
        client.db.User.upsert({
          where: { email: 'a@x.io' },
          create: userData,
          update: { name: 'renamed' },
          unset: { age: true },
        }),
      );

      expect(nested.row).toEqual({ name: 'renamed', age: undefined, tagIds: 1 });
      expect(nested.row.name).toBe(plain.row.name);
      expect(nested.row.age).toBe(plain.row.age);
    });

    test('without unset the field is untouched', async () => {
      const nested = await run((tag) =>
        client.db.User.upsert({
          where: { email: 'a@x.io' },
          create: userData,
          update: { tags: { connect: [tag.id] } },
        }),
      );

      expect(nested.row.age).toBe(10);
    });

    test('the create half ignores unset, as the plain upsert does', async () => {
      const tag = await client.db.Tag.create({ data: { name: 't1' } });
      const nested = await client.db.User.upsert({
        where: { email: 'a@x.io' },
        create: { ...userData, tags: { connect: [tag.id] } },
        update: { tags: { connect: [tag.id] } },
        unset: { age: true },
      });

      expect(nested?.age).toBe(10);

      await truncateTables(client, TABLES);
      const plain = await client.db.User.upsert({
        where: { email: 'a@x.io' },
        create: userData,
        update: {},
        unset: { age: true },
      });

      expect(plain?.age).toBe(nested?.age);
    });

    test('a field in both update and unset is rejected on the nested call', async () => {
      const tag = await seed();

      await expect(
        (async () => {
          await client.db.User.upsert({
            where: { email: 'a@x.io' },
            create: userData,
            update: { age: 5, tags: { connect: [tag.id] } },
            // @ts-expect-error SafeUnset rejects a field present in both update and unset at compile time
            unset: { age: true },
          });
        })(),
      ).rejects.toThrow();
      expect((await user()).age).toBe(10);
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

    const company = async () => (await client.db.RelObjCompany.findOne({ where: { id: 'c1' } }))?.meta;

    const create = { id: 'c1', name: 'c1', headquarters: { street: 's', city: 'c', state: 'st' } };

    test('unsetting one sub-field keeps its siblings, as the plain upsert does', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.upsert({
        where: { id: 'c1' },
        create,
        update: { employees: { connect: ['e1'] } },
        unset: { meta: { founded: true } },
      });
      const nested = await company();

      await truncateTables(client, TABLES);
      await seedCompanies();
      await client.db.RelObjCompany.upsert({
        where: { id: 'c1' },
        create,
        update: {},
        unset: { meta: { founded: true } },
      });
      const plain = await company();

      expect(plain).toEqual({ industry: 'tech' });
      expect(nested).toEqual(plain);
    });

    test('unsetting the whole optional object clears it, as the plain upsert does', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.upsert({
        where: { id: 'c1' },
        create,
        update: { employees: { connect: ['e1'] } },
        unset: { meta: true },
      });
      const nested = await company();

      await truncateTables(client, TABLES);
      await seedCompanies();
      await client.db.RelObjCompany.upsert({ where: { id: 'c1' }, create, update: {}, unset: { meta: true } });
      const plain = await company();

      expect(plain).toBeUndefined();
      expect(nested).toEqual(plain);
    });
  });
});
