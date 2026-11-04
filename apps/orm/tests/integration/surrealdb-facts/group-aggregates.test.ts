/**
 * Facts about `GROUP BY` aggregates on SurrealDB 4.0.0, which a `groupBy` client method would rest on:
 * what `array::group`, `array::min` and `array::max` return per group, how `NONE` and `null` group and
 * aggregate, which keys group (scalar, array, object sub-key, record link, through a link), what `count`
 * and the `math::` aggregates do with absent and non-numeric values, the nested-aggregate refusal,
 * nested aliases, the missing `HAVING`, ordering and paging over groups, and what the SDK hands back.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

let db: ScratchDatabase;

/** Runs the text and returns its last statement's result; throws when that statement errors. */
async function ok(surql: string): Promise<unknown> {
  const results = await run(db, surql);
  const last = results[results.length - 1]!;
  if (last.status !== 'OK') throw new Error(`${surql} -> ${JSON.stringify(last)}`);

  return last.result;
}

/** Runs one statement expected to be refused and returns the server's message, parse errors included. */
async function refused(surql: string): Promise<string> {
  const results = await run(db, surql).catch((e: Error) => [{ status: 'ERR', result: e.message }]);
  const last = results[results.length - 1]!;
  expect(last.status).toBe('ERR');

  return String(last.result);
}

type Row = Record<string, unknown>;

/** Group rows keyed by the `k` column, so expectations do not depend on group order. */
async function byKey(surql: string): Promise<Record<string, Row>> {
  const rows = (await ok(surql)) as Row[];

  return Object.fromEntries(rows.map((r) => [String(r.k), r]));
}

beforeAll(async () => {
  db = await withScratchDatabase('group_aggregates');
  const results = await run(
    db,
    `DEFINE TABLE author SCHEMAFULL; DEFINE FIELD name ON author TYPE string;
     DEFINE TABLE item SCHEMAFULL;
     DEFINE FIELD cat ON item TYPE option<string>;
     DEFINE FIELD price ON item TYPE option<int | null>;
     DEFINE FIELD amt ON item TYPE option<decimal>;
     DEFINE FIELD ok ON item TYPE option<bool>;
     DEFINE FIELD at ON item TYPE option<datetime>;
     DEFINE FIELD d ON item TYPE option<duration>;
     DEFINE FIELD tags ON item TYPE array<string> DEFAULT [];
     DEFINE FIELD addr ON item TYPE option<object>; DEFINE FIELD addr.city ON item TYPE option<string>;
     DEFINE FIELD flex ON item TYPE option<object> FLEXIBLE;
     DEFINE FIELD author ON item TYPE option<record<author>>;
     CREATE author:1 SET name = 'Mia'; CREATE author:2 SET name = 'Abe';
     CREATE item:1 SET cat = 'a', price = 10, amt = 1.10dec, ok = true, at = d'2024-01-01', d = 1h, tags = ['x', 'y'],
       addr = { city: 'Oslo' }, flex = { 'a-b': 1 }, author = author:1;
     CREATE item:2 SET cat = 'a', price = 30, amt = 2.20dec, ok = false, at = d'2025-01-01', d = 30m, tags = ['y'],
       addr = { city: 'Bergen' }, flex = { 'a-b': 2 }, author = author:1;
     CREATE item:3 SET cat = 'a', price = NULL, author = author:2;
     CREATE item:4 SET cat = 'a', price = 10;
     CREATE item:5 SET cat = 'b', price = 0, ok = false, tags = ['z'], addr = { city: 'Oslo' }, author = author:2;
     CREATE item:6 SET cat = 'b';
     CREATE item:7 SET price = 7;
     CREATE item:8 SET cat = 'c', price = 3; CREATE item:9 SET cat = 'c', price = 1; CREATE item:10 SET cat = 'c', price = 2;`,
  );
  expect(results.every((r) => r.status === 'OK')).toBe(true);
});

afterAll(async () => {
  await db.remove();
});

