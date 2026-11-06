/**
 * E2E Tests: empty bodies on reverse, array-FK, object and tuple filters are refused on a write
 *
 * A reverse or array-FK relation body that names no quantifier and no condition (`posts: {}`,
 * `tags: { some: undefined }`), and an empty object or tuple field filter (`address: {}`, `address: { city: {} }`)
 * used to be dropped beside a sibling key, so `deleteMany` removed every row the sibling allows. A write now
 * refuses them with a CerialValidationError and leaves every row alone, through deleteMany, updateMany, upsert and
 * all three $transaction modes. The explicit forms (`some: {}`, `none: {}`, `isEmpty`) still run, and the reads
 * keep the rows they returned.
 *
 * KitchenSink: u-ann (tags red, blue; posts p1, p2), u-bob (red; p3), u-cy (blue; p4), u-dee (none)
 * ObjectTestUser: o-oslo (address and shipping in Oslo), o-bergen (Bergen, no shipping), o-geo (two locations)
 * TupleBasic: t-a, t-b (location only), t-c (a history entry)
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
import { idOf } from './helpers';

const TABLES = [...tables.kitchenSink, ...tables.objects, 'tuple_basic'];
const USERS = ['u-ann', 'u-bob', 'u-cy', 'u-dee'] as const;
const TAGS = ['t-red', 't-blue'] as const;
const OBJECT_USERS = ['o-oslo', 'o-bergen', 'o-geo'] as const;
const TUPLES = ['t-a', 't-b', 't-c'] as const;

// Hostile shapes are what a JavaScript caller can send; the generated types reject some of them
const hostile = (value: unknown): never => value as never;

/** The write surface every model shares, reached by key so one table of shapes drives all of them */
interface Writer {
  deleteMany(args: unknown): PromiseLike<unknown>;
  updateMany(args: unknown): PromiseLike<unknown>;
  upsert(args: unknown): PromiseLike<unknown>;
  findMany(args?: unknown): PromiseLike<Array<{ id: { toString(): string }; name: string }>>;
  count(where: unknown): PromiseLike<number>;
}

const writer = (source: unknown, key: string): Writer => (source as Record<string, Writer>)[key]!;

interface Target {
  readonly key: string;
  readonly everything: readonly string[];
  readonly marker: Record<string, unknown>;
  readonly create: Record<string, unknown>;
}

interface Shape {
  readonly label: string;
  readonly where: unknown;
  /** Rows a read returns; undefined when the read itself is refused */
  readonly reads?: readonly string[];
}

const refusal = /ambiguous on a write/;

