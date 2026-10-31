/**
 * E2E Tests: a fragment in a value position
 *
 * A `sql` fragment is only allowed as the `$raw` where key. In a where value or in create and update data it
 * would bind as an opaque object, match nothing and say nothing, so it refuses. Destructive methods first,
 * each ending by counting the rows that must still be there. The same shapes with plain values then work.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError, sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core, ...tables.flexible, ...tables.any, ...tables.tuples];

describe('E2E fragment in a value position', () => {
  let client: CerialClient;
  const f = sql`age > ${0}`;

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
    for (const data of [
      { email: 'a@x.test', name: 'Ann', isActive: false, age: 20, nicknames: ['an'] },
      { email: 'b@x.test', name: 'Bob', isActive: true, age: 40 },
    ])
      await client.db.User.create({ data });
  });

  // CerialQueryPromise is a thenable, not a Promise, so it is awaited inside a real one
  const refuses = async (run: () => PromiseLike<unknown>, path: string): Promise<void> => {
    let error: unknown;
    try {
      await run();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialValidationError).message).toContain(path);
  };

  const names = async (): Promise<string[]> =>
    (await client.db.User.findMany({ orderBy: { name: 'asc' } })).map((u) => u.name);

  describe('a where value refuses and nothing is deleted or changed', () => {
    test('deleteMany with a bare value, an operator and an in array', async () => {
      await refuses(() => client.db.User.deleteMany({ where: { name: f } as never }), 'where.name');
      await refuses(() => client.db.User.deleteMany({ where: { name: { eq: f } } as never }), 'where.name.eq');
      await refuses(() => client.db.User.deleteMany({ where: { name: { in: ['Ann', f] } } as never }), 'in[1]');

      expect(await client.db.User.count()).toBe(2);
    });

    test('updateMany under OR and NOT', async () => {
      await refuses(
        () => client.db.User.updateMany({ where: { OR: [{ name: f }] } as never, data: { name: 'X' } }),
        'where.OR[0].name',
      );
      await refuses(
        () => client.db.User.updateMany({ where: { NOT: { name: f } } as never, data: { name: 'X' } }),
        'where.NOT.name',
      );

      expect(await names()).toEqual(['Ann', 'Bob']);
    });

    test('reads refuse too', async () => {
      await refuses(() => client.db.User.findMany({ where: { name: f } as never }), 'where.name');
      await refuses(() => client.db.User.count({ name: f } as never), 'where.name');
      await refuses(() => client.db.User.exists({ name: f } as never), 'where.name');
    });

    test('a @flexible sub-key', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'u',
          address: { street: 's', city: 'c' },
          profile: { bio: 'b', metadata: { label: 'l' } },
          strictAddress: { street: 's', city: 'c' },
        },
      });

      await refuses(
        () => client.db.FlexUser.deleteMany({ where: { address: { extra: f } } as never }),
        'address.extra',
      );

      expect(await client.db.FlexUser.count()).toBe(1);
    });

    test('a tuple element', async () => {
      await client.db.TupleBasic.create({ data: { name: 't', location: [1, 2], history: [] } });

      await refuses(
        () => client.db.TupleBasic.deleteMany({ where: { location: { lat: f } } as never }),
        'location.lat',
      );

      expect(await client.db.TupleBasic.count()).toBe(1);
    });
  });

  describe('create and update data refuse and store nothing', () => {
    test('create with a fragment in a field, an array and an Any field', async () => {
      await refuses(
        () => client.db.User.create({ data: { email: 'c@x.test', name: f, isActive: true } as never }),
        'data.name',
      );
      await refuses(
        () =>
          client.db.User.create({ data: { email: 'c@x.test', name: 'C', isActive: true, nicknames: [f] } as never }),
        'data.nicknames[0]',
      );
      await refuses(
        () => client.db.AnyBasic.create({ data: { name: 'a', data: { deep: [f] }, items: [] } as never }),
        'data.data.deep[0]',
      );

      expect(await client.db.User.count()).toBe(2);
      expect(await client.db.AnyBasic.count()).toBe(0);
    });

    test('create with a fragment in a nested create body', async () => {
      await refuses(
        () =>
          client.db.User.create({
            data: { email: 'c@x.test', name: 'C', isActive: true, profile: { create: { bio: f } } } as never,
          }),
        'data.profile.create.bio',
      );

      expect(await client.db.User.count()).toBe(2);
      expect(await client.db.Profile.count()).toBe(0);
    });

    test('updateMany with a set and a push', async () => {
      await refuses(() => client.db.User.updateMany({ where: {}, data: { name: f } as never }), 'data.name');
      await refuses(
        () => client.db.User.updateMany({ where: {}, data: { nicknames: { push: f } } as never }),
        'data.nicknames.push',
      );
      await refuses(
        () => client.db.User.updateMany({ where: {}, data: { nicknames: { set: [f] } } as never }),
        'data.nicknames.set[0]',
      );

      expect(await names()).toEqual(['Ann', 'Bob']);
      expect((await client.db.User.findOne({ where: { name: 'Ann' } }))?.nicknames).toEqual(['an']);
    });

    test('updateUnique and upsert, in both branches', async () => {
      const ann = (await client.db.User.findOne({ where: { name: 'Ann' } }))!;

      await refuses(
        () => client.db.User.updateUnique({ where: { id: ann.id }, data: { name: f } as never }),
        'data.name',
      );
      await refuses(
        () =>
          client.db.User.upsert({
            where: { email: 'new@x.test' },
            create: { email: 'new@x.test', name: f, isActive: true } as never,
            update: {},
          }),
        'create.name',
      );
      await refuses(
        () =>
          client.db.User.upsert({
            where: { email: 'a@x.test' },
            create: { email: 'a@x.test', name: 'n', isActive: true },
            update: { name: f } as never,
          }),
        'update.name',
      );

      expect(await names()).toEqual(['Ann', 'Bob']);
    });

    test('a tuple element in data', async () => {
      await refuses(
        () => client.db.TupleBasic.create({ data: { name: 't', location: [1, f], history: [] } as never }),
        'data.location[1]',
      );

      expect(await client.db.TupleBasic.count()).toBe(0);
    });
  });

  describe('the same shapes with plain values work', () => {
    test('where values, in arrays and $raw itself', async () => {
      expect(await client.db.User.count({ name: 'Ann' })).toBe(1);
      expect(await client.db.User.count({ name: { in: ['Ann', 'Bob'] } })).toBe(2);
      expect(await client.db.User.count({ OR: [{ name: 'Ann' }, { $raw: sql`age > ${30}` }] })).toBe(2);
      expect(await client.db.User.count({ name: 'Ann', $raw: sql`age > ${30}` })).toBe(0);
    });

    test('a flexible sub-key literally named $raw is a data key', async () => {
      await client.db.FlexUser.create({
        data: {
          name: 'u',
          address: { street: 's', city: 'c', $raw: 'plain' },
          profile: { bio: 'b', metadata: { label: 'l' } },
          strictAddress: { street: 's', city: 'c' },
        },
      });

      expect(await client.db.FlexUser.count({ address: { $raw: 'plain' } })).toBe(1);
      expect(await client.db.FlexUser.count({ address: { $raw: 'other' } })).toBe(0);
    });

    test('create, push, set and upsert with plain data', async () => {
      await client.db.User.create({ data: { email: 'c@x.test', name: 'Cy', isActive: true, nicknames: ['c'] } });
      await client.db.User.updateMany({ where: { name: 'Cy' }, data: { nicknames: { push: 'cc' } } });
      await client.db.User.upsert({
        where: { email: 'c@x.test' },
        create: { email: 'c@x.test', name: 'Cy', isActive: true },
        update: { name: 'Cy2' },
      });
      await client.db.AnyBasic.create({ data: { name: 'a', data: { deep: [1] }, items: [] } });

      expect((await client.db.User.findOne({ where: { name: 'Cy2' } }))?.nicknames).toEqual(['c', 'cc']);
      expect(await client.db.AnyBasic.count()).toBe(1);
    });
  });
});