describe('array::group, array::min and array::max as GROUP BY aggregates', () => {
  test('array::group collects the distinct values of each group in first-seen order', async () => {
    const groups = await byKey('SELECT cat AS k, array::group(price) AS g FROM item GROUP BY k;');
    expect(groups.a!.g).toEqual([10, 30, null]);
    expect(groups.c!.g).toEqual([3, 1, 2]);
  });

  test('array::group keeps NONE and null as members of the group', async () => {
    const groups = await byKey(
      'SELECT cat AS k, array::map(array::group(price), |$v| type::of($v)) AS t FROM item GROUP BY k;',
    );
    expect(groups.a!.t).toEqual(['int', 'int', 'null']);
    expect(groups.b!.t).toEqual(['int', 'none']);
  });

  test('array::min and array::max skip NONE and null; a group with no value gives NONE', async () => {
    const groups = await byKey(
      `SELECT cat AS k, array::min(price) AS lo, array::max(price) AS hi, type::of(array::min(amt)) AS none
       FROM item GROUP BY k;`,
    );
    expect([groups.a!.lo, groups.a!.hi]).toEqual([10, 30]);
    expect([groups.b!.lo, groups.b!.hi]).toEqual([0, 0]);
    expect(groups.c!.none).toBe('none');
  });

  test('array::min and array::max order strings, datetimes, bools, decimals and durations', async () => {
    const [row] = (await ok(
      `SELECT array::min(cat) AS s0, array::max(cat) AS s1, array::min(at) AS t0, array::max(at) AS t1,
       array::min(ok) AS b0, array::max(ok) AS b1, array::min(amt) AS m0, array::max(amt) AS m1,
       array::min(d) AS d0, array::max(d) AS d1 FROM item GROUP ALL;`,
    )) as Row[];
    expect(row).toEqual({
      s0: 'a',
      s1: 'c',
      t0: '2024-01-01T00:00:00Z',
      t1: '2025-01-01T00:00:00Z',
      b0: false,
      b1: true,
      m0: '1.1',
      m1: '2.2',
      d0: '30m',
      d1: '1h',
    });
  });

  test('on an array field array::group flattens one level, while array::min and array::max compare whole arrays', async () => {
    const [row] = (await ok(
      'SELECT array::group(tags) AS g, array::min(tags) AS lo, array::max(tags) AS hi FROM item GROUP ALL;',
    )) as Row[];
    expect(row).toEqual({ g: ['x', 'y', 'z'], lo: [], hi: ['z'] });
  });

  test('a bare field that is not a key collects every value of the group, duplicates and absences kept', async () => {
    const groups = await byKey('SELECT cat AS k, price FROM item GROUP BY k;');
    expect(groups.a!.price).toEqual([10, 30, null, 10]);
  });
});

describe('group keys', () => {
  test('NONE and null are separate groups, and groups come back sorted by key with NONE first', async () => {
    const rows = (await ok('SELECT price, type::of(price) AS t, count() AS n FROM item GROUP BY price;')) as Row[];
    expect(rows.map((r) => [(r.t as string[])[0], r.n])).toEqual([
      ['none', 1],
      ['null', 1],
      ['int', 1],
      ['int', 1],
      ['int', 1],
      ['int', 1],
      ['int', 1],
      ['int', 2],
      ['int', 1],
    ]);
    expect(rows.slice(2).map((r) => r.price)).toEqual([0, 1, 2, 3, 7, 10, 30]);
  });

  test('an object sub-key groups as a path, which comes back nested, or through an alias', async () => {
    const nested = (await ok('SELECT addr.city, count() AS n FROM item GROUP BY addr.city;')) as Row[];
    expect(nested).toEqual([
      { addr: { city: null }, n: 7 },
      { addr: { city: 'Bergen' }, n: 1 },
      { addr: { city: 'Oslo' }, n: 2 },
    ]);

    const aliased = await byKey('SELECT addr.city AS k, count() AS n FROM item GROUP BY k;');
    expect(aliased.Oslo!.n).toBe(2);
  });

  test('a backtick-quoted sub-key of a flexible object groups like a declared one', async () => {
    const groups = await byKey('SELECT flex.`a-b` AS k, count() AS n FROM item GROUP BY k;');
    expect([groups['1']!.n, groups['2']!.n, groups.null!.n]).toEqual([1, 1, 8]);
  });

  test('a record link groups by the link, and a path through the link groups by the linked value', async () => {
    const byLink = await byKey(
      'SELECT author AS k, count() AS n, array::group(author.name) AS names FROM item GROUP BY k;',
    );
    expect(byLink['author:1']).toEqual({ k: 'author:1', n: 2, names: ['Mia'] });
    expect(byLink['author:2']!.n).toBe(2);
    expect(byLink.null!.n).toBe(6);

    const through = (await ok('SELECT author.name, count() AS n FROM item GROUP BY author.name;')) as Row[];
    expect(through).toEqual([
      { author: { name: null }, n: 6 },
      { author: { name: 'Abe' }, n: 2 },
      { author: { name: 'Mia' }, n: 2 },
    ]);
  });

  test('several keys group by their combination', async () => {
    const rows = (await ok("SELECT cat, ok, count() AS n FROM item WHERE cat = 'a' GROUP BY cat, ok;")) as Row[];
    expect(rows).toEqual([
      { cat: 'a', ok: null, n: 2 },
      { cat: 'a', ok: false, n: 1 },
      { cat: 'a', ok: true, n: 1 },
    ]);
  });

  test('an array field groups by the whole array, not by its elements', async () => {
    const rows = (await ok('SELECT tags, count() AS n FROM item GROUP BY tags;')) as Row[];
    expect(rows).toEqual([
      { tags: [], n: 7 },
      { tags: ['x', 'y'], n: 1 },
      { tags: ['y'], n: 1 },
      { tags: ['z'], n: 1 },
    ]);
  });
});

