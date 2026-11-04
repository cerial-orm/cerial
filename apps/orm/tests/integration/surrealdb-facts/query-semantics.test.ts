/**
 * Facts about query semantics the ORM's builders rest on, measured on SurrealDB 4.0.0:
 * relation ORDER BY, the `none` quantifier, sets, decimal comparison, array ranges,
 * the tuple reconstruction `unset` emits, CONTAINS forms and the default read order.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

let db: ScratchDatabase;

/** Runs the text and returns its last statement's result; throws when that statement errors. */
async function ok(surql: string): Promise<unknown> {
  const results = await run(db, surql);
  const last = results[results.length - 1]!;
  if (last.status !== 'OK') throw new Error(`${surql} -> ${JSON.stringify(last)}`);

  return last.result;
}

/** Runs one statement expected to be refused and returns the server's message. */
async function refused(surql: string): Promise<string> {
  const results = await run(db, surql).catch((e: Error) => [{ status: 'ERR', result: e.message }]);
  const last = results[results.length - 1]!;
  expect(last.status).toBe('ERR');

  return String(last.result);
}

const column = (rows: unknown, key: string): unknown[] => (rows as Record<string, unknown>[]).map((r) => r[key]);

beforeAll(async () => {
  db = await withScratchDatabase('query_semantics');
});

afterAll(async () => {
  await db.remove();
});

