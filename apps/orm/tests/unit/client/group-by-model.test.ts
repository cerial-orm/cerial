/**
 * Unit tests: Model.groupBy standalone, and as a $transaction item in array and function-item modes.
 * A fake connection records what is sent and answers with fixed rows.
 */

import { describe, expect, test } from 'bun:test';
import { Decimal, type Surreal } from 'surrealdb';
import { Model } from '../../../src/client/model/model';
import { CerialValidationError } from '../../../src/errors';
import { CerialQueryPromise } from '../../../src/query/cerial-query-promise';
import { executeClientTransaction } from '../../../src/query/executor';
import type { CerialDecimal } from '../../../src/utils/cerial-decimal';
import { order, registry } from '../query/group-by/helpers';

const ROWS = [
  { status: 'open', _count: { _all: 2 }, _sum: { total: new Decimal('3.5') } },
  { status: 'void', _count: { _all: 0 }, _sum: { total: 0 } },
];
const ARGS = { by: { status: true }, _count: true, _sum: { total: true } } as const;

interface Sent {
  text: string;
  vars: unknown;
}

/** Answers every query with `rows`; `inTransaction` holds what the transaction connection ran. */
function fakeDb(rows: unknown[] = ROWS): { db: Surreal; standalone: Sent[]; inTransaction: Sent[]; ended: string[] } {
  const standalone: Sent[] = [];
  const inTransaction: Sent[] = [];
  const ended: string[] = [];
  const run = (into: Sent[]) => (bound: { query: string; bindings: unknown }) => {
    into.push({ text: bound.query, vars: bound.bindings });

    return { collect: async () => [rows] };
  };
  const txn = {
    query: run(inTransaction),
    commit: async () => void ended.push('commit'),
    cancel: async () => void ended.push('cancel'),
  };
  const db = { query: run(standalone), beginTransaction: async () => txn } as unknown as Surreal;

  return { db, standalone, inTransaction, ended };
}

const sums = (rows: Record<string, unknown>[]): string[] =>
  rows.map((r) => (r._sum as { total: CerialDecimal }).total.toString());

describe('Model.groupBy standalone', () => {
  test('sends the compiled query once and maps the rows', async () => {
    const { db, standalone } = fakeDb();
    const rows = await new Model(db, order, registry).groupBy({ ...ARGS });

    expect(standalone).toHaveLength(1);
    expect(standalone[0]!.text).toBe(
      'SELECT status, count() AS _count._all, math::sum(total) AS _sum.total FROM order GROUP BY status',
    );
    expect(rows.map((r) => r.status)).toEqual(['open', 'void']);
    expect(rows.map((r) => r._count)).toEqual([{ _all: 2 }, { _all: 0 }]);
    expect(sums(rows)).toEqual(['3.5', '0']);
  });

  test('where values reach the connection as bindings', async () => {
    const { db, standalone } = fakeDb();
    await new Model(db, order, registry).groupBy({ by: { status: true }, where: { qty: { gte: 3 } } });

    expect(standalone[0]!.text).not.toContain('3');
    expect(Object.values(standalone[0]!.vars as Record<string, unknown>)).toEqual([3]);
  });

  test('an empty table answers no rows', async () => {
    const { db } = fakeDb([]);

    expect(await new Model(db, order, registry).groupBy({ by: { status: true } })).toEqual([]);
  });

  test('the query is lazy: nothing is sent until it is awaited', async () => {
    const { db, standalone } = fakeDb();
    const query = new Model(db, order, registry).groupBy({ ...ARGS });

    expect(query).toBeInstanceOf(CerialQueryPromise);
    expect(query.resultType).toBe('groupBy');
    expect(standalone).toEqual([]);
    await query;
    expect(standalone).toHaveLength(1);
  });

  test('onBeforeQuery hooks run with the model name before the query', async () => {
    const { db, standalone } = fakeDb();
    const seen: string[][] = [];
    const model = new Model(db, order, registry, {
      onBeforeQuery: async (names) => {
        seen.push(names);
        expect(standalone).toEqual([]);
      },
    });
    await model.groupBy({ by: { status: true } });

    expect(seen[0]).toContain('Order');
  });

  test('a database failure is wrapped in the groupBy call', async () => {
    const db = {
      query: () => ({
        collect: async () => {
          throw new Error('boom');
        },
      }),
    } as unknown as Surreal;

    await expect(
      (async () => {
        await new Model(db, order, registry).groupBy({ by: { status: true } });
      })(),
    ).rejects.toThrow();
  });
});