describe('count and the math aggregates', () => {
  test('count(field) counts truthy values, so 0 and false are missed; a NONE-and-NULL test counts present values', async () => {
    const groups = await byKey(
      `SELECT cat AS k, count(price) AS truthy, count(price != NONE AND price != NULL) AS present, count(ok) AS bools
       FROM item GROUP BY k;`,
    );
    expect(groups.a).toMatchObject({ truthy: 3, present: 3 });
    expect(groups.b).toMatchObject({ truthy: 0, present: 1, bools: 0 });
  });

  test('math::sum and math::mean skip NONE and null; mean is always a float', async () => {
    const groups = await byKey(
      'SELECT cat AS k, math::sum(price) AS s, math::mean(price) AS m, type::of(math::mean(price)) AS t FROM item GROUP BY k;',
    );
    expect(groups.a).toMatchObject({ s: 50, m: 50 / 3, t: 'float' });
    expect(groups.c).toMatchObject({ s: 6, m: 2, t: 'float' });
  });

  test('a decimal sum stays decimal but its mean is a float; sum divided by the present count stays decimal', async () => {
    const groups = await byKey(
      `SELECT cat AS k, type::of(math::sum(amt)) AS st, type::of(math::mean(amt)) AS mt,
       math::sum(amt) / count(amt != NONE AND amt != NULL) AS avg,
       type::of(math::sum(amt) / count(amt != NONE AND amt != NULL)) AS at FROM item GROUP BY k;`,
    );
    expect(groups.a).toMatchObject({ st: 'decimal', mt: 'float', avg: '1.650', at: 'decimal' });
  });

  test('over no values math::sum is int 0 and math::mean is NaN', async () => {
    const groups = await byKey(
      'SELECT cat AS k, type::of(math::sum(amt)) AS st, <string> math::mean(amt) AS m FROM item GROUP BY k;',
    );
    expect(groups.c).toMatchObject({ st: 'int', m: 'NaN' });
  });

  test('math aggregates over strings and durations are not refused: they answer 0 or an infinity', async () => {
    const [row] = (await ok(
      `SELECT math::sum(cat) AS s, <string> math::min(cat) AS mn, <string> math::max(cat) AS mx, math::sum(d) AS ds
       FROM item WHERE cat = 'a' GROUP ALL;`,
    )) as Row[];
    expect(row).toEqual({ s: 0, mn: 'Infinity', mx: '-Infinity', ds: 0 });
  });

  test('a nested aggregate is refused', async () => {
    const message = 'Invalid query: Nested aggregate functions are not supported';
    expect(await refused('SELECT cat, math::sum(array::group(price)) AS x FROM item GROUP BY cat;')).toBe(message);
    expect(await refused('SELECT cat, count(count()) AS x FROM item GROUP BY cat;')).toBe(message);
    expect(await refused('SELECT cat, array::min(math::max(price)) AS x FROM item GROUP BY cat;')).toBe(message);
  });

  test('a plain function around an aggregate is not nesting and runs', async () => {
    const groups = await byKey('SELECT cat AS k, array::len(array::group(price)) AS x FROM item GROUP BY k;');
    expect(groups.a!.x).toBe(3);
  });
});

