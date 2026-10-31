import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { fragmentToExpr } from '../../../src/client/live/where-expr';
import { CerialValidationError } from '../../../src/errors';
import { sql } from '../../../src/query';
import { CerialId } from '../../../src/utils';

/** Stands in for the SDK's ExprCtx: names each bound value `$d<n>` and keeps what it was given. */
function makeCtx() {
  const defined: unknown[] = [];

  return {
    defined,
    ctx: {
      def: (value: unknown): string => {
        defined.push(value);

        return `$d${defined.length - 1}`;
      },
    },
  };
}

describe('fragmentToExpr: refusals', () => {
  const forged = [
    ['a plain string', 'age > 1'],
    ['a plain object shaped like a fragment', { strings: ['age > 1'], values: [] }],
    ['a spread copy of a fragment', { ...sql`age > ${1}` }],
    ['a JSON round trip of a fragment', JSON.parse(JSON.stringify(sql`age > ${1}`))],
    ['an object inheriting a fragment', Object.create(sql`age > ${1}`)],
    ['null', null],
    ['a number', 5],
  ] as const;

  test.each(forged)('%s refuses before anything is built', (_label, value) => {
    expect(() => fragmentToExpr(value)).toThrow(CerialValidationError);
  });

  test('a fragment holding a nested forged value cannot be built to begin with', () => {
    expect(() => sql`age > ${sql`1`} AND ${[sql`2`]}`).toThrow(CerialValidationError);
  });
});

describe('fragmentToExpr: binding', () => {
  test('every value goes through ctx.def and the text holds only placeholders', () => {
    const payload = "x'; DELETE user; --";
    const { ctx, defined } = makeCtx();
    const text = fragmentToExpr(sql`name = ${payload} AND age > ${3}`).toSQL(ctx);

    expect(text).toBe('name = $d0 AND age > $d1');
    expect(defined).toEqual([payload, 3]);
    expect(text).not.toContain('DELETE');
  });

  test('a nested fragment splices and its values bind in order', () => {
    const { ctx, defined } = makeCtx();
    const text = fragmentToExpr(sql`a = ${1} AND (${sql`b = ${2} OR c = ${3}`}) AND d = ${4}`).toSQL(ctx);

    expect(text).toBe('a = $d0 AND (b = $d1 OR c = $d2) AND d = $d3');
    expect(defined).toEqual([1, 2, 3, 4]);
  });

  test('sql.ident and sql.int splice and bind nothing', () => {
    const { ctx, defined } = makeCtx();

    expect(fragmentToExpr(sql`${sql.ident('my field')} > ${sql.int(3)}`).toSQL(ctx)).toBe('`my field` > 3');
    expect(defined).toEqual([]);
  });

  test('past ten values no placeholder is a prefix-rewrite of another', () => {
    const { ctx, defined } = makeCtx();
    const values = Array.from({ length: 12 }, (_, i) => i);
    const fragment = sql`${values[0]},${values[1]},${values[2]},${values[3]},${values[4]},${values[5]},${values[6]},${values[7]},${values[8]},${values[9]},${values[10]},${values[11]}`;
    const text = fragmentToExpr(fragment).toSQL(ctx);

    expect(text).toBe(values.map((_, i) => `$d${i}`).join(','));
    expect(defined).toEqual(values);
  });

  test('a CerialId is unwrapped to the driver record id', () => {
    const { ctx, defined } = makeCtx();
    fragmentToExpr(sql`owner = ${new CerialId('user:1')}`).toSQL(ctx);

    expect(defined[0]).toBeInstanceOf(RecordId);
  });

  test('toSQL can run twice and names each run from the context it is given', () => {
    const expr = fragmentToExpr(sql`age > ${1}`);
    const first = makeCtx();
    const second = makeCtx();

    expect(expr.toSQL(first.ctx)).toBe('age > $d0');
    expect(expr.toSQL(second.ctx)).toBe('age > $d0');
    expect(second.defined).toEqual([1]);
  });
});
