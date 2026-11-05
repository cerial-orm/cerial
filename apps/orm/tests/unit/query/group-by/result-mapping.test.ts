import { describe, expect, test } from 'bun:test';
import { Decimal, RecordId, U64 } from 'surrealdb';
import { compileGroupBy } from '../../../../src/query/builder';
import { mapGroupByRows } from '../../../../src/query/mappers';
import type { GroupByArgs } from '../../../../src/query/validators';
import { CerialDecimal } from '../../../../src/utils/cerial-decimal';
import { CerialId } from '../../../../src/utils/cerial-id';
import { order, registry, type Loose } from './helpers';

/** Compiles `args` and maps `raw` the way a standalone call and a $transaction item both do. */
function map(args: Loose, raw: unknown): Record<string, unknown>[] {
  const compiled = compileGroupBy(order, args as unknown as GroupByArgs, registry);

  return mapGroupByRows(raw, compiled.rowShape!);
}

describe('groupBy result mapping: keys', () => {
  test('a record key becomes a CerialId and a date key stays a Date', () => {
    const created = new Date('2026-01-02T03:04:05Z');
    const [row] = map({ by: { customerId: true, createdAt: true } }, [
      { customerId: new RecordId('customer', 'c1'), createdAt: created },
    ]);

    expect(row!.customerId).toBeInstanceOf(CerialId);
    expect((row!.customerId as CerialId).toString()).toBe('customer:c1');
    expect(row!.createdAt).toEqual(created);
  });

  test('a NONE key leaves the key off the row and a null key stays null', () => {
    const rows = map({ by: { note: true, weight: true } }, [
      { note: undefined, weight: 1.5 },
      { note: null, weight: undefined },
    ]);

    expect(rows[0]).toEqual({ weight: 1.5 });
    expect('note' in rows[0]!).toBe(false);
    expect(rows[1]).toEqual({ note: null });
  });

  test('a decimal key becomes a CerialDecimal', () => {
    const [row] = map({ by: { total: true } }, [{ total: new Decimal('12.50') }]);

    expect(row!.total).toBeInstanceOf(CerialDecimal);
    expect((row!.total as CerialDecimal).toString()).toBe('12.5');
  });

  test('an object sub-key maps inside the nested row, and a sub-key that is NONE is dropped', () => {
    const rows = map({ by: { address: { city: true } } }, [{ address: { city: 'Oslo' } }, { address: {} }, {}]);

    expect(rows).toEqual([{ address: { city: 'Oslo' } }, { address: {} }, {}]);
  });

  test('an array key maps every member, null included', () => {
    const [row] = map({ by: { customerId: true, tags: true } }, [
      { customerId: new RecordId('customer', 'a'), tags: ['x', 'y'] },
    ]);

    expect(row!.tags).toEqual(['x', 'y']);
  });

  test('unrequested or unknown row properties are not copied', () => {
    expect(map({ by: { status: true } }, [{ status: 'open', id: 'x', stray: 1 }])).toEqual([{ status: 'open' }]);
  });
});