describe('Model.groupBy refuses invalid arguments before sending', () => {
  const refused: Array<[string, Record<string, unknown>]> = [
    ['no by', {}],
    ['an empty by', { by: {} }],
    ['an unknown key', { by: { nope: true } }],
    ['a relation key', { by: { customer: true } }],
    ['a sum of a string', { by: { status: true }, _sum: { status: true } }],
    ['select', { by: { status: true }, select: { status: true } }],
    ['having', { by: { status: true }, having: {} }],
    ['an unrequested aggregate in orderBy', { by: { status: true }, orderBy: { _count: { _all: 'asc' } } }],
    ['a negative limit', { by: { status: true }, limit: -1 }],
    ['a where on an unknown field', { by: { status: true }, where: { nope: 1 } }],
  ];

  test.each(refused)('%s throws at the call, not at await', (_label, args) => {
    const { db, standalone } = fakeDb();

    expect(() => new Model(db, order, registry).groupBy(args as never)).toThrow();
    expect(standalone).toEqual([]);
  });

  test('the refusal is a validation error naming groupBy and the model', () => {
    const { db } = fakeDb();

    try {
      new Model(db, order, registry).groupBy({ by: {} } as never);
      throw new Error('did not throw');
    } catch (error) {
      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain('Invalid groupBy');
    }
  });

  test('a refused call inside a transaction array never starts the transaction', () => {
    const { db, standalone, inTransaction, ended } = fakeDb();

    expect(() => [new Model(db, order, registry).groupBy({ by: { nope: true } } as never)]).toThrow();
    expect(standalone.concat(inTransaction)).toEqual([]);
    expect(ended).toEqual([]);
  });
});

describe('Model.groupBy in $transaction', () => {
  test('array mode: runs on the transaction connection and maps the rows from the item description', async () => {
    const { db, standalone, inTransaction, ended } = fakeDb();
    const query = new Model(db, order, registry).groupBy({ ...ARGS });

    const [rows] = (await executeClientTransaction(db, [
      {
        compiledQuery: query.compiledQuery,
        metadata: query.metadata,
        resultType: query.resultType,
        registry: query.registry,
        select: query.select,
      },
    ])) as [Record<string, unknown>[]];

    expect(standalone).toEqual([]);
    expect(inTransaction).toHaveLength(1);
    expect(inTransaction[0]!.text).toContain('GROUP BY status');
    expect(ended).toEqual(['commit']);
    expect(rows.map((r) => r.status)).toEqual(['open', 'void']);
    expect(sums(rows)).toEqual(['3.5', '0']);
  });

  test('function item returning a groupBy runs inside the transaction and its rows are mapped', async () => {
    const { db, standalone, inTransaction } = fakeDb();
    const model = new Model(db, order, registry);

    const [rows] = (await executeClientTransaction(db, [() => model.groupBy({ ...ARGS })])) as [
      Record<string, unknown>[],
    ];

    expect(standalone).toEqual([]);
    expect(inTransaction).toHaveLength(1);
    expect(sums(rows)).toEqual(['3.5', '0']);
  });

  test('a groupBy beside a later failing item is cancelled with the transaction', async () => {
    const { db, ended } = fakeDb();
    const model = new Model(db, order, registry);

    await expect(
      executeClientTransaction(db, [
        () => model.groupBy({ ...ARGS }),
        () => {
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');
    expect(ended).toEqual(['cancel']);
  });
});
