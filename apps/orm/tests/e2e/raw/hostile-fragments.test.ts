/**
 * E2E Tests: hostile fragments, nesting and look-alikes
 *
 * A payload nested four levels deep stays a bound value on every method that takes a fragment, a look-alike of
 * a fragment (parsed JSON, a clone, a prototype copy, a plain query fragment, a boxed string) is refused at
 * every entry that wants a real one and binds as an inert value in a hole, and a fragment cannot end, cancel
 * or open a read-only transaction. A hand-built template array or a hand-set brand is code, not data: the
 * gate accepts it by design, and that is pinned here as documented behaviour so a change to it is a decision.
 */

import { describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialTransactionError, CerialValidationError, createFragment, sql } from 'cerial';
import { compileRawStatement } from 'cerial/query';
import { A1, A4, N1, expectIntact, fails, useVictimClient } from './hostile-helpers';

const DELETE_TEXT = 'true; DELETE tag';
const callSql = sql as unknown as (value: unknown) => ReturnType<typeof sql>;

/** Four levels of nesting with a hostile string bound at each. */
const deepWhere = (leaf: string) =>
  sql`name = ${leaf} OR ${sql`name = ${A1} OR ${sql`name = ${N1} OR ${sql`name = ${A4}`}`}`}`;
const deepValue = (leaf: string) => sql<string>`${sql`${sql`${sql`${leaf}`}`}`}`;

