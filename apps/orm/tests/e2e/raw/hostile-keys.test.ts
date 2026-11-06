/**
 * E2E Tests: hostile keys and tables
 *
 * Keys that arrive as data: a `JSON.parse` where body (own `__proto__`, `constructor`, empty, padded and
 * upper-cased `$raw` keys), compute keys, `@flexible` sub-keys and the table name of `client.$live`. Each is
 * refused with a named error or quoted as one name, and every case reads the victim back afterwards.
 * Flexible sub-keys that are SurrealQL keywords stay field paths: a bare `true` is not the literal.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  CerialDatabaseError,
  CerialUnknownFieldError,
  CerialValidationError,
  sql,
  type CerialLiveHandle,
} from 'cerial';
import { TIMEOUT, expectIntact, fails, useVictimClient, within } from './hostile-helpers';

type ErrorClass = new (...args: never[]) => Error;

const SILENCE_MS = 400;
const ADDRESS = { street: 'S', city: 'C', zip: null };

describe('E2E hostile keys and tables', () => {
  const get = useVictimClient(['flex_user']);
  const opened: CerialLiveHandle<unknown>[] = [];

  afterEach(async () => {
    for (const handle of opened.splice(0)) await handle.kill().catch(() => {});
  });

  const json = (body: string): never => JSON.parse(body) as never;

  describe('a parsed where body is refused on every method', () => {
    // [body, error class]; an own `__proto__` key is a field named __proto__, which does not exist
    const BODIES: Array<[string, ErrorClass]> = [
      ['{"__proto__":{"$raw":"true"}}', CerialUnknownFieldError],
      ['{"constructor":{"prototype":{"$raw":"true"}}}', CerialUnknownFieldError],
      ['{"$RAW":"true"}', CerialUnknownFieldError],
      ['{" $raw":"true"}', CerialUnknownFieldError],
      ['{"__proto__":{}}', CerialUnknownFieldError],
      ['{"constructor":"x"}', CerialUnknownFieldError],
      ['{"":"x"}', CerialUnknownFieldError],
      ['{"$raw":"true"}', CerialValidationError],
      ['{"$raw":null}', CerialValidationError],
      ['{"AND":{"$raw":"true"}}', CerialValidationError],
    ];

    describe.each(BODIES)('%s', (body, error) => {
      test('findMany, deleteMany, updateMany', async () => {
        await fails(() => get().db.User.findMany({ where: json(body) }), error);
        await fails(() => get().db.User.deleteMany({ where: json(body) }), error);
        await fails(() => get().db.User.updateMany({ where: json(body), data: { name: 'Hit' } }), error);
        await expectIntact(get());
      });

      test('count, exists, groupBy', async () => {
        await fails(() => get().db.User.count(json(body)), error);
        await fails(() => get().db.User.exists(json(body)), error);
        await fails(() => get().db.User.groupBy({ by: { isActive: true }, where: json(body) }), error);
        await expectIntact(get());
      });

      test('Model.$live subscribes nothing', async () => {
        await fails(() => get().db.User.$live({ where: json(body) }), error);
        await expectIntact(get());
      });
    });

    test('an operator key named __proto__ beside a real operator is an unknown operator', async () => {
      const where = json('{"name":{"eq":"a","__proto__":{"$raw":"true"}}}');

      await fails(() => get().db.User.findMany({ where }), CerialValidationError, /__proto__/);
      await fails(() => get().db.User.deleteMany({ where }), CerialValidationError, /__proto__/);
      await expectIntact(get());
    });
  });

  describe('@flexible sub-keys from JSON are quoted, not read as syntax', () => {
    const seed = () =>
      get().db.FlexUser.create({
        data: {
          name: 'F',
          address: ADDRESS,
          profile: { bio: 'b', metadata: { label: 'l' } },
          strictAddress: ADDRESS,
        },
      });

    test.each([['true'], ['NONE'], ['AND'], ['SELECT']])('the keyword %s is a field path: zero rows', async (key) => {
      await seed();
      const where = { address: JSON.parse(`{"${key}":"zzz"}`) };

      expect(await get().db.FlexUser.findMany({ where })).toEqual([]);
      expect(await get().db.FlexUser.count()).toBe(1);
      await expectIntact(get());
    });

    test.each([
      ['a statement', 'a` = 1; DELETE tag; --'],
      ['a statement with a NUL', 'a\0` = 1; DELETE tag; --'],
      ['a sub-key named $raw', '$raw'],
    ])('%s in where and select', async (_label, key) => {
      await seed();
      const sub = Object.defineProperty({}, key, { value: 'zzz', enumerable: true });

      expect(await get().db.FlexUser.findMany({ where: { address: sub } })).toEqual([]);
      await get().db.FlexUser.deleteMany({ where: { address: sub } });
      const selected = await get().db.FlexUser.findMany({ select: { name: true, address: { [key]: true } } as never });

      expect(selected.length).toBe(1);
      expect(await get().db.FlexUser.count()).toBe(1);
      await expectIntact(get());
    });
  });

  describe('compute keys', () => {
    test.each([
      ['a trailing newline', 'c\n'],
      ['a non-ASCII letter', 'cé'],
      ['a semicolon', 'c; DELETE tag'],
      ['a backtick', 'x` FROM tag; DELETE tag; SELECT `y'],
    ])('%s is refused', async (_label, key) => {
      const compute = Object.defineProperty({}, key, { value: sql`1`, enumerable: true });

      await fails(() => get().db.User.findMany({ compute: compute as never }), CerialValidationError);
      await expectIntact(get());
    });

    test('an own __proto__ key from JSON is refused', async () => {
      const compute = json('{"__proto__":{"strings":["1"],"values":[]}}');

      await fails(() => get().db.User.findMany({ compute }), CerialValidationError, /__proto__/);
      await expectIntact(get());
    });

    test('keyword keys stay quoted aliases and can be sorted on', async () => {
      const rows = await get().db.User.findMany({
        compute: { SELECT: sql<number>`1`, true: sql<number>`2` },
        orderBy: { SELECT: 'asc', name: 'asc' },
      });

      expect(rows.map((r) => [r.name, r.SELECT, r.true])).toEqual([
        ['Ann', 1, 2],
        ['Bob', 1, 2],
        ['Cy', 1, 2],
      ]);
      await expectIntact(get());
    });
  });

  describe('client.$live', () => {
    test.each([
      ['a statement after the name', 'tag; DELETE tag'],
      ['a quoted name', '`tag`'],
      ['a WHERE and a statement', 'user WHERE true; DELETE tag; --'],
      ['a backtick break', 'tag` WHERE true; DELETE tag; --'],
      ['an angle break', 'tag⟩; DELETE tag; --'],
      ['$auth', '$auth'],
    ])('a hostile table (%s): the database finds no such table', async (_label, table) => {
      await fails(() => get().$live(table), CerialDatabaseError, /does not exist/);
      await expectIntact(get());
    });

    test('an empty table is refused before the database', async () => {
      await fails(() => get().$live(''), CerialValidationError);
    });

    test('a nested fragment with a hostile string delivers only the matching insert', async () => {
      const handle = await get().$live<{ name: string }>('user', {
        where: sql`name = ${"x'; DELETE tag; --"} OR ${sql`name = ${'hit'}`}`,
      });
      opened.push(handle);
      await get().db.User.create({ data: { email: 'm@x.test', name: 'miss', isActive: true } });
      await get().db.User.create({ data: { email: 'h@x.test', name: 'hit', isActive: true } });

      const first = await within(handle.next());

      expect(first).not.toBe(TIMEOUT);
      expect((first as IteratorResult<{ action: string; value: { name: string } }>).value.value.name).toBe('hit');
      expect(await within(handle.next(), SILENCE_MS)).toBe(TIMEOUT);
      expect(await get().db.Tag.count()).toBe(3);
    });

    test('a hostile sql.ident in the where subscribes, matches nothing and deletes nothing', async () => {
      const handle = await get().$live('user', {
        where: sql`${sql.ident('x` FROM tag; DELETE tag; SELECT `')} = ${1}`,
      });
      opened.push(handle);
      await get().db.User.create({ data: { email: 'n@x.test', name: 'new', isActive: true } });

      expect(await within(handle.next(), SILENCE_MS)).toBe(TIMEOUT);
      expect(await get().db.Tag.count()).toBe(3);
    });
  });
});
