/**
 * Facts about tuple and literal types: how members are converted, what an absent position
 * holds, which tuple element definitions the server accepts, and the optional-tuple plus
 * optional-object initialisation Cerial once worked around. Measured on SurrealDB 4.0.0.
 *
 * The /sql JSON renders NONE as null, so a position's real type is read with `type::of`.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const databases: ScratchDatabase[] = [];

async function scratch(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  databases.push(db);

  return db;
}

afterAll(async () => {
  await Promise.all(databases.map((db) => db.remove()));
});

/** Runs one statement and returns its result, asserting only that it was OK. */
async function ok(db: ScratchDatabase, surql: string): Promise<unknown> {
  const [r] = await run(db, surql);
  expect(r!.status).toBe('OK');

  return r!.result;
}

/** Runs one statement and returns the error text, asserting it failed. */
async function err(db: ScratchDatabase, surql: string): Promise<string> {
  const [r] = await run(db, surql);
  expect(r!.status).toBe('ERR');

  return String(r!.result);
}

/** Reads one expression from a record as its `type::of` name. */
async function typeOf(db: ScratchDatabase, expr: string, record: string): Promise<unknown> {
  const rows = (await ok(db, `SELECT type::of(${expr}) AS t FROM ${record};`)) as { t: string }[];

  return rows[0]!.t;
}

const NOT_HELD = 'has a type that cannot hold it';

describe('tuple type members are converted, not only checked', () => {
  const DEFINE = `DEFINE TABLE a SCHEMAFULL;
    DEFINE FIELD p ON a TYPE [int, float];`;

  test('a whole float in an int position is stored as an int', async () => {
    const db = await scratch('tup_conv');
    await ok(db, DEFINE);

    expect(await ok(db, 'CREATE a:1 SET p = [1.0, 2];')).toEqual([{ id: 'a:1', p: [1, 2] }]);
    expect(await typeOf(db, 'p[0]', 'a:1')).toBe('int');
  });

  test('an int in a float position is stored as a float', async () => {
    const db = await scratch('tup_conv_float');
    await ok(db, DEFINE);
    await ok(db, 'CREATE a:1 SET p = [1, 2];');

    expect(await typeOf(db, 'p[1]', 'a:1')).toBe('float');
  });

  test('a fractional float in an int position is refused', async () => {
    const db = await scratch('tup_conv_neg');
    await ok(db, DEFINE);

    expect(await err(db, 'CREATE a:1 SET p = [1.5, 2];')).toContain('Expected `[int, float]` but found `[1.5f, 2]`');
  });

  test('an UPDATE converts a whole float in an element write the same way', async () => {
    const db = await scratch('tup_conv_update');
    await ok(db, DEFINE);
    await ok(db, 'CREATE a:1 SET p = [1, 2];');

    await ok(db, 'UPDATE a:1 SET p = [6.0, 7];');
    expect(await typeOf(db, 'p[0]', 'a:1')).toBe('int');
    expect(await err(db, 'UPDATE a:1 SET p = [6.5, 7];')).toContain('Expected `[int, float]`');
  });
});

