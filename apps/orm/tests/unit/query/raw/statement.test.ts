/**
 * Unit Tests: whole raw statements
 *
 * Refusals first, each proven to reach no database. Then compilation, the last-statement result rule and the
 * row mapping that keeps non-object results.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { RecordId } from 'surrealdb';
import { CerialQueryPromise } from '../../../../src/query/cerial-query-promise';
import { Model } from '../../../../src/client/model/model';
import { createClientRawStatement } from '../../../../src/client/raw-statement';
import { CerialDatabaseError, CerialValidationError } from '../../../../src/errors';
import { sql } from '../../../../src/query';
import { mapRawResult } from '../../../../src/query/mappers';
import { compileRawStatement, executeRawStatement } from '../../../../src/query/raw-statement';
import { post, registry } from '../relation-order-by-helpers';

/** A connection that fails the test if anything is sent to it */
const untouched = {
  query: () => {
    throw new Error('the database was called');
  },
} as unknown as Surreal;

/** A connection answering with fixed per-statement results */
function answering(results: unknown[]): { db: Surreal; calls: Array<{ text: string; vars: unknown }> } {
  const calls: Array<{ text: string; vars: unknown }> = [];
  const db = {
    query: (bound: { query: string; bindings: unknown }) => {
      calls.push({ text: bound.query, vars: bound.bindings });

      return { collect: async () => results };
    },
  } as unknown as Surreal;

  return { db, calls };
}

const refused: Array<[string, unknown]> = [
  ['a plain string', 'DELETE post'],
  ['a plain object', { strings: ['DELETE post'], values: [] }],
  ['a spread fragment', { ...sql`SELECT 1` }],
  ['a JSON round trip', JSON.parse(JSON.stringify(sql`SELECT 1`))],
  ['an inheriting object', Object.create(sql`SELECT 1`)],
  ['undefined', undefined],
  ['null', null],
];

describe('raw statement refusals reach no database', () => {
  test.each(refused)('compileRawStatement refuses %s', (_label, value) => {
    expect(() => compileRawStatement(value)).toThrow(CerialValidationError);
  });

  test.each(refused)('client $raw refuses %s', (_label, value) => {
    expect(() => createClientRawStatement(value as never, async () => untouched)).toThrow(CerialValidationError);
  });

  test.each(refused)('Model.$raw refuses %s', (_label, value) => {
    const model = new Model(untouched, post, registry);

    expect(() => model.$raw(value as never)).toThrow(CerialValidationError);
  });
});

describe('compileRawStatement', () => {
  test('binds every value and splices a nested fragment and sql.ident', () => {
    const inner = sql`age > ${18}`;
    const compiled = compileRawStatement(
      sql`SELECT * FROM ${sql.ident('user')} WHERE ${inner} AND name = ${'a; DELETE user'}`,
    );

    expect(compiled.text).toMatch(/^SELECT \* FROM `user` WHERE age > \$\w+ AND name = \$\w+$/);
    expect(Object.values(compiled.vars).sort()).toEqual([18, 'a; DELETE user'].sort());
    expect(compiled.text).not.toContain('DELETE');
  });
});

describe('executeRawStatement', () => {
  const run = (results: unknown[]) => {
    const { db, calls } = answering(results);

    return { calls, rows: executeRawStatement(db, compileRawStatement(sql`SELECT 1`)) };
  };

  test('returns the last statement, not the first or the last non-null', async () => {
    expect(await run([[{ a: 1 }], [{ b: 2 }], []]).rows).toEqual([]);
    expect(await run([[{ a: 1 }], [{ b: 2 }]]).rows).toEqual([{ b: 2 }]);
  });

  test('wraps a scalar', async () => {
    expect(await run([[{ a: 1 }], 7]).rows).toEqual([7]);
  });

  test('gives [] for NONE and for no results', async () => {
    expect(await run([[{ a: 1 }], undefined]).rows).toEqual([]);
    expect(await run([]).rows).toEqual([]);
  });

  test('keeps null as a value', async () => {
    expect(await run([null]).rows).toEqual([null]);
  });

  test('sends the compiled text and bindings once', async () => {
    const { db, calls } = answering([[1]]);
    await executeRawStatement(db, compileRawStatement(sql`SELECT ${5}`));

    expect(calls).toHaveLength(1);
    expect(Object.values(calls[0]!.vars as object)).toEqual([5]);
  });
});

describe('mapRawResult', () => {
  const id = new RecordId('post', 'p1');

  test('maps object rows as the model', () => {
    const [row] = mapRawResult<{ id: unknown; title: string }>([{ id, title: 't' }], post);

    expect(row!.title).toBe('t');
    expect(typeof row!.id).not.toBe('undefined');
    expect(row!.id).not.toBe(id);
  });

  test('passes scalars, null, arrays and driver values through, so SELECT VALUE keeps its results', () => {
    const rows = ['a', 1, true, null, [1, 2], id];

    expect(mapRawResult(rows, post)).toEqual(rows);
  });

  test('handles object and scalar rows together without dropping any', () => {
    const rows = mapRawResult<unknown>([{ title: 't' }, 'x', 3], post);

    expect(rows).toHaveLength(3);
    expect(rows.slice(1)).toEqual(['x', 3]);
  });
});

describe('Model.$raw execution', () => {
  test('maps rows and passes scalars through', async () => {
    const { db } = answering([[{ title: 't' }, 'x']]);
    const rows = await new Model(db, post, registry).$raw(sql`SELECT 1`);

    expect(rows).toHaveLength(2);
    expect(rows[1]).toBe('x');
  });

  test('runs the before-query hook with every model, since a statement can name any table', async () => {
    const seen: string[][] = [];
    const { db } = answering([[]]);
    await new Model(db, post, registry, { onBeforeQuery: async (names) => void seen.push(names) }).$raw(sql`SELECT 1`);

    expect(seen).toEqual([Object.keys(registry)]);
  });

  test('is a CerialQueryPromise of kind raw, with no database call until awaited', () => {
    const promise = new Model(untouched, post, registry).$raw(sql`SELECT 1`);

    expect(CerialQueryPromise.isCerialQueryPromise(promise)).toBe(true);
    expect(promise.resultType).toBe('raw');
  });

  test('a client statement has no metadata and no model names', () => {
    const promise = createClientRawStatement(sql`SELECT 1`, async () => untouched);

    expect(promise.metadata).toBeUndefined();
    expect(promise.modelNames).toEqual([]);
  });

  test('a driver failure stays a Cerial error type', async () => {
    const db = {
      query: () => ({
        collect: async () => {
          throw new CerialDatabaseError('boom');
        },
      }),
    } as unknown as Surreal;

    await expect(
      (async () => {
        await new Model(db, post, registry).$raw(sql`SELECT 1`);
      })(),
    ).rejects.toThrow(CerialDatabaseError);
  });
});