describe('E2E empty reverse, array-FK, object and tuple filters on writes', () => {
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

    await client.db.KitchenSinkTag.create({ data: { id: 't-red', name: 'red' } });
    await client.db.KitchenSinkTag.create({ data: { id: 't-blue', name: 'blue' } });
    for (const [id, name, tags] of [
      ['u-ann', 'Ann', ['t-red', 't-blue']],
      ['u-bob', 'Bob', ['t-red']],
      ['u-cy', 'Cy', ['t-blue']],
      ['u-dee', 'Dee', []],
    ] as const)
      await client.db.KitchenSinkUser.create({
        data: { id, name, email: `${id}@x.test`, ...(tags.length ? { tags: { connect: [...tags] } } : {}) },
      });
    for (const [id, title, authorId] of [
      ['p1', 'one', 'u-ann'],
      ['p2', 'two', 'u-ann'],
      ['p3', 'three', 'u-bob'],
      ['p4', 'four', 'u-cy'],
    ] as const)
      await client.db.KitchenSinkPost.create({ data: { id, title, authorId } });

    const address = (city: string) => ({ street: 's', city, state: 'x' });
    await client.db.ObjectTestUser.create({
      data: { id: 'o-oslo', name: 'Oslo', address: address('Oslo'), shipping: address('Oslo') },
    });
    await client.db.ObjectTestUser.create({ data: { id: 'o-bergen', name: 'Bergen', address: address('Bergen') } });
    await client.db.ObjectTestUser.create({
      data: {
        id: 'o-geo',
        name: 'Geo',
        address: address('Oslo'),
        locations: [{ lat: 1, lng: 2 }],
      },
    });

    await client.db.TupleBasic.create({ data: { id: 't-a', name: 'A', location: [1, 2], history: [] } });
    await client.db.TupleBasic.create({ data: { id: 't-b', name: 'B', location: [3, 4], history: [] } });
    await client.db.TupleBasic.create({ data: { id: 't-c', name: 'C', location: [5, 6], history: [[7, 8]] } });
  });

  const everyOther = { neq: 'zz' };
  const users: Target = {
    key: 'KitchenSinkUser',
    everything: USERS,
    marker: { name: 'MARKED' },
    create: { name: 'new', email: 'new@x.test' },
  };
  const tags: Target = { key: 'KitchenSinkTag', everything: TAGS, marker: { name: 'MARKED' }, create: { name: 'new' } };
  const objectUsers: Target = {
    key: 'ObjectTestUser',
    everything: OBJECT_USERS,
    marker: { name: 'MARKED' },
    create: { name: 'new', address: { street: 's', city: 'c', state: 'x' } },
  };
  const tuples: Target = {
    key: 'TupleBasic',
    everything: TUPLES,
    marker: { name: 'MARKED' },
    create: { name: 'new', location: [0, 0], history: [] },
  };

  const shapes: Array<[Target, Shape[]]> = [
    [
      users,
      [
        { label: 'posts: {} beside a sibling', where: { name: everyOther, posts: {} }, reads: USERS },
        {
          label: 'posts: { some: undefined } beside a sibling',
          where: { name: everyOther, posts: { some: undefined } },
          reads: USERS,
        },
        {
          label: 'posts: { every: undefined } beside a sibling',
          where: { name: everyOther, posts: { every: undefined } },
          reads: USERS,
        },
        {
          label: 'posts: { none: undefined } beside a sibling',
          where: { name: everyOther, posts: { none: undefined } },
          reads: USERS,
        },
        { label: 'posts: {} alone', where: { posts: {} } },
        { label: 'tags: {} beside a sibling', where: { name: everyOther, tags: {} }, reads: USERS },
        {
          label: 'tags: { some: undefined } beside a sibling',
          where: { name: everyOther, tags: { some: undefined } },
          reads: USERS,
        },
        {
          label: 'tags: { every: undefined } beside a sibling',
          where: { name: everyOther, tags: { every: undefined } },
          reads: USERS,
        },
        {
          label: 'tags: { none: undefined } beside a sibling',
          where: { name: everyOther, tags: { none: undefined } },
          reads: USERS,
        },
        {
          label: 'two empty relation bodies',
          where: { name: everyOther, posts: {}, tags: { some: undefined } },
          reads: USERS,
        },
        {
          label: 'under OR',
          where: { OR: [{ name: 'Ann' }, { posts: {} }] },
        },
        {
          label: 'inside a quantifier body',
          where: { name: everyOther, posts: { some: { title: 'one', author: { posts: {} } } } },
        },
      ],
    ],
    [
      tags,
      [
        { label: 'users: {} beside a sibling', where: { name: everyOther, users: {} }, reads: TAGS },
        {
          label: 'users: { some: undefined } beside a sibling',
          where: { name: everyOther, users: { some: undefined } },
          reads: TAGS,
        },
        {
          label: 'users: { none: undefined } beside a sibling',
          where: { name: everyOther, users: { none: undefined } },
          reads: TAGS,
        },
      ],
    ],
    [
      objectUsers,
      [
        { label: 'address: {} beside a sibling', where: { name: everyOther, address: {} }, reads: OBJECT_USERS },
        { label: 'address: {} alone', where: { address: {} }, reads: OBJECT_USERS },
        {
          label: 'address: { city: {} }',
          where: { name: everyOther, address: { city: {} } },
          reads: OBJECT_USERS,
        },
        {
          label: 'address: { city: undefined }',
          where: { name: everyOther, address: { city: undefined } },
          reads: OBJECT_USERS,
        },
        {
          label: 'address: { city: { eq: undefined } }',
          where: { name: everyOther, address: { city: { eq: undefined } } },
          reads: OBJECT_USERS,
        },
        { label: 'address: { AND: [] }', where: { name: everyOther, address: { AND: [] } }, reads: OBJECT_USERS },
        { label: 'shipping: {}', where: { name: everyOther, shipping: {} }, reads: OBJECT_USERS },
        { label: 'shipping: { city: {} }', where: { name: everyOther, shipping: { city: {} } }, reads: OBJECT_USERS },
        { label: 'locations: {}', where: { name: everyOther, locations: {} }, reads: OBJECT_USERS },
        {
          label: 'locations: { some: undefined }',
          where: { name: everyOther, locations: { some: undefined } },
          reads: OBJECT_USERS,
        },
        {
          label: 'locations: { some: { lat: {} } }',
          where: { name: everyOther, locations: { some: { lat: {} } } },
          reads: ['o-geo'],
        },
        { label: 'under NOT', where: { name: everyOther, NOT: { address: {} } } },
        { label: 'under OR', where: { OR: [{ name: 'Oslo' }, { address: { city: {} } }] }, reads: OBJECT_USERS },
      ],
    ],
    [
      tuples,
      [
        { label: 'location: {}', where: { name: everyOther, location: {} }, reads: TUPLES },
        { label: 'location: { lat: {} }', where: { name: everyOther, location: { lat: {} } }, reads: TUPLES },
        { label: 'location: { 0: {} }', where: { name: everyOther, location: { 0: {} } }, reads: TUPLES },
        { label: 'history: {}', where: { name: everyOther, history: {} }, reads: TUPLES },
        {
          label: 'history: { some: undefined }',
          where: { name: everyOther, history: { some: undefined } },
          reads: TUPLES,
        },
        { label: 'history: { some: { lat: {} } }', where: { name: everyOther, history: { some: { lat: {} } } } },
      ],
    ],
  ];

  const names = async (target: Target) =>
    (await writer(client.db, target.key).findMany()).map((r) => idOf(r.id)).sort();
  const marked = async (target: Target) =>
    (await writer(client.db, target.key).findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)).sort();

  const refuses = (run: () => unknown) =>
    expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(refusal);

  const assertIntact = async (target: Target) => {
    expect(await names(target)).toEqual([...target.everything].sort());
    expect(await marked(target)).toEqual([]);
  };

  describe.each(shapes.map(([target, own]) => ({ key: target.key, target, own })))('$key', ({ target, own }) => {
    const w = () => writer(client.db, target.key);

    test.each(own.map((s) => [s.label, s] as const))('deleteMany refuses %s', async (_label, shape) => {
      await refuses(() => w().deleteMany({ where: hostile(shape.where) }));
      await assertIntact(target);
    });

    test.each(own.map((s) => [s.label, s] as const))('updateMany refuses %s', async (_label, shape) => {
      await refuses(() => w().updateMany({ where: hostile(shape.where), data: target.marker }));
      await assertIntact(target);
    });

    test.each(own.map((s) => [s.label, s] as const))('upsert refuses %s', async (_label, shape) => {
      await refuses(() => w().upsert({ where: hostile(shape.where), create: target.create, update: target.marker }));
      await assertIntact(target);
    });

    describe.each(own.map((s) => [s.label, s] as const))('$transaction with %s', (_label, shape) => {
      test('array mode deleteMany', async () => {
        await refuses(() => client.$transaction([hostile(w().deleteMany({ where: hostile(shape.where) }))]));
        await assertIntact(target);
      });

      test('array mode updateMany', async () => {
        await refuses(() =>
          client.$transaction([hostile(w().updateMany({ where: hostile(shape.where), data: target.marker }))]),
        );
        await assertIntact(target);
      });

      test('callback mode deleteMany', async () => {
        await refuses(() =>
          client.$transaction(async (tx) => {
            await writer(tx, target.key).deleteMany({ where: hostile(shape.where) });
          }),
        );
        await assertIntact(target);
      });

      test('callback mode updateMany', async () => {
        await refuses(() =>
          client.$transaction(async (tx) => {
            await writer(tx, target.key).updateMany({ where: hostile(shape.where), data: target.marker });
          }),
        );
        await assertIntact(target);
      });

      test('manual mode deleteMany and updateMany', async () => {
        const txn = await client.$transaction();
        try {
          await refuses(() => writer(txn, target.key).deleteMany({ where: hostile(shape.where) }));
          await refuses(() => writer(txn, target.key).updateMany({ where: hostile(shape.where), data: target.marker }));
        } finally {
          await txn.cancel();
        }
        await assertIntact(target);
      });
    });

    test.each(own.filter((s) => s.reads).map((s) => [s.label, s] as const))(
      'reads keep their rows for %s',
      async (_label, shape) => {
        const found = (await writer(client.db, target.key).findMany({ where: hostile(shape.where) }))
          .map((r) => idOf(r.id))
          .sort();

        expect(found).toEqual([...shape.reads!].sort());
        expect(await writer(client.db, target.key).count(hostile(shape.where))).toBe(shape.reads!.length);
      },
    );
  });

  describe('the explicit forms still run on a write', () => {
    test('posts: { some: {} } updates the users that have a post', async () => {
      await client.db.KitchenSinkUser.updateMany({ where: { posts: { some: {} } }, data: { name: 'MARKED' } });

      expect(await marked(users)).toEqual(['u-ann', 'u-bob', 'u-cy']);
    });

    test('posts: { none: {} } deletes the user without a post', async () => {
      await client.db.KitchenSinkUser.deleteMany({ where: { name: everyOther, posts: { none: {} } } });

      expect(await names(users)).toEqual(['u-ann', 'u-bob', 'u-cy']);
    });

    test('tags: { every: {} } and tags: { none: {} } on the array-FK', async () => {
      await client.db.KitchenSinkUser.updateMany({ where: { tags: { none: {} } }, data: { name: 'MARKED' } });

      expect(await marked(users)).toEqual(['u-dee']);
    });

    test('users: { some: {} } on the other side of the array-FK', async () => {
      await client.db.KitchenSinkTag.deleteMany({ where: { users: { some: {} } } });

      expect(await names(tags)).toEqual([]);
    });

    test('shipping: { city } selects the users with a shipping address in that city', async () => {
      await client.db.ObjectTestUser.updateMany({ where: { shipping: { city: 'Oslo' } }, data: { name: 'MARKED' } });

      expect(await marked(objectUsers)).toEqual(['o-oslo']);
    });

    test('a real sub-field condition', async () => {
      await client.db.ObjectTestUser.deleteMany({ where: { address: { city: 'Oslo' } } });

      expect(await names(objectUsers)).toEqual(['o-bergen']);
    });

    test('locations: { some: {} } on an array of objects', async () => {
      await client.db.ObjectTestUser.updateMany({ where: { locations: { some: {} } }, data: { name: 'MARKED' } });

      expect(await marked(objectUsers)).toEqual(['o-geo']);
    });

    test('history: { none: {} } on an array of tuples', async () => {
      await client.db.TupleBasic.deleteMany({ where: { history: { none: {} } } });

      expect(await names(tuples)).toEqual(['t-c']);
    });

    test('inside a $transaction', async () => {
      await client.$transaction([
        client.db.KitchenSinkUser.updateMany({ where: { posts: { none: {} } }, data: { name: 'MARKED' } }),
      ]);

      expect(await marked(users)).toEqual(['u-dee']);
    });
  });
});