describe('relation ORDER BY', () => {
  beforeAll(async () => {
    const results = await run(
      db,
      `DEFINE TABLE country SCHEMAFULL; DEFINE FIELD name ON country TYPE string;
       DEFINE TABLE author SCHEMAFULL; DEFINE FIELD name ON author TYPE string;
       DEFINE FIELD country ON author TYPE option<record<country>>;
       DEFINE TABLE post SCHEMAFULL; DEFINE FIELD title ON post TYPE string;
       DEFINE FIELD author ON post TYPE option<record<author>>;
       CREATE country:a SET name = 'Zed'; CREATE country:b SET name = 'Alpha';
       CREATE author:1 SET name = 'Mia', country = country:a;
       CREATE author:2 SET name = 'Abe', country = country:b;
       CREATE author:3 SET name = 'Zoe';
       CREATE post:1 SET title = 'p1', author = author:1;
       CREATE post:2 SET title = 'p2', author = author:2;
       CREATE post:3 SET title = 'p3', author = author:3;
       CREATE post:4 SET title = 'p4';`,
    );
    expect(results.every((r) => r.status === 'OK')).toBe(true);
  });

  test('the alias form sorts by the linked field, ascending and descending', async () => {
    const asc = await ok('SELECT * OMIT o FROM (SELECT *, author.name AS o FROM post ORDER BY o ASC);');
    expect(column(asc, 'title')).toEqual(['p4', 'p2', 'p1', 'p3']);

    const desc = await ok('SELECT * OMIT o FROM (SELECT *, author.name AS o FROM post ORDER BY o DESC);');
    expect(column(desc, 'title')).toEqual(['p3', 'p1', 'p2', 'p4']);
  });

  test('OMIT drops the alias from the outer rows', async () => {
    const rows = (await ok('SELECT * OMIT o FROM (SELECT *, author.name AS o FROM post ORDER BY o ASC);')) as object[];
    for (const row of rows) expect('o' in row).toBe(false);
  });

  test('dot notation in ORDER BY still does not sort: insertion order comes back, ascending or descending', async () => {
    const asc = await ok('SELECT title FROM post ORDER BY author.name ASC;');
    const desc = await ok('SELECT title FROM post ORDER BY author.name DESC;');
    expect(column(asc, 'title')).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(column(desc, 'title')).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  test('a chained link projects through the alias and still sorts', async () => {
    const asc = await ok('SELECT * OMIT o FROM (SELECT *, author.country.name AS o FROM post ORDER BY o ASC);');
    expect(column(asc, 'title')).toEqual(['p3', 'p4', 'p2', 'p1']);
  });

  test('a chained link in dot notation does not sort', async () => {
    const asc = await ok('SELECT title FROM post ORDER BY author.country.name ASC;');
    expect(column(asc, 'title')).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  test('unset and null links sort first ascending and last descending', async () => {
    const asc = column(
      await ok('SELECT * OMIT o FROM (SELECT *, author.name AS o FROM post ORDER BY o ASC);'),
      'title',
    );
    const desc = column(
      await ok('SELECT * OMIT o FROM (SELECT *, author.name AS o FROM post ORDER BY o DESC);'),
      'title',
    );
    expect(asc[0]).toBe('p4');
    expect(desc[desc.length - 1]).toBe('p4');
  });

  test('LIMIT and START on the inner query page along the sorted order', async () => {
    const page = await ok(
      'SELECT * OMIT o FROM (SELECT *, author.name AS o FROM post ORDER BY o DESC LIMIT 2 START 1);',
    );
    expect(column(page, 'title')).toEqual(['p1', 'p2']);
  });

  test('ordering by an alias selected from a link works outside a subquery too', async () => {
    const rows = await ok('SELECT title, author.name AS n FROM post ORDER BY n DESC;');
    expect(column(rows, 'title')).toEqual(['p3', 'p1', 'p2', 'p4']);
  });

  test('an object sub-field sorts in plain dot notation with no alias', async () => {
    await ok(
      `DEFINE TABLE o SCHEMAFULL; DEFINE FIELD addr ON o TYPE object; DEFINE FIELD addr.city ON o TYPE string;
       CREATE o:1 SET addr = { city: 'b' }; CREATE o:2 SET addr = { city: 'a' };`,
    );
    expect(await ok('SELECT VALUE id FROM o ORDER BY addr.city;')).toEqual(['o:2', 'o:1']);
  });
});

describe('none quantifier on an array of objects', () => {
  beforeAll(async () => {
    await run(
      db,
      `DEFINE TABLE a SCHEMAFULL; DEFINE FIELD arr ON a TYPE array<object>; DEFINE FIELD arr.*.k ON a TYPE string;
       CREATE a:1 SET arr = [{ k: 'x' }, { k: 'y' }]; CREATE a:2 SET arr = [{ k: 'y' }]; CREATE a:3 SET arr = [];`,
    );
  });

  test('!(arr.any(|$v| ...)) keeps rows with no match, including the empty array', async () => {
    expect(await ok("SELECT VALUE id FROM a WHERE !(arr.any(|$v| $v.k = 'x')) ORDER BY id;")).toEqual(['a:2', 'a:3']);
  });

  test('it keeps every row when nothing matches', async () => {
    expect(await ok("SELECT VALUE id FROM a WHERE !(arr.any(|$v| $v.k = 'q')) ORDER BY id;")).toEqual([
      'a:1',
      'a:2',
      'a:3',
    ]);
  });

  test('some and every use the same closure form', async () => {
    expect(await ok("SELECT VALUE id FROM a WHERE arr.any(|$v| $v.k = 'x') ORDER BY id;")).toEqual(['a:1']);
    expect(await ok("SELECT VALUE id FROM a WHERE arr.all(|$v| $v.k = 'y') ORDER BY id;")).toEqual(['a:2', 'a:3']);
  });

  test('there is no arr.none() method to use instead', async () => {
    const message = await refused("SELECT id FROM a WHERE arr.none(|$v| $v.k = 'x');");
    expect(message).toContain('no such method found for the array type');
  });
});

describe('sets', () => {
  beforeAll(async () => {
    await run(
      db,
      'DEFINE TABLE s SCHEMAFULL; DEFINE FIELD v ON s TYPE set<string>; DEFINE FIELD n ON s TYPE set<int>;',
    );
  });

  test('a plain array is now coerced into a set on CREATE, with no <set> cast', async () => {
    const [row] = (await ok("CREATE s:plain SET v = ['a', 'b', 'a'], n = [1, 2, 2];")) as Record<string, unknown>[];
    expect(row!.v).toEqual(['a', 'b']);
    expect(row!.n).toEqual([1, 2]);
    expect(await ok('RETURN type::of((SELECT VALUE v FROM ONLY s:plain));')).toBe('set');
  });

  test('a plain array is coerced on UPDATE too, and the <set> cast gives the same result', async () => {
    const [plain] = (await ok("UPDATE s:plain SET v = ['x', 'x'];")) as Record<string, unknown>[];
    expect(plain!.v).toEqual(['x']);

    const [cast] = (await ok("UPDATE s:plain SET v = <set>['x', 'x'];")) as Record<string, unknown>[];
    expect(cast!.v).toEqual(['x']);
  });

  test('+= adds one member and ignores a duplicate', async () => {
    await ok("CREATE s:append SET v = ['a'], n = [1];");
    const [first] = (await ok("UPDATE s:append SET v += 'b', n += 2;")) as Record<string, unknown>[];
    expect(first!.v).toEqual(['a', 'b']);

    const [again] = (await ok("UPDATE s:append SET v += 'b', n += 2;")) as Record<string, unknown>[];
    expect(again!.v).toEqual(['a', 'b']);
    expect(again!.n).toEqual([1, 2]);
  });

  test('a member of the wrong type is still refused', async () => {
    const message = await refused("CREATE s:bad SET v = ['a'], n = ['one'];");
    expect(message).toContain('n');
  });

  test('set<decimal> works: create, += and replace', async () => {
    await ok('DEFINE TABLE sd SCHEMAFULL; DEFINE FIELD d ON sd TYPE set<decimal>;');
    const [created] = (await ok('CREATE sd:1 SET d = <set>[1.5dec, 2.5dec, 1.5dec];')) as Record<string, unknown>[];
    expect(created!.d).toEqual(['1.5', '2.5']);

    const [appended] = (await ok('UPDATE sd:1 SET d += 3.5dec;')) as Record<string, unknown>[];
    expect(appended!.d).toEqual(['1.5', '2.5', '3.5']);

    const [replaced] = (await ok('UPDATE sd:1 SET d = <set>[1dec];')) as Record<string, unknown>[];
    expect(replaced!.d).toEqual(['1']);
  });

  test('set<decimal> from a plain array of decimals needs no cast either', async () => {
    const [row] = (await ok('CREATE sd:2 SET d = [<decimal>1.5, <decimal>1.5];')) as Record<string, unknown>[];
    expect(row!.d).toEqual(['1.5']);
  });

  test('a decimal array without set keeps duplicates', async () => {
    await ok('DEFINE TABLE ad SCHEMAFULL; DEFINE FIELD d ON ad TYPE array<decimal>;');
    const [row] = (await ok('CREATE ad:1 SET d = [1.5dec, 1.5dec];')) as Record<string, unknown>[];
    expect(row!.d).toEqual(['1.5', '1.5']);
  });
});

describe('decimal comparison', () => {
  beforeAll(async () => {
    const results = await run(
      db,
      `DEFINE TABLE m SCHEMAFULL; DEFINE FIELD d ON m TYPE decimal; DEFINE FIELD ds ON m TYPE array<decimal>;
       CREATE m:1 SET d = 0.1dec, ds = [0.1dec, 0.2dec]; CREATE m:2 SET d = 5dec, ds = [5dec];`,
    );
    expect(results.every((r) => r.status === 'OK')).toBe(true);
  });

  test('a float literal does not equal the same decimal literal; decimal, int and cast forms do', async () => {
    expect(await ok('RETURN 0.1f = 0.1dec;')).toBe(false);
    expect(await ok('RETURN 0.1f == 0.1dec;')).toBe(false);
    expect(await ok('RETURN 0.1dec = 0.1dec;')).toBe(true);
    expect(await ok('RETURN <decimal>0.1 = 0.1dec;')).toBe(true);
    expect(await ok('RETURN 1 = 1dec;')).toBe(true);
  });

  test('a float that is exact in binary still equals its decimal', async () => {
    expect(await ok('RETURN 0.5f = 0.5dec;')).toBe(true);
    expect(await ok('RETURN 1f = 1dec;')).toBe(true);
  });

  test('ordering between a float and a decimal still works', async () => {
    expect(await ok('RETURN [0.1f < 0.2dec, 0.3f > 0.2dec, 0.1dec < 0.2f];')).toEqual([true, true, true]);
  });

  test('a decimal field matches an int param and a <decimal> param but not a float param', async () => {
    const [byFloat, byInt, byCast, byDecimal, byCastFloat] = (await ok(
      `LET $f = 0.1f; LET $i = 5; LET $dc = <decimal>0.1; LET $dd = 0.1dec;
       RETURN [
         (SELECT VALUE id FROM m WHERE d = $f), (SELECT VALUE id FROM m WHERE d = $i),
         (SELECT VALUE id FROM m WHERE d = $dc), (SELECT VALUE id FROM m WHERE d = $dd),
         (SELECT VALUE id FROM m WHERE d = <decimal>$f)
       ];`,
    )) as string[][];
    expect(byFloat).toEqual([]);
    expect(byInt).toEqual(['m:2']);
    expect(byCast).toEqual(['m:1']);
    expect(byDecimal).toEqual(['m:1']);
    expect(byCastFloat).toEqual(['m:1']);
  });

  test('IN and CONTAINS follow the same rule: float misses, <decimal> hits', async () => {
    const result = await ok(
      `LET $f = 0.1f; LET $dc = <decimal>0.1;
       RETURN [
         (SELECT VALUE id FROM m WHERE ds CONTAINS $f), (SELECT VALUE id FROM m WHERE ds CONTAINS $dc),
         (SELECT VALUE id FROM m WHERE d IN [$f]), (SELECT VALUE id FROM m WHERE d IN [$dc])
       ];`,
    );
    expect(result).toEqual([[], ['m:1'], [], ['m:1']]);
  });

  test('range comparisons against an int param are by value', async () => {
    const result = await ok(
      'LET $i = 5; RETURN [(SELECT VALUE id FROM m WHERE d >= $i), (SELECT VALUE id FROM m WHERE d < $i)];',
    );
    expect(result).toEqual([['m:2'], ['m:1']]);
  });

  test('writing a float into a decimal field stores the decimal, so the stored value is readable by the cast form', async () => {
    const results = await run(
      db,
      'LET $f = 0.1f; CREATE m:3 SET d = $f, ds = [$f]; SELECT d, type::of(d) AS t FROM m:3;',
    );
    expect(results[1]!.result).toEqual([{ d: '0.1', ds: ['0.1'], id: 'm:3' }]);
    expect(results[2]!.result).toEqual([{ d: '0.1', t: 'decimal' }]);
  });

  test('a decimal literal of 28 places parses and 29 places is refused', async () => {
    expect(await ok('RETURN 1.1234567890123456789012345678dec;')).toBe('1.1234567890123456789012345678');
    const message = await refused('RETURN 1.12345678901234567890123456789dec;');
    expect(message).toContain('Scale exceeds the maximum');
  });

  test('a <decimal> cast of a 29-place string rounds instead of refusing', async () => {
    expect(await ok('RETURN <decimal>"1.12345678901234567890123456789";')).toBe('1.1234567890123456789012345679');
  });
});

describe('array ranges and slices', () => {
  test('a range inside the array returns its members', async () => {
    expect(await ok('RETURN [1, 2, 3][1..];')).toEqual([2, 3]);
    expect(await ok('RETURN [1, 2, 3][..2];')).toEqual([1, 2]);
    expect(await ok('RETURN [1, 2, 3][1..=1];')).toEqual([2]);
  });

  test('a range past the end is clamped, and one wholly past the end is empty', async () => {
    expect(await ok('RETURN [1, 2, 3][0..5];')).toEqual([1, 2, 3]);
    expect(await ok('RETURN [1, 2, 3][5..9];')).toEqual([]);
    expect(await ok('RETURN [1, 2, 3][3..];')).toEqual([]);
  });

  test('a reversed range and a negative start give NONE rather than an error or a tail', async () => {
    expect(await ok('RETURN [1, 2, 3][2..1];')).toBeNull();
    expect(await ok('RETURN [1, 2, 3][-2..];')).toBeNull();
  });

  test('array::slice clamps the same way', async () => {
    expect(await ok('RETURN array::slice([1, 2, 3], 1, 5);')).toEqual([2, 3]);
    expect(await ok('RETURN array::slice([1, 2, 3], 5);')).toEqual([]);
  });
});

describe('tuple reconstruction that unset emits', () => {
  beforeAll(async () => {
    await run(
      db,
      `DEFINE TABLE tp SCHEMAFULL;
       DEFINE FIELD t ON tp TYPE option<[int, option<int>, int]>;
       DEFINE FIELD u ON tp TYPE option<[int, int | null, int]>;
       CREATE tp:1 SET t = [1, 2, 3], u = [1, 2, 3];`,
    );
  });

  test('a nullable element is cleared with NULL and the others are kept', async () => {
    const [row] = (await ok('UPDATE tp:1 SET u = [$this.u[0], NULL, $this.u[2]];')) as Record<string, unknown>[];
    expect(row!.u).toEqual([1, null, 3]);
  });

  test('NONE is refused for a nullable (non-optional) element', async () => {
    const message = await refused('UPDATE tp:1 SET u = [$this.u[0], NONE, $this.u[2]];');
    expect(message).toContain("Couldn't coerce value for field `u`");
  });

  test('an optional element given NONE is read back as null, never as an absent position', async () => {
    const [row] = (await ok('UPDATE tp:1 SET t = [$this.t[0], NONE, $this.t[2]];')) as Record<string, unknown>[];
    expect(row!.t).toEqual([1, null, 3]);
  });
});

describe('CONTAINS forms', () => {
  beforeAll(async () => {
    const results = await run(
      db,
      `DEFINE TABLE c SCHEMAFULL; DEFINE FIELD s ON c TYPE string;
       DEFINE FIELD tags ON c TYPE array<string>; DEFINE FIELD ids ON c TYPE array<int>;
       CREATE c:1 SET s = 'hello', tags = ['a', 'b'], ids = [1, 2];
       CREATE c:2 SET s = 'world', tags = [], ids = [3];`,
    );
    expect(results.every((r) => r.status === 'OK')).toBe(true);
  });

  const ids = (where: string) => ok(`SELECT VALUE id FROM c WHERE ${where} ORDER BY id;`);

  test('CONTAINS on a string is a substring test', async () => {
    expect(await ids("s CONTAINS 'ell'")).toEqual(['c:1']);
    expect(await ids("s CONTAINS 'zz'")).toEqual([]);
  });

  test('CONTAINS on a string with a non-string operand matches nothing and does not error', async () => {
    expect(await ids('s CONTAINS 5')).toEqual([]);
  });

  test('CONTAINSALL and CONTAINSANY on a string test each substring', async () => {
    expect(await ids("s CONTAINSALL ['e', 'l']")).toEqual(['c:1']);
    expect(await ids("s CONTAINSANY ['z', 'w']")).toEqual(['c:2']);
  });

  test('has: CONTAINS on an array of strings and of ints', async () => {
    expect(await ids("tags CONTAINS 'a'")).toEqual(['c:1']);
    expect(await ids("tags CONTAINS 'q'")).toEqual([]);
    expect(await ids('ids CONTAINS 3')).toEqual(['c:2']);
  });

  test('hasAll: CONTAINSALL needs every value', async () => {
    expect(await ids("tags CONTAINSALL ['a', 'b']")).toEqual(['c:1']);
    expect(await ids("tags CONTAINSALL ['a', 'z']")).toEqual([]);
    expect(await ids('ids CONTAINSALL [1, 2]')).toEqual(['c:1']);
  });

  test('hasAny: CONTAINSANY needs one value', async () => {
    expect(await ids("tags CONTAINSANY ['b', 'z']")).toEqual(['c:1']);
    expect(await ids("tags CONTAINSANY ['y', 'z']")).toEqual([]);
    expect(await ids('ids CONTAINSANY [2, 3]')).toEqual(['c:1', 'c:2']);
  });

  test('an empty operand: CONTAINSALL [] matches every row and CONTAINSANY [] none', async () => {
    expect(await ids('tags CONTAINSALL []')).toEqual(['c:1', 'c:2']);
    expect(await ids('tags CONTAINSANY []')).toEqual([]);
  });

  test('the same answers hold with an index on the array field', async () => {
    await ok('DEFINE INDEX ti ON c FIELDS tags; DEFINE INDEX ii ON c FIELDS ids;');
    expect(await ids("tags CONTAINS 'a'")).toEqual(['c:1']);
    expect(await ids("tags CONTAINSALL ['a', 'b']")).toEqual(['c:1']);
    expect(await ids("tags CONTAINSANY ['b', 'z']")).toEqual(['c:1']);
    expect(await ids('ids CONTAINSANY [2, 3]')).toEqual(['c:1', 'c:2']);
  });

  test('isEmpty: array::len is 0 only for the empty array', async () => {
    expect(await ids('array::len(tags) = 0')).toEqual(['c:2']);
    expect(await ids('array::len(tags) > 0')).toEqual(['c:1']);
  });
});

describe('read order with no ORDER BY', () => {
  const ROWS = 12000;
  const N = (rows: unknown) => column(rows, 'n') as number[];

  beforeAll(async () => {
    // Ids run opposite to insertion order, so key order and insertion order are told apart.
    const results = await run(
      db,
      `DEFINE TABLE big SCHEMAFULL; DEFINE FIELD n ON big TYPE int; DEFINE FIELD g ON big TYPE int;
       FOR $i IN 0..${ROWS} { CREATE type::record('big', 100000 - $i) SET n = $i, g = $i % 7; };`,
    );
    expect(results[0]!.status).toBe('OK');
  }, 60_000);

  test('rows come back in record-id key order, not insertion order, across many rows', async () => {
    const ns = N(await ok('SELECT n FROM big;'));
    expect(ns).toHaveLength(ROWS);
    expect(ns[0]).toBe(ROWS - 1);
    expect(ns.every((v, i) => i === 0 || v < ns[i - 1]!)).toBe(true);
  });

  test('the order is the same on every read', async () => {
    const first = N(await ok('SELECT n FROM big;'));
    for (let i = 0; i < 3; i++) expect(N(await ok('SELECT n FROM big;'))).toEqual(first);
  });

  test('LIMIT and START take a window of that same order', async () => {
    const all = N(await ok('SELECT n FROM big;'));
    expect(N(await ok('SELECT n FROM big LIMIT 10;'))).toEqual(all.slice(0, 10));
    expect(N(await ok('SELECT n FROM big LIMIT 10 START 6000;'))).toEqual(all.slice(6000, 6010));
  });

  test('WHERE keeps the order, and LIMIT 1 returns its first match', async () => {
    const all = N(await ok('SELECT n FROM big;'));
    const matches = all.filter((n) => n % 7 === 3);
    expect(N(await ok('SELECT n FROM big WHERE g = 3;'))).toEqual(matches);
    for (let i = 0; i < 3; i++) expect(N(await ok('SELECT n FROM big WHERE g = 3 LIMIT 1;'))).toEqual([matches[0]!]);
  });

  test('an explicit ORDER BY overrides the key order', async () => {
    const ns = N(await ok('SELECT n FROM big ORDER BY n LIMIT 3;'));
    expect(ns).toEqual([0, 1, 2]);
  });
});