describe('shaping, filtering and paging the groups', () => {
  test('a dotted alias builds the nested result object on the server', async () => {
    const groups = await byKey(
      `SELECT cat AS k, count() AS _count._all, array::min(price) AS _min.price, array::max(price) AS _max.price
       FROM item GROUP BY k;`,
    );
    expect(groups.a).toEqual({ k: 'a', _count: { _all: 4 }, _min: { price: 10 }, _max: { price: 30 } });
  });

  test('an aggregate alias equal to a group key breaks the server instead of being refused cleanly', async () => {
    expect(await refused('SELECT cat, count() AS cat FROM item GROUP BY cat;')).toBe(
      'Internal database error: IR invariant broken: expr.agg outside the grouping that answers it',
    );
  });

  test('there is no HAVING: it is a parse error', async () => {
    expect(await refused('SELECT cat, count() AS n FROM item GROUP BY cat HAVING n > 1;')).toContain('Parse error');
  });

  test('an outer SELECT over the grouped subquery filters groups with a bound value', async () => {
    const rows = (await ok(
      `LET $min = 2;
       SELECT * FROM (SELECT cat, count() AS _count._all FROM item GROUP BY cat) WHERE _count._all >= $min
       ORDER BY _count._all ASC;`,
    )) as Row[];
    expect(rows.map((r) => r.cat)).toEqual(['b', 'c', 'a']);
  });

  test('ORDER BY an aggregate alias, LIMIT and START apply to groups, and all of them take bound values', async () => {
    const rows = (await ok(
      `LET $p = 6; LET $l = 2; LET $s = 1;
       SELECT cat, count() AS n, count(price > $p) AS big FROM item WHERE cat != NONE
       GROUP BY cat ORDER BY n DESC, cat ASC LIMIT $l START $s;`,
    )) as Row[];
    expect(rows).toEqual([
      { cat: 'c', n: 3, big: 0 },
      { cat: 'b', n: 2, big: 0 },
    ]);
  });

  test('over no rows GROUP ALL answers one row (count 0, min NONE, group []) and GROUP BY answers none', async () => {
    const all = (await ok(
      "SELECT count() AS n, type::of(array::min(price)) AS lo, array::group(price) AS g FROM item WHERE cat = 'zz' GROUP ALL;",
    )) as Row[];
    expect(all).toEqual([{ n: 0, lo: 'none', g: [] }]);
    expect(await ok("SELECT cat, count() AS n FROM item WHERE cat = 'zz' GROUP BY cat;")).toEqual([]);
  });
});

describe('over the SDK', () => {
  let surreal: Surreal;

  beforeAll(async () => {
    surreal = new Surreal();
    await surreal.connect('ws://127.0.0.1:8000/rpc');
    await surreal.signin({ username: 'root', password: 'root' });
    await surreal.use({ namespace: 'main', database: db.name });
  });

  afterAll(async () => {
    await surreal.close();
  });

  test('a NONE key arrives as undefined and a null key as null, both present on the row', async () => {
    const [rows] = await surreal.query<[Row[]]>('SELECT price, count() AS n FROM item GROUP BY price;').collect();
    expect(rows.slice(0, 2).map((r) => ['price' in r, r.price])).toEqual([
      [true, undefined],
      [true, null],
    ]);
  });

  test('a decimal sum arrives as a Decimal, an empty one as the number 0, and an empty mean as NaN', async () => {
    const [rows] = await surreal
      .query<[Row[]]>(
        "SELECT cat, math::sum(amt) AS s, math::mean(amt) AS m FROM item WHERE cat IN ['a', 'c'] GROUP BY cat;",
      )
      .collect();
    const [a, c] = rows;
    expect(String(a!.s)).toBe('3.3');
    expect(typeof a!.s).toBe('object');
    expect(c!.s).toBe(0);
    expect(Number.isNaN(c!.m)).toBe(true);
  });
});
