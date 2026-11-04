import { describe, expect, test } from 'bun:test';
import { compile } from './helpers';

const from = (projection: string): string => `SELECT status, ${projection} FROM order GROUP BY status`;

describe('groupBy aggregates', () => {
  test('_count: true is sugar for _all and counts rows', () => {
    expect(compile({ by: { status: true }, _count: true }).text).toBe(from('count() AS _count._all'));
    expect(compile({ by: { status: true }, _count: { _all: true } }).text).toBe(from('count() AS _count._all'));
  });

  test('_count of a field counts present values with the explicit NONE and NULL test, not bare count(f)', () => {
    const text = compile({ by: { status: true }, _count: { qty: true, note: true } }).text;
    expect(text).toBe(
      from('count(qty != NONE AND qty != NULL) AS _count.qty, count(note != NONE AND note != NULL) AS _count.note'),
    );
    expect(text).not.toContain('count(qty)');
  });

  test('_all and field counts mix in one map, in the order written', () => {
    expect(compile({ by: { status: true }, _count: { qty: true, _all: true } }).text).toBe(
      from('count(qty != NONE AND qty != NULL) AS _count.qty, count() AS _count._all'),
    );
  });

  test('_count accepts any stored non-relation field, objects and arrays included', () => {
    expect(
      compile({ by: { status: true }, _count: { address: true, tags: true, pos: true, blob: true, mixed: true } }).text,
    ).toContain('count(address != NONE AND address != NULL) AS _count.address');
  });

  test('_sum is math::sum over numeric fields', () => {
    expect(compile({ by: { status: true }, _sum: { qty: true, total: true, weight: true } }).text).toBe(
      from('math::sum(qty) AS _sum.qty, math::sum(total) AS _sum.total, math::sum(weight) AS _sum.weight'),
    );
  });

  test('_avg is math::mean for int and float, and sum over present count for a decimal', () => {
    expect(compile({ by: { status: true }, _avg: { qty: true, weight: true } }).text).toBe(
      from('math::mean(qty) AS _avg.qty, math::mean(weight) AS _avg.weight'),
    );
    expect(compile({ by: { status: true }, _avg: { total: true } }).text).toBe(
      from('math::sum(total) / count(total != NONE AND total != NULL) AS _avg.total'),
    );
  });

  test('_min and _max use array::min and array::max for every orderable type, numbers included', () => {
    expect(
      compile({ by: { status: true }, _min: { qty: true, createdAt: true }, _max: { qty: true, paid: true } }).text,
    ).toBe(
      from(
        'array::min(qty) AS _min.qty, array::min(createdAt) AS _min.createdAt, array::max(qty) AS _max.qty, array::max(paid) AS _max.paid',
      ),
    );
    expect(
      compile({ by: { status: true }, _min: { wait: true, ref: true, kind: true, customerId: true, id: true } }).text,
    ).toContain('array::min(wait) AS _min.wait, array::min(ref) AS _min.ref');
  });

  test('_group is array::group and accepts array fields', () => {
    expect(compile({ by: { status: true }, _group: { customerId: true, tags: true, scores: true } }).text).toBe(
      from(
        'array::group(customerId) AS _group.customerId, array::group(tags) AS _group.tags, array::group(scores) AS _group.scores',
      ),
    );
  });

  test('aggregates come in the fixed order _count, _sum, _avg, _min, _max, _group whatever the call order', () => {
    const text = compile({ by: { status: true }, _group: { tags: true }, _max: { qty: true }, _count: true }).text;
    expect(text.indexOf('_count._all')).toBeLessThan(text.indexOf('_max.qty'));
    expect(text.indexOf('_max.qty')).toBeLessThan(text.indexOf('_group.tags'));
  });

  test('aggregates add no bindings', () => {
    expect(compile({ by: { status: true }, _count: true, _sum: { qty: true } }).vars).toEqual({});
  });
});