describe('groupBy result mapping: aggregates', () => {
  test('_count: true maps to { _all }, and a field count maps beside it', () => {
    expect(map({ by: { status: true }, _count: true }, [{ status: 'a', _count: { _all: 3 } }])).toEqual([
      { status: 'a', _count: { _all: 3 } },
    ]);
    expect(
      map({ by: { status: true }, _count: { _all: true, note: true } }, [
        { status: 'a', _count: { _all: 3, note: 2 } },
      ])[0]!._count,
    ).toEqual({ _all: 3, note: 2 });
  });

  test('a decimal sum is a CerialDecimal, and an empty group sum (int 0) is CerialDecimal 0', () => {
    const rows = map({ by: { status: true }, _sum: { total: true } }, [
      { status: 'a', _sum: { total: new Decimal('1.65') } },
      { status: 'b', _sum: { total: 0 } },
      { status: 'c', _sum: {} },
    ]);
    const sums = rows.map((r) => (r._sum as { total: CerialDecimal }).total);

    expect(sums.every((s) => s instanceof CerialDecimal)).toBe(true);
    expect(sums.map((s) => s.toString())).toEqual(['1.65', '0', '0']);
  });

  test('a number sum is a number, a SizedNumber or bigint sum is a number, and no value sums to 0', () => {
    const [row] = map({ by: { status: true }, _sum: { qty: true, weight: true } }, [
      { status: 'a', _sum: { qty: new U64(7), weight: undefined } },
    ]);

    expect(row!._sum).toEqual({ qty: 7, weight: 0 });
    expect(map({ by: { status: true }, _sum: { qty: true } }, [{ status: 'a', _sum: { qty: 9n } }])[0]!._sum).toEqual({
      qty: 9,
    });
  });

  test('a decimal average is a CerialDecimal, and NaN, NONE or null averages are null', () => {
    const rows = map({ by: { status: true }, _avg: { total: true } }, [
      { status: 'a', _avg: { total: new Decimal('1.650') } },
      { status: 'b', _avg: { total: Number.NaN } },
      { status: 'c', _avg: { total: null } },
      { status: 'd', _avg: {} },
    ]);
    const avgs = rows.map((r) => (r._avg as { total: CerialDecimal | null }).total);

    expect(avgs[0]).toBeInstanceOf(CerialDecimal);
    expect(avgs[0]!.toString()).toBe('1.65');
    expect(avgs.slice(1)).toEqual([null, null, null]);
  });

  test('a number average is a number and an empty one (NaN) is null', () => {
    const rows = map({ by: { status: true }, _avg: { qty: true } }, [
      { status: 'a', _avg: { qty: 2.5 } },
      { status: 'b', _avg: { qty: Number.NaN } },
    ]);

    expect(rows.map((r) => r._avg)).toEqual([{ qty: 2.5 }, { qty: null }]);
  });

  test('min and max map by field type, with NONE and null as null', () => {
    const created = new Date('2026-05-05T00:00:00Z');
    const [row, empty] = map({ by: { status: true }, _min: { total: true, createdAt: true }, _max: { qty: true } }, [
      { status: 'a', _min: { total: new Decimal('2'), createdAt: created }, _max: { qty: 4 } },
      { status: 'b', _min: { total: undefined, createdAt: null }, _max: {} },
    ]);

    expect((row!._min as { total: CerialDecimal }).total.toString()).toBe('2');
    expect((row!._min as { createdAt: Date }).createdAt).toEqual(created);
    expect(row!._max).toEqual({ qty: 4 });
    expect(empty!._min).toEqual({ total: null, createdAt: null });
    expect(empty!._max).toEqual({ qty: null });
  });

  test('min of a record key is a CerialId', () => {
    const [row] = map({ by: { status: true }, _min: { customerId: true } }, [
      { status: 'a', _min: { customerId: new RecordId('customer', 'c9') } },
    ]);

    expect((row!._min as { customerId: CerialId }).customerId).toBeInstanceOf(CerialId);
  });

  test('_group drops NONE members, drops null members on a non-nullable field and keeps them on a @nullable one', () => {
    const [row] = map({ by: { status: true }, _group: { weight: true, note: true, customerId: true } }, [
      {
        status: 'a',
        _group: {
          weight: [1, undefined, null, 2],
          note: ['x', undefined, null],
          customerId: [new RecordId('customer', 'c1')],
        },
      },
    ]);
    const group = row!._group as { weight: unknown[]; note: unknown[]; customerId: unknown[] };

    expect(group.weight).toEqual([1, 2]);
    expect(group.note).toEqual(['x', null]);
    expect(group.customerId[0]).toBeInstanceOf(CerialId);
  });

  test('_group over an absent or non-array value is an empty array', () => {
    expect(map({ by: { status: true }, _group: { tags: true } }, [{ status: 'a', _group: {} }])[0]!._group).toEqual({
      tags: [],
    });
  });

  test('every aggregate together keeps the keys first and the aggregates in the written namespaces', () => {
    const [row] = map(
      {
        by: { status: true },
        _count: true,
        _sum: { qty: true },
        _avg: { qty: true },
        _min: { qty: true },
        _max: { qty: true },
        _group: { tags: true },
      },
      [
        {
          status: 'a',
          _count: { _all: 2 },
          _sum: { qty: 5 },
          _avg: { qty: 2.5 },
          _min: { qty: 2 },
          _max: { qty: 3 },
          _group: { tags: ['t'] },
        },
      ],
    );

    expect(row).toEqual({
      status: 'a',
      _count: { _all: 2 },
      _sum: { qty: 5 },
      _avg: { qty: 2.5 },
      _min: { qty: 2 },
      _max: { qty: 3 },
      _group: { tags: ['t'] },
    });
  });
});

describe('groupBy result mapping: shape of the answer', () => {
  test('no rows map to an empty array', () => {
    expect(map({ by: { status: true }, _count: true }, [])).toEqual([]);
  });

  test('a result that is not an array maps to an empty array', () => {
    expect(map({ by: { status: true } }, undefined)).toEqual([]);
    expect(map({ by: { status: true } }, null)).toEqual([]);
    expect(map({ by: { status: true } }, { status: 'a' })).toEqual([]);
  });

  test('an aggregate missing from the server row still maps to its empty value', () => {
    expect(map({ by: { status: true }, _count: true }, [{ status: 'a' }])).toEqual([
      { status: 'a', _count: { _all: 0 } },
    ]);
  });

  test('compile marks the result type and describes the row shape, not the model', () => {
    const compiled = compileGroupBy(order, { by: { status: true }, _sum: { total: true } } as GroupByArgs, registry);

    expect(compiled.resultType).toBe('groupBy');
    expect(compiled.rowShape!.fields.map((f) => f.name)).toEqual(['status', '_sum']);
  });
});
