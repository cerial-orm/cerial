/**
 * E2E Tests: hostile identifiers and integers through `sql.ident` and `sql.int`
 *
 * Every name is the measured shape from the raw-hatch review: control characters, line terminators, comment
 * openers, homoglyph quotes and backslash escapes around a statement that would delete the `tag` victim.
 * `sql.ident` always quotes, so each stays one name: in a table slot the database finds no such table, as a
 * column it selects nothing, as an alias it is the key. A non-string and a non-integer are refused before any
 * query. Every case ends by reading the victim back.
 */

import { describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialValidationError, sql } from 'cerial';
import { compileRawStatement } from 'cerial/query';
import { expectIntact, fails, useVictimClient } from './hostile-helpers';

const BREAK = '` FROM tag; DELETE tag; SELECT `';

// Names that must stay one identifier in every slot
const NAMES: Array<[string, string]> = [
  ['NUL', `u\0${BREAK}`],
  ['LF', `x\n; DELETE tag;\n`],
  ['CR, spaces and NEL', 'x\r  \u0085; DELETE tag'],
  ['LS and PS', `x ${BREAK} `],
  ['a lone surrogate', `x\ud800${BREAK}`],
  ['comment openers', 'x -- ; /* DELETE tag */ #'],
  ['a block comment', '/* x */ DELETE tag'],
  ['a line comment', '-- x\nDELETE tag'],
  ['a hash comment', '# x\nDELETE tag'],
  ['a slash comment', '// x\nDELETE tag'],
  ['a semicolon', 'a; DELETE tag'],
  ['a full-width backtick', 'x｀ FROM tag; DELETE tag; SELECT ｀y'],
  ['a combining grave', `x̀${BREAK}`],
  ['the text \\u{60}', `x\\u{60} FROM tag; DELETE tag; SELECT \\u{60}y`],
  ['the text \\x60', `x\\x60 FROM tag; DELETE tag; SELECT \\x60y`],
  ['a backtick pair', '``'],
  ['a trailing backslash', 'x\\'],
  ['a record id', 'tag:t1'],
  ['a function call', 'fn::x()'],
  ['$auth', '$auth'],
  ['an empty name', ''],
  ['a keyword DELETE', 'DELETE'],
  ['a keyword SELECT', 'SELECT'],
  ['a keyword true', 'true'],
  ['a keyword NONE', 'NONE'],
];

describe('E2E hostile sql.ident and sql.int', () => {
  const get = useVictimClient();

  describe('sql.ident is one quoted identifier in every slot', () => {
    test.each(NAMES)('table slot, %s: the database finds no such table', async (_label, name) => {
      await fails(() => get().$raw(sql`SELECT * FROM ${sql.ident(name)}`), CerialDatabaseError, /does not exist/);
      await expectIntact(get());
    });

    test.each(NAMES.filter(([, name]) => name !== ''))('column slot, %s: every row is empty', async (_label, name) => {
      const rows = await get().$raw(sql`SELECT ${sql.ident(name)} FROM user`);

      expect(rows).toEqual([{}, {}, {}]);
      await expectIntact(get());
    });

    test.each(NAMES.filter(([, name]) => name !== ''))('alias slot, %s: one key per row', async (_label, name) => {
      const rows = await get().$raw<Record<string, number>>(sql`SELECT 1 AS ${sql.ident(name)} FROM user`);

      expect(rows.length).toBe(3);
      for (const row of rows) expect(Object.values(row)).toEqual([1]);
      await expectIntact(get());
    });

    test('a 200000-character name breaks nothing', async () => {
      await fails(
        () => get().$raw(sql`SELECT * FROM ${sql.ident('a'.repeat(200_000))}`),
        CerialDatabaseError,
        /does not exist/,
      );
      await expectIntact(get());
    });

    test('the $auth name reads no parameter', async () => {
      const rows = await get().$raw(sql`SELECT ${sql.ident('$auth')} FROM user`);

      expect(rows).toEqual([{}, {}, {}]);
    });

    test('a hostile name inside a $raw where matches no row and deletes nothing', async () => {
      for (const [, name] of NAMES) {
        if (name === '') continue;
        const where = { $raw: sql`${sql.ident(name)} = ${1}` };

        expect(await get().db.User.findMany({ where })).toEqual([]);
        await get().db.User.deleteMany({ where });
      }

      await expectIntact(get());
    });

    test('a hostile name as a compute expression reads nothing from the row', async () => {
      const rows = await get().db.User.findMany({ compute: { c: sql`${sql.ident(`x${BREAK}`)}` } });

      expect(rows.length).toBe(3);
      await expectIntact(get());
    });
  });

  describe('sql.ident refuses a name that is not a string', () => {
    test.each([
      ['a number', 123],
      ['null', null],
      ['undefined', undefined],
      ['an object with toString', { toString: () => 'tag; DELETE tag' }],
      ['an array', ['tag']],
    ])('%s', async (_label, name) => {
      expect(() => sql.ident(name as never)).toThrow(CerialValidationError);
      expect(() => sql.ident(name as never)).toThrow(/the name must be a string/);
      await expectIntact(get());
    });
  });

  describe('sql.int takes a safe integer only', () => {
    test.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['1e300', 1e300],
      ['2**53', 2 ** 53],
      ['1.5', 1.5],
      ['a bigint', 5n],
      ['a string holding a statement', '1; DELETE tag'],
    ])('%s is refused', async (_label, value) => {
      expect(() => sql.int(value as never)).toThrow(CerialValidationError);
      await expectIntact(get());
    });

    test('a negative after a minus does not fuse into a comment', async () => {
      const fragment = sql<number>`RETURN 5 - ${sql.int(-1)}`;

      expect(compileRawStatement(fragment).text).toBe('RETURN 5 -  -1');
      expect(await get().$raw(fragment)).toEqual([6]);
    });

    test('-0 renders as 0 and a positive renders bare', async () => {
      expect(await get().$raw(sql`RETURN [${sql.int(-0)}, ${sql.int(7)}]`)).toEqual([0, 7]);
    });
  });
});