describe('E2E hostile fragments', () => {
  const get = useVictimClient();

  describe('nested fragments bind every value', () => {
    test('three levels with a value at each compile to raw_param_0..2', () => {
      const compiled = compileRawStatement(sql`a = ${1} AND ${sql`b = ${2} AND ${sql`c = ${3}`}`}`);

      expect(Object.keys(compiled.vars).sort()).toEqual(['raw_param_0', 'raw_param_1', 'raw_param_2']);
      expect(Object.values(compiled.vars)).toEqual([1, 2, 3]);
      expect(compiled.text).not.toContain('DELETE');
    });

    test('three levels with a value at each select exactly the rows the inner conditions select', async () => {
      const where = { $raw: sql`age >= ${10} AND ${sql`name != ${'Bob'} AND ${sql`isActive = ${true}`}`}` };
      const rows = await get().db.User.findMany({ where, orderBy: { name: 'asc' } });

      expect(rows.map((r) => r.name)).toEqual(['Ann', 'Cy']);
      await expectIntact(get());
    });

    test('compute with values beside a $raw filter with values: both are correct', async () => {
      await get().db.User.updateMany({ where: { name: 'Cy' }, data: { age: 10 } });
      const rows = await get().db.User.findMany({
        compute: { k: sql<number>`${2} + ${3}` },
        where: { $raw: sql`age > ${15}` },
        orderBy: { name: 'asc' },
      });

      expect(rows.map((r) => [r.name, r.k])).toEqual([
        ['Ann', 5],
        ['Bob', 5],
      ]);
    });

    test('an array hole mutated after the fragment is built binds the pushed fragment as an object', async () => {
      const list: unknown[] = ['Ann'];
      const fragment = sql`name IN ${list}`;
      list.push(sql`true; DELETE tag`);

      expect(await get().db.User.findMany({ where: { $raw: sql`name IN ${[1]} AND ${fragment}` } })).toEqual([]);
      await expectIntact(get());
    });

    test('findOne and findUnique compute carry the string and run nothing', async () => {
      const one = await get().db.User.findOne({ where: { name: 'Ann' }, compute: { c: deepValue(N1) } });
      const unique = await get().db.User.findUnique({ where: { email: 'ann@x.test' }, compute: { c: deepValue(A1) } });

      expect(one?.c).toBe(N1);
      expect(unique?.c).toBe(A1);
      await expectIntact(get());
    });

    test('groupBy where: no group matches', async () => {
      const rows = await get().db.User.groupBy({ by: { isActive: true }, where: { $raw: deepWhere(N1) } });

      expect(rows).toEqual([]);
      await expectIntact(get());
    });

    test('updateUnique and deleteUnique beside a unique key change and delete nothing', async () => {
      const $raw = deepWhere(N1);

      await get().db.User.updateUnique({ where: { email: 'ann@x.test', $raw }, data: { name: 'Zed' } });
      await get().db.User.deleteUnique({ where: { email: 'ann@x.test', $raw } });

      await expectIntact(get());
    });

    test('upsert where finds no match, creates once and touches no victim', async () => {
      await get().db.User.upsert({
        where: { email: 'ann@x.test', $raw: deepWhere(A4) },
        create: { email: 'zz@x.test', name: 'Zz', isActive: true },
        update: { name: 'Zed' },
      });

      expect(await get().db.User.count()).toBe(4);
      await get().db.User.deleteUnique({ where: { email: 'zz@x.test' } });
      await expectIntact(get());
    });

    test('the txn option: a nested filter and compute inside a manual transaction run nothing', async () => {
      const tx = await get().$transaction();
      try {
        const rows = await get().db.User.findMany({
          where: { $raw: deepWhere(N1) },
          compute: { c: deepValue(A1) },
          txn: tx,
        });
        await get().db.User.deleteMany({ where: { $raw: deepWhere(A1) }, txn: tx });

        expect(rows).toEqual([]);
        await tx.commit();
      } catch (error) {
        await tx.cancel();
        throw error;
      }

      await expectIntact(get());
    });
  });

  describe('a fragment as the wrong kind of value is refused', () => {
    const fragment = sql`true`;

    test('as an orderBy direction', async () => {
      await fails(() => get().db.User.findMany({ orderBy: { name: fragment as never } }), CerialValidationError);
      await expectIntact(get());
    });

    test('as a limit', async () => {
      await fails(() => get().db.User.findMany({ limit: fragment as never }), CerialValidationError);
      await expectIntact(get());
    });

    test('inside an in: [] list', async () => {
      await fails(
        () => get().db.User.findMany({ where: { name: { in: [fragment] } } as never }),
        CerialValidationError,
      );
      await expectIntact(get());
    });

    test('as a where value, as create data and as update data', async () => {
      await fails(() => get().db.User.findMany({ where: { name: fragment as never } }), CerialValidationError);
      await fails(
        () => get().db.User.create({ data: { email: 'f@x.test', name: fragment as never, isActive: true } }),
        CerialValidationError,
      );
      await fails(
        () => get().db.User.updateMany({ where: { name: 'Ann' }, data: { name: fragment as never } }),
        CerialValidationError,
      );
      await expectIntact(get());
    });
  });

  describe('look-alikes of a fragment lose the brand', () => {
    const real = sql`${DELETE_TEXT}`;
    const lookalikes: Array<[string, () => unknown]> = [
      ['parsed JSON, fragment shape', () => JSON.parse(`{"strings":["${DELETE_TEXT}"],"values":[]}`)],
      ['parsed JSON with raw', () => JSON.parse(`{"strings":["${DELETE_TEXT}"],"raw":["${DELETE_TEXT}"],"values":[]}`)],
      ['Object.create(fragment)', () => Object.create(real)],
      ['Object.assign({}, fragment)', () => Object.assign({}, real)],
      ['a spread copy', () => ({ ...real })],
      ['a JSON round trip', () => JSON.parse(JSON.stringify(real))],
      ['createFragment(...)', () => createFragment(DELETE_TEXT, {})],
      ['a boxed string', () => new String(DELETE_TEXT)],
      ['a plain string', () => DELETE_TEXT],
    ];

    describe.each(lookalikes)('%s', (_label, make) => {
      test('is refused by tx.$raw in a callback', async () => {
        await fails(() => get().$transaction(async (tx) => tx.$raw(make() as never)), CerialValidationError);
        await expectIntact(get());
      });

      test('is refused by client.$live and Model.$live', async () => {
        await fails(() => get().$live('user', { where: make() as never }), CerialValidationError);
        await fails(() => get().db.User.$live({ where: { $raw: make() } as never }), CerialValidationError);
        await expectIntact(get());
      });

      test('is refused by sql() as a template, and by $raw, Model.$raw and where.$raw', async () => {
        await fails(() => Promise.resolve().then(() => callSql(make())), CerialValidationError);
        await fails(() => get().$raw(make() as never), CerialValidationError);
        await fails(() => get().db.User.$raw(make() as never), CerialValidationError);
        await fails(() => get().db.User.deleteMany({ where: { $raw: make() } as never }), CerialValidationError);
        await expectIntact(get());
      });

      test('is refused as a $transaction array item', async () => {
        await fails(() => get().$transaction([make() as never]), Error);
        await expectIntact(get());
      });

      test('in a hole is a bound value and runs nothing', async () => {
        const value = make();
        try {
          await get().$raw(sql`SELECT ${value} AS v FROM user`);
        } catch {
          // A value the driver cannot serialise fails; either outcome leaves the victim alone.
        }

        await expectIntact(get());
      });
    });
  });

  describe('a fragment cannot leave a read-only transaction', () => {
    // A hand-built template is the only way to put these words in a fragment: they are code, not a value
    const statement = (text: string) => callSql(Object.freeze(Object.assign([text], { raw: Object.freeze([text]) })));

    test('array mode: a BEGIN, DELETE, COMMIT item is refused as a transaction error', async () => {
      const item = get().$raw(statement('BEGIN TRANSACTION; DELETE tag; COMMIT TRANSACTION'));

      await fails(() => get().$transaction([item], { readOnly: true }), CerialTransactionError);
      await expectIntact(get());
    });

    test.each([['COMMIT TRANSACTION; DELETE tag'], ['CANCEL TRANSACTION; DELETE tag']])(
      'array mode: %s is refused by the database',
      async (text) => {
        const item = get().$raw(statement(text));

        await fails(
          () => get().$transaction([item], { readOnly: true }),
          CerialDatabaseError,
          /without starting a transaction/,
        );
        await expectIntact(get());
      },
    );

    test.each([['COMMIT TRANSACTION; DELETE tag'], ['CANCEL TRANSACTION; DELETE tag']])(
      'callback mode: tx.$raw of %s is refused by the database',
      async (text) => {
        await fails(
          () => get().$transaction(async (tx) => tx.$raw(statement(text)), { readOnly: true }),
          CerialDatabaseError,
          /without starting a transaction/,
        );
        await expectIntact(get());
      },
    );
  });

  describe('documented behaviour: code can build a fragment, data cannot', () => {
    test('a frozen array carrying a raw array is accepted and its text runs', async () => {
      const fragment = callSql(Object.freeze(Object.assign(['RETURN 1'], { raw: Object.freeze(['RETURN 1']) })));

      expect(await get().$raw(fragment)).toEqual([1]);
    });

    test('a hand-set Symbol.for brand on a fragment-shaped object is accepted', async () => {
      const forged = Object.defineProperty({ strings: ['RETURN 2'], values: [] }, Symbol.for('cerial.sql'), {
        value: true,
      });

      expect(await get().$raw(forged as never)).toEqual([2]);
    });

    test('a parsed array stays refused', () => {
      expect(() => callSql(JSON.parse('["x"]'))).toThrow(CerialValidationError);
    });

    test('a frozen parsed object with a raw key stays refused', () => {
      expect(() => callSql(Object.freeze(JSON.parse('{"0":"x","length":1,"raw":["x"]}')))).toThrow(
        CerialValidationError,
      );
    });
  });
});