describe('literal object and literal array types convert their members', () => {
  test('a whole float in an object-literal int member is stored as an int', async () => {
    const db = await scratch('lit_obj');
    await ok(db, 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD o ON a TYPE { a: int };');

    expect(await ok(db, 'CREATE a:1 SET o = { a: 1.0 };')).toEqual([{ id: 'a:1', o: { a: 1 } }]);
    expect(await typeOf(db, 'o.a', 'a:1')).toBe('int');
  });

  test('a fractional float in an object-literal int member is refused', async () => {
    const db = await scratch('lit_obj_neg');
    await ok(db, 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD o ON a TYPE { a: int };');

    expect(await err(db, 'CREATE a:1 SET o = { a: 1.5 };')).toContain('Expected `{ a: int }` but found `{ a: 1.5f }`');
  });

  test('a whole float in a one-member array literal is stored as an int, a fractional one is refused', async () => {
    const db = await scratch('lit_arr');
    await ok(db, 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD l ON a TYPE [int] | string;');

    expect(await ok(db, 'CREATE a:1 SET l = [3.0];')).toEqual([{ id: 'a:1', l: [3] }]);
    expect(await typeOf(db, 'l[0]', 'a:1')).toBe('int');
    expect(await err(db, 'CREATE a:2 SET l = [3.5];')).toContain('Expected `[int] | string` but found `[3.5f]`');
  });

  test('a tuple nested in an object literal converts its members too', async () => {
    const db = await scratch('lit_nested');
    await ok(db, 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD n ON a TYPE { t: [int, float] };');

    expect(await ok(db, 'CREATE a:1 SET n = { t: [2.0, 3] };')).toEqual([{ id: 'a:1', n: { t: [2, 3] } }]);
    expect(await typeOf(db, 'n.t[0]', 'a:1')).toBe('int');
    expect(await err(db, 'CREATE a:2 SET n = { t: [2.5, 3] };')).toContain('Expected `{ t: [int, float] }`');
  });

  test('an optional int member converts a whole float, and refuses a fractional one', async () => {
    const db = await scratch('lit_opt_member');
    await ok(db, 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD o ON a TYPE { a: int, b: option<int> };');

    await ok(db, 'CREATE a:1 SET o = { a: 1, b: 2.0 };');
    expect(await typeOf(db, 'o.b', 'a:1')).toBe('int');
    expect(await err(db, 'CREATE a:2 SET o = { a: 1, b: 2.5 };')).toContain('Expected `{ a: int, b: none | int }`');
  });

  test('an int in a float | null member is stored as a float', async () => {
    const db = await scratch('lit_float_null');
    await ok(db, 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD o ON a TYPE { n: float | null };');
    await ok(db, 'CREATE a:1 SET o = { n: 3 };');

    expect(await typeOf(db, 'o.n', 'a:1')).toBe('float');
    expect(await err(db, "CREATE a:2 SET o = { n: 'x' };")).toContain('Expected `{ n: float | null }`');
  });
});

describe('literal shapes are enforced in full', () => {
  const DEFINE = `DEFINE TABLE a SCHEMAFULL;
    DEFINE FIELD v ON a TYPE { label: string, count: option<int>, n: float | null } | 'none';`;

  test('an optional key may be left out and a nullable key may hold null', async () => {
    const db = await scratch('lit_shape');
    await ok(db, DEFINE);

    expect(await ok(db, "CREATE a:1 SET v = { label: 'a', n: null };")).toEqual([
      { id: 'a:1', v: { label: 'a', n: null } },
    ]);
    expect(await ok(db, "CREATE a:2 SET v = { label: 'a', n: 3, count: 4 };")).toEqual([
      { id: 'a:2', v: { count: 4, label: 'a', n: 3 } },
    ]);
  });

  test('a missing required key is refused, including a nullable one', async () => {
    const db = await scratch('lit_shape_missing');
    await ok(db, DEFINE);

    expect(await err(db, "CREATE a:1 SET v = { label: 'a' };")).toContain(
      'Expected `{ count: none | int, label: string',
    );
    expect(await err(db, 'CREATE a:2 SET v = { count: 1, n: null };')).toContain('but found `{ count: 1, n: NULL }`');
  });

  test('an undeclared key is refused', async () => {
    const db = await scratch('lit_shape_extra');
    await ok(db, DEFINE);

    expect(await err(db, "CREATE a:1 SET v = { label: 'a', n: null, z: 1 };")).toContain('Expected `{ count: none');
  });

  test('a string variant of the union is accepted and any other string is refused', async () => {
    const db = await scratch('lit_union');
    await ok(db, DEFINE);

    expect(await ok(db, "CREATE a:1 SET v = 'none';")).toEqual([{ id: 'a:1', v: 'none' }]);
    expect(await err(db, "CREATE a:2 SET v = 'x';")).toContain("but found `'x'`");
  });

  test('a string-literal union and a tuple holding one accept their members only', async () => {
    const db = await scratch('lit_enum');
    await ok(
      db,
      "DEFINE TABLE m SCHEMAFULL; DEFINE FIELD e ON m TYPE 'a' | 'b'; DEFINE FIELD t ON m TYPE [int, 'x' | 'y'];",
    );

    expect(await ok(db, "CREATE m:1 SET e = 'a', t = [1.0, 'x'];")).toEqual([{ e: 'a', id: 'm:1', t: [1, 'x'] }]);
    expect(await err(db, "CREATE m:2 SET e = 'c', t = [1, 'x'];")).toContain("Expected `'a' | 'b'` but found `'c'`");
    expect(await err(db, "CREATE m:3 SET e = 'a', t = [1, 'z'];")).toContain("Expected `[int, 'x' | 'y']`");
  });
});

describe('tuple length and element types', () => {
  const DEFINE = 'DEFINE TABLE a SCHEMAFULL; DEFINE FIELD p ON a TYPE [int, float];';

  test('a value of exactly the declared length and element types is stored', async () => {
    const db = await scratch('tup_shape');
    await ok(db, DEFINE);

    expect(await ok(db, 'CREATE a:1 SET p = [1, 2.5];')).toEqual([{ id: 'a:1', p: [1, 2.5] }]);
  });

  test('a shorter tuple, a longer tuple and a wrong element type are each refused', async () => {
    const db = await scratch('tup_shape_neg');
    await ok(db, DEFINE);

    expect(await err(db, 'CREATE a:1 SET p = [1];')).toContain('Expected `[int, float]` but found `[1]`');
    expect(await err(db, 'CREATE a:2 SET p = [1, 2, 3];')).toContain('Expected `[int, float]` but found `[1, 2, 3]`');
    expect(await err(db, "CREATE a:3 SET p = ['x', 2];")).toContain("Expected `[int, float]` but found `['x', 2]`");
  });
});

describe('absent tuple positions', () => {
  const DEFINE = `DEFINE TABLE b SCHEMAFULL;
    DEFINE FIELD p ON b TYPE [int, option<float>];
    DEFINE FIELD n ON b TYPE [int, none | float];
    DEFINE FIELD q ON b TYPE [int, float | null];
    DEFINE FIELD pn ON b TYPE option<[int, float]>;`;

  test('an optional position set to NONE stays a position, reads as null on the wire and is NONE in the store', async () => {
    const db = await scratch('abs_none');
    await ok(db, DEFINE);

    expect(await ok(db, 'CREATE b:1 SET p = [1, NONE], n = [1, NONE], q = [1, null];')).toEqual([
      { id: 'b:1', n: [1, null], p: [1, null], q: [1, null] },
    ]);
    expect(await typeOf(db, 'p[1]', 'b:1')).toBe('none');
    expect(await typeOf(db, 'n[1]', 'b:1')).toBe('none');
    expect(await ok(db, 'SELECT VALUE array::len(p) FROM b:1;')).toEqual([2]);
  });

  test('a null position is a null in the store, and NONE is not told apart from it by `= NONE` only', async () => {
    const db = await scratch('abs_null');
    await ok(db, DEFINE);
    await ok(db, 'CREATE b:1 SET p = [1, NONE], n = [1, NONE], q = [1, null];');

    expect(await typeOf(db, 'q[1]', 'b:1')).toBe('null');
    expect(await ok(db, 'SELECT VALUE id FROM b WHERE p[1] = NONE;')).toEqual(['b:1']);
    expect(await ok(db, 'SELECT VALUE id FROM b WHERE p[1] = NULL;')).toEqual([]);
    expect(await ok(db, 'SELECT VALUE id FROM b WHERE q[1] IS NULL;')).toEqual(['b:1']);
    expect(await ok(db, 'SELECT VALUE id FROM b WHERE p[1] IS NULL;')).toEqual([]);
  });

  test('a position that is left out of the tuple is refused, even an optional one', async () => {
    const db = await scratch('abs_short');
    await ok(db, DEFINE);

    expect(await err(db, 'CREATE b:1 SET p = [1], n = [1, 2], q = [1, null];')).toContain(
      'Expected `[int, none | float]` but found `[1]`',
    );
  });

  test('NONE in a nullable-only position is refused', async () => {
    const db = await scratch('abs_nullable');
    await ok(db, DEFINE);

    expect(await err(db, 'CREATE b:1 SET p = [1, NONE], n = [1, NONE], q = [1, NONE];')).toContain(
      'Expected `[int, float | null]` but found `[1, NONE]`',
    );
  });

  test('an optional tuple that is not written is NONE and the row has no key for it', async () => {
    const db = await scratch('abs_whole');
    await ok(db, DEFINE);
    await ok(db, 'CREATE b:1 SET p = [1, NONE], n = [1, NONE], q = [1, null];');

    expect(await typeOf(db, 'pn', 'b:1')).toBe('none');
    expect(await ok(db, 'SELECT VALUE pn FROM b:1;')).toEqual([null]);
    expect(await ok(db, 'SELECT * OMIT p, n, q FROM b:1;')).toEqual([{ id: 'b:1' }]);
  });
});

describe('a DEFINE FIELD on a tuple element', () => {
  test('is refused for a plain tuple parent, with a default, a value or a uuid generator', async () => {
    const db = await scratch('el_refused');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tup ON t TYPE [float, float];');

    expect(await err(db, 'DEFINE FIELD tup[0] ON t TYPE float;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD tup[0] ON t TYPE float DEFAULT 7.0;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD tup[1] ON t TYPE float DEFAULT ALWAYS 5.0;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD tup[1] ON t TYPE float VALUE time::now();')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD OVERWRITE tup[0] ON t TYPE float;')).toContain(NOT_HELD);
  });

  test('is refused for an optional, a nullable and an array parent as well', async () => {
    const db = await scratch('el_refused_parents');
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD o ON t TYPE option<[float, option<float>]>;
       DEFINE FIELD n ON t TYPE [float, float | null];
       DEFINE FIELD a ON t TYPE array<float>;`,
    );

    expect(await err(db, 'DEFINE FIELD o[1] ON t TYPE option<float> DEFAULT 7.0;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD n[1] ON t TYPE float | null;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD a[1] ON t TYPE float;')).toContain(NOT_HELD);
  });

  test('is refused under an object parent, and for a uuid default on a uuid element', async () => {
    const db = await scratch('el_refused_nested');
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD o ON t TYPE object;
       DEFINE FIELD o.tup ON t TYPE [float, float];
       DEFINE FIELD u ON t TYPE [uuid, string];`,
    );

    expect(await err(db, 'DEFINE FIELD o.tup[0] ON t TYPE float DEFAULT 1.0;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD u[0] ON t TYPE uuid DEFAULT rand::uuid::v4();')).toContain(NOT_HELD);
  });

  test('on an object element or a nested tuple element is refused because the element path is undefined', async () => {
    const db = await scratch('el_refused_deep');
    await ok(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD o ON t TYPE [{ a: int }, float];
       DEFINE FIELD n ON t TYPE [[int, int], float];`,
    );

    expect(await err(db, 'DEFINE FIELD o[0].a ON t TYPE int;')).toContain(
      'the field `o[0]` it is nested in is not defined',
    );
    expect(await err(db, 'DEFINE FIELD n[0][1] ON t TYPE int;')).toContain(
      'the field `n[0]` it is nested in is not defined',
    );
  });

  test('is the only refusal: the tuple parent alone, and the wildcard path, are accepted', async () => {
    const db = await scratch('el_accepted');

    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tup ON t TYPE option<[float, float]>;');
    expect(await ok(db, 'DEFINE FIELD tup.* ON t TYPE float;')).toBeNull();
    expect(await ok(db, 'CREATE t:1 SET tup = [1, 2];')).toEqual([{ id: 't:1', tup: [1, 2] }]);
  });
});

describe('the optional tuple plus optional object initialisation', () => {
  const DEFINE = `DEFINE TABLE d SCHEMAFULL;
    DEFINE FIELD name ON d TYPE string;
    DEFINE FIELD tup ON d TYPE option<[float, float | null]>;
    DEFINE FIELD obj ON d TYPE option<object>;
    DEFINE FIELD obj.x ON d TYPE string;`;

  test('an absent optional tuple stays NONE beside an optional object that has sub-fields', async () => {
    const db = await scratch('bug_absent');
    await ok(db, DEFINE);

    expect(await ok(db, "CREATE d:1 SET name = 'n';")).toEqual([{ id: 'd:1', name: 'n' }]);
    expect(await typeOf(db, 'tup', 'd:1')).toBe('none');
    expect(await typeOf(db, 'obj', 'd:1')).toBe('none');
  });

  test('the same holds with the wildcard path defined on a tuple', async () => {
    const db = await scratch('bug_wildcard');
    await ok(
      db,
      `DEFINE TABLE d SCHEMAFULL;
       DEFINE FIELD name ON d TYPE string;
       DEFINE FIELD tup ON d TYPE option<[float, float]>;
       DEFINE FIELD tup.* ON d TYPE float;
       DEFINE FIELD obj ON d TYPE option<object>;
       DEFINE FIELD obj.x ON d TYPE string;`,
    );
    await ok(db, "CREATE d:1 SET name = 'n';");

    expect(await typeOf(db, 'tup', 'd:1')).toBe('none');
    expect(await ok(db, 'SELECT * FROM d:1;')).toEqual([{ id: 'd:1', name: 'n' }]);
  });

  test('the statement that triggered it on 3.3.0 cannot be issued, so there is nothing to initialise', async () => {
    const db = await scratch('bug_trigger');
    await ok(db, DEFINE);

    expect(await err(db, 'DEFINE FIELD tup[0] ON d TYPE float;')).toContain(NOT_HELD);
    expect(await err(db, 'DEFINE FIELD tup[1] ON d TYPE float | null;')).toContain(NOT_HELD);
  });

  test('written values are kept as written', async () => {
    const db = await scratch('bug_present');
    await ok(db, DEFINE);

    expect(await ok(db, "CREATE d:2 SET name = 'b', tup = [1, null], obj = { x: 's' };")).toEqual([
      { id: 'd:2', name: 'b', obj: { x: 's' }, tup: [1, null] },
    ]);
  });
});

describe('tuple element defaults', () => {
  test('an element left out of a write is not filled by the server: the write is refused', async () => {
    const db = await scratch('def_none');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tup ON t TYPE [float, float];');

    expect(await err(db, 'CREATE t:1 SET tup = [1.0];')).toContain('Expected `[float, float]` but found `[1f]`');
  });

  test('a timestamp written by the client into the array literal is stored', async () => {
    const db = await scratch('def_client');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tup ON t TYPE [datetime, string];');
    await ok(db, "CREATE t:1 SET tup = [time::now(), 'x'];");

    expect(await typeOf(db, 'tup[0]', 't:1')).toBe('datetime');
    expect(await err(db, "CREATE t:2 SET tup = ['now', 'x'];")).toContain('Expected `[datetime, string]`');
  });

  test('a default on the whole tuple field still fires when the field is left out', async () => {
    const db = await scratch('def_whole');
    await ok(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tup ON t TYPE [float, float] DEFAULT [1.0, 2.0];');

    expect(await ok(db, 'CREATE t:1;')).toEqual([{ id: 't:1', tup: [1, 2] }]);
    expect(await ok(db, 'CREATE t:2 SET tup = [3.0, 4.0];')).toEqual([{ id: 't:2', tup: [3, 4] }]);
  });
});

describe('TYPE any', () => {
  const DEFINE = 'DEFINE TABLE c SCHEMAFULL; DEFINE FIELD x ON c TYPE any;';

  test('accepts NONE, null, an omitted field and a nested value, and keeps NONE and null apart', async () => {
    const db = await scratch('any_ok');
    await ok(db, DEFINE);
    await ok(
      db,
      'CREATE c:1 SET x = NONE; CREATE c:2 SET x = NULL; CREATE c:3 CONTENT {}; CREATE c:4 SET x = [1, { a: 2 }];',
    );

    expect(await typeOf(db, 'x', 'c:1')).toBe('none');
    expect(await typeOf(db, 'x', 'c:2')).toBe('null');
    expect(await typeOf(db, 'x', 'c:3')).toBe('none');
    expect(await typeOf(db, 'x', 'c:4')).toBe('array');
  });

  test('option<any> and any | null are not valid types, so Any? and Any @nullable cannot be emitted', async () => {
    const db = await scratch('any_wrap');
    await ok(db, 'DEFINE TABLE o SCHEMAFULL;');

    await expect(run(db, 'DEFINE FIELD y ON o TYPE option<any>;')).rejects.toThrow('Parse error');
    await expect(run(db, 'DEFINE FIELD z ON o TYPE any | null;')).rejects.toThrow('Parse error');
  });
});
