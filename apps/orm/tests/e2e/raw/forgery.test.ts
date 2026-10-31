/**
 * E2E Tests: a request body never becomes a fragment
 *
 * `where: req.body` hands the query a parsed JSON shape. A `$raw` key in it must refuse on every method that
 * takes a where, at any AND, OR and NOT depth, in include and relation filters, and every case ends by
 * counting the rows that must still be there. Destructive methods come first. Then the copies of a real
 * fragment that lose its brand, and the positive pair: a real fragment returns the expected rows.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialUnknownFieldError, CerialValidationError, sql } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.core];

describe('E2E forged $raw', () => {
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
    for (const data of [
      { email: 'a@x.test', name: 'Ann', isActive: false, age: 20 },
      { email: 'b@x.test', name: 'Bob', isActive: true, age: 40 },
    ])
      await client.db.User.create({ data });
    await client.db.User.create({
      data: { email: 'e@x.test', name: 'Ed', isActive: true, posts: { create: [{ title: 'p1' }, { title: 'p2' }] } },
    });
  });

  // CerialQueryPromise is a thenable, not a Promise, so it is awaited inside a real one
  // A `__proto__` key is not a field, so it refuses as an unknown field, naming the key
  const refuses = async (run: () => PromiseLike<unknown>, body = '$raw'): Promise<void> => {
    const proto = body.includes('__proto__');
    const path = proto ? '__proto__' : '$raw';
    let error: unknown;
    try {
      await run();
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(proto ? CerialUnknownFieldError : CerialValidationError);
    expect((error as Error).message).toContain(path);
  };

  const state = async (): Promise<unknown> => ({
    users: (await client.db.User.findMany({ orderBy: { email: 'asc' } })).map((u) => [
      u.email,
      u.name,
      u.age,
      u.isActive,
    ]),
    posts: (await client.db.Post.findMany({ orderBy: { title: 'asc' } })).map((p) => p.title),
  });

  // Every body comes from JSON.parse, as a request body would
  const bodies = [
    '{"$raw":"true"}',
    '{"$raw":{"strings":["true"],"values":[]}}',
    '{"$raw":["true"]}',
    '{"$raw":{}}',
    '{"$raw":null}',
    '{"__proto__":{"$raw":"true"}}',
  ];

  // A body at the top level, inside AND, OR, NOT, and three levels down
  const positions: Array<[string, (body: object) => object]> = [
    ['top level', (b) => b],
    ['inside AND', (b) => ({ AND: [b] })],
    ['inside OR', (b) => ({ OR: [b] })],
    ['inside NOT', (b) => ({ NOT: b })],
    ['three levels down', (b) => ({ OR: [{ AND: [{ NOT: b }] }] })],
  ];

  const unique = { email: 'a@x.test' };
  const create = { email: 'new@x.test', name: 'New', isActive: true };

  const destructive: Array<[string, (where: object) => PromiseLike<unknown>]> = [
    ['deleteMany', (where) => client.db.User.deleteMany({ where: where as never })],
    ['updateMany', (where) => client.db.User.updateMany({ where: where as never, data: { name: 'X' } })],
    ['upsert', (where) => client.db.User.upsert({ where: where as never, create, update: { name: 'X' } })],
    ['deleteUnique', (where) => client.db.User.deleteUnique({ where: { ...unique, ...where } as never })],
    [
      'updateUnique',
      (where) => client.db.User.updateUnique({ where: { ...unique, ...where } as never, data: { name: 'X' } }),
    ],
  ];

  const reads: Array<[string, (where: object) => PromiseLike<unknown>]> = [
    ['findMany', (where) => client.db.User.findMany({ where: where as never })],
    ['findOne', (where) => client.db.User.findOne({ where: where as never })],
    ['count', (where) => client.db.User.count(where as never)],
    ['exists', (where) => client.db.User.exists(where as never)],
  ];

  const cases = (methods: Array<[string, (where: object) => PromiseLike<unknown>]>) =>
    methods.flatMap(([method, run]) =>
      positions.flatMap(([position, wrap]) =>
        bodies.map((body): [string, string, string, typeof run, typeof wrap] => [method, position, body, run, wrap]),
      ),
    );

  describe('a body refuses on every destructive method and nothing changes', () => {
    test.each(cases(destructive))('%s, %s, %s', async (_method, _position, body, run, wrap) => {
      const before = await state();

      await refuses(() => run(wrap(JSON.parse(body))), body);

      expect(await state()).toEqual(before);
    });
  });

  describe('a body refuses on every read method', () => {
    test.each(cases(reads))('%s, %s, %s', async (_method, _position, body, run, wrap) => {
      const before = await state();

      await refuses(() => run(wrap(JSON.parse(body))), body);

      expect(await state()).toEqual(before);
    });
  });

  describe('a body refuses in include and relation filters', () => {
    test.each(bodies)('include where, nested include where and relation filters: %s', async (body) => {
      const forged = (): object => JSON.parse(body);
      const before = await state();

      await refuses(() => client.db.User.findMany({ include: { posts: { where: forged() as never } } }), body);
      await refuses(
        () => client.db.User.findMany({ include: { posts: { where: { OR: [forged()] } as never } } }),
        body,
      );
      await refuses(
        () =>
          client.db.User.findMany({
            include: {
              posts: { where: forged() as never, include: { author: { where: forged() as never } } },
            } as never,
          }),
        body,
      );
      await refuses(
        () =>
          client.db.User.findMany({
            include: { posts: { include: { author: { where: { NOT: forged() } as never } } } } as never,
          }),
        body,
      );
      for (const quantifier of ['some', 'every', 'none'])
        await refuses(() => client.db.User.deleteMany({ where: { posts: { [quantifier]: forged() } } as never }), body);
      await refuses(() => client.db.Post.deleteMany({ where: { author: forged() } as never }), body);

      expect(await state()).toEqual(before);
    });
  });

  describe('a copy of a real fragment refuses as a $raw value', () => {
    const fragment = sql`true`;
    const imitation = {
      strings: Object.freeze(Object.assign(['true'], { raw: ['true'] })),
      values: Object.freeze([]),
    };
    const copies: Array<[string, () => unknown]> = [
      ['a spread', () => ({ ...fragment })],
      ['structuredClone', () => structuredClone(fragment)],
      ['Object.create', () => Object.create(fragment)],
      ['a JSON round trip', () => JSON.parse(JSON.stringify(fragment))],
      ['a plain object with the same shape', () => imitation],
    ];

    test.each(copies)('%s, on a destructive and a read method', async (_label, copy) => {
      const before = await state();

      for (const [, run] of [...destructive, ...reads]) await refuses(() => run({ $raw: copy() }));
      await refuses(() => client.db.User.deleteMany({ where: { OR: [{ $raw: copy() }] } as never }));

      expect(await state()).toEqual(before);
    });

    test('sql() refuses a parsed array in place of a template', () => {
      expect(() => sql(JSON.parse('["true"]'))).toThrow(CerialValidationError);
    });

    test('a hole holding a parsed body binds as a value and runs no text', async () => {
      const body = JSON.parse('{"x":"true; DELETE user"}');
      const before = await state();

      const rows = await client.db.User.findMany({ where: { $raw: sql`name = ${body}` } });

      expect(rows).toEqual([]);
      expect(await state()).toEqual(before);
    });
  });

  describe('a real fragment returns the expected rows on each method', () => {
    const real = (): object => ({ $raw: sql`age = ${20}` });

    test('reads', async () => {
      expect((await client.db.User.findMany({ where: real() as never })).map((u) => u.name)).toEqual(['Ann']);
      expect((await client.db.User.findOne({ where: real() as never }))?.name).toBe('Ann');
      expect(await client.db.User.count(real() as never)).toBe(1);
      expect(await client.db.User.exists(real() as never)).toBe(true);
    });

    test('updateMany and deleteMany', async () => {
      await client.db.User.updateMany({ where: real() as never, data: { name: 'Anna' } });
      expect((await client.db.User.findOne({ where: { email: 'a@x.test' } }))?.name).toBe('Anna');

      await client.db.User.deleteMany({ where: real() as never });
      expect(await client.db.User.count()).toBe(2);
    });

    test('updateUnique and deleteUnique beside a unique key', async () => {
      await client.db.User.updateUnique({ where: { ...unique, ...real() } as never, data: { name: 'Anna' } });
      expect((await client.db.User.findOne({ where: { email: 'a@x.test' } }))?.name).toBe('Anna');

      await client.db.User.deleteUnique({ where: { ...unique, ...real() } as never });
      expect(await client.db.User.count()).toBe(2);
    });

    test('upsert beside a unique key', async () => {
      await client.db.User.upsert({
        where: { ...unique, ...real() } as never,
        create,
        update: { name: 'Anna' },
      });

      expect((await client.db.User.findOne({ where: { email: 'a@x.test' } }))?.name).toBe('Anna');
      expect(await client.db.User.count()).toBe(3);
    });
  });
});
