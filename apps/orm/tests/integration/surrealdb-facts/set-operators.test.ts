/**
 * Facts about array operators on `set<T>` fields on SurrealDB 4.0. A set is its own value type:
 * `array::len()` refuses it, while the `.len()` method and the CONTAINS family accept arrays and
 * sets alike, at the top level and under an object. Each fact has a case that holds and one refused.
 * `.len()` on NONE is refused, so the isEmpty form guards it: `(f != NONE AND f.len() = 0)` matches a
 * present empty value only and never errors on an absent one.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

let db: ScratchDatabase;

beforeAll(async () => {
  db = await withScratchDatabase('set_operators');
  await run(
    db,
    `DEFINE TABLE t SCHEMAFULL;
     DEFINE FIELD a ON t TYPE array<int> DEFAULT [];
     DEFINE FIELD s ON t TYPE set<int> DEFAULT <set>[];
     DEFINE FIELD oa ON t TYPE option<array<int>>;
     DEFINE FIELD os ON t TYPE option<set<int>>;
     DEFINE FIELD o ON t TYPE option<object>;
     DEFINE FIELD o.xs ON t TYPE set<int> DEFAULT <set>[];
     DEFINE FIELD o.ys ON t TYPE array<int> DEFAULT [];
     CREATE t:1 SET a=[], s=<set>[], oa=[], os=<set>[], o={xs:<set>[],ys:[]};
     CREATE t:2 SET a=[1,2], s=<set>[1,2], oa=[1,2], os=<set>[1,2], o={xs:<set>[1,2],ys:[1,2]};
     CREATE t:3;`,
  );
});

afterAll(async () => {
  await db.remove();
});

/** The ids a WHERE clause matches, or the error text when the statement is refused. */
async function ids(where: string): Promise<number[] | string> {
  const [res] = await run(db, `SELECT VALUE meta::id(id) FROM t WHERE ${where} ORDER BY id;`);
  if (res!.status !== 'OK') return String(res!.result);

  return res!.result as number[];
}

describe('isEmpty form on sets', () => {
  test('array::len() on a set is refused', async () => {
    expect(await ids('array::len(s) = 0')).toContain('Expected `array` but found');
  });

  test('array::len() on an array still works', async () => {
    expect(await ids('array::len(a) = 0')).toEqual([1, 3]);
  });

  test('.len() works on array and set, empty and filled', async () => {
    expect(await ids('a.len() = 0')).toEqual([1, 3]);
    expect(await ids('a.len() > 0')).toEqual([2]);
    expect(await ids('s.len() = 0')).toEqual([1, 3]);
    expect(await ids('s.len() > 0')).toEqual([2]);
  });

  test('.len() on a set or array under an object works when the object is present, is refused when absent', async () => {
    expect(await ids('o != NONE AND o.xs.len() > 0')).toEqual([2]);
    expect(await ids('o != NONE AND o.ys.len() > 0')).toEqual([2]);
    expect(await ids('o.xs.len() > 0')).toContain('no such method found for the none type');
  });

  test('.len() on an absent option<array> or option<set> is refused, as array::len() is', async () => {
    expect(await ids('oa.len() = 0')).toContain('no such method found for the none type');
    expect(await ids('os.len() = 0')).toContain('no such method found for the none type');
    expect(await ids('array::len(oa) = 0')).toContain('but found `NONE`');
  });

  test('.len() on a present option<array> and option<set> works', async () => {
    const [res] = await run(db, 'SELECT VALUE meta::id(id) FROM t WHERE oa != NONE AND oa.len() > 0 AND os.len() > 0;');
    expect(res!.result).toEqual([2]);
  });
});

describe('isEmpty guard form on absent values', () => {
  const guarded = (f: string, op: '= 0' | '> 0'): string => `(${f} != NONE AND ${f}.len() ${op})`;

  test('array, set, option<array>, option<set>: empty matches true, non-empty matches false, NONE neither', async () => {
    for (const f of ['a', 's', 'oa', 'os']) {
      expect(await ids(guarded(f, '= 0'))).toEqual([1, ...(f === 'a' || f === 's' ? [3] : [])]);
      expect(await ids(guarded(f, '> 0'))).toEqual([2]);
    }
  });

  test('a sub-field under an absent object matches neither and does not error', async () => {
    for (const f of ['o.xs', 'o.ys']) {
      expect(await ids(guarded(f, '= 0'))).toEqual([1]);
      expect(await ids(guarded(f, '> 0'))).toEqual([2]);
    }
  });

  test('isNone selects the absent value only, and OR with isEmpty: true gives empty plus absent', async () => {
    expect(await ids('oa = NONE')).toEqual([3]);
    expect(await ids('os != NONE')).toEqual([1, 2]);
    expect(await ids('o.xs = NONE')).toEqual([3]);
    expect(await ids(`${guarded('o.xs', '= 0')} OR o.xs = NONE`)).toEqual([1, 3]);
    expect(await ids(`${guarded('oa', '= 0')} OR oa = NONE`)).toEqual([1, 3]);
  });

  test('NOT of the guarded form keeps the absent record', async () => {
    expect(await ids(`!${guarded('oa', '= 0')}`)).toEqual([2, 3]);
    expect(await ids(`!${guarded('o.xs', '> 0')}`)).toEqual([1, 3]);
  });
});

describe('CONTAINS family on sets', () => {
  test('CONTAINS, CONTAINSALL and CONTAINSANY match sets and arrays', async () => {
    for (const f of ['a', 's', 'os', 'o.xs', 'o.ys']) {
      expect(await ids(`${f} CONTAINS 1`)).toEqual([2]);
      expect(await ids(`${f} CONTAINSALL [1, 2]`)).toEqual([2]);
      expect(await ids(`${f} CONTAINSANY [2, 9]`)).toEqual([2]);
    }
  });

  test('misses match nothing', async () => {
    for (const f of ['a', 's', 'o.xs']) {
      expect(await ids(`${f} CONTAINS 9`)).toEqual([]);
      expect(await ids(`${f} CONTAINSALL [1, 9]`)).toEqual([]);
      expect(await ids(`${f} CONTAINSANY [8, 9]`)).toEqual([]);
    }
  });
});
