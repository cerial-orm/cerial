/**
 * Facts about schema definitions on SurrealDB 4.0: which parent types can hold a nested
 * `DEFINE FIELD` path, which clauses must be free of side effects, how a typed `id` is
 * defined, and which defaults fire. Each fact has a case that holds and a case that is refused.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

let db: ScratchDatabase;

beforeAll(async () => {
  db = await withScratchDatabase('schema_defs');
});

afterAll(async () => {
  await db.remove();
});

/** Runs the statements and returns the failure text of the last one (undefined when it succeeded). */
async function lastFailure(surql: string): Promise<string | undefined> {
  const results = await run(db, surql);
  const last = results[results.length - 1]!;

  return last.status === 'OK' ? undefined : String(last.result);
}

const CANNOT_HOLD = 'has a type that cannot hold it';

describe('a sub-field path under an object parent', () => {
  test('is accepted under object and option<object>, to any depth', async () => {
    expect(
      await lastFailure(
        'DEFINE TABLE ob1 SCHEMAFULL; DEFINE FIELD o ON ob1 TYPE object; DEFINE FIELD o.x ON ob1 TYPE string;',
      ),
    ).toBeUndefined();
    expect(
      await lastFailure(
        'DEFINE TABLE ob2 SCHEMAFULL; DEFINE FIELD o ON ob2 TYPE option<object>; DEFINE FIELD o.x ON ob2 TYPE string;',
      ),
    ).toBeUndefined();
    expect(
      await lastFailure(
        `DEFINE TABLE ob3 SCHEMAFULL; DEFINE FIELD o ON ob3 TYPE object; DEFINE FIELD o.n ON ob3 TYPE object;
         DEFINE FIELD o.n.z ON ob3 TYPE int;`,
      ),
    ).toBeUndefined();
  });

  test('applies its DEFAULT to a nested key the write left out, and enforces the type', async () => {
    const results = await run(
      db,
      `DEFINE TABLE ob4 SCHEMAFULL; DEFINE FIELD o ON ob4 TYPE option<object>;
       DEFINE FIELD o.x ON ob4 TYPE string DEFAULT 'd'; DEFINE FIELD o.n ON ob4 TYPE object; DEFINE FIELD o.n.z ON ob4 TYPE int;
       CREATE ob4:1 SET o = { n: { z: 1 } };
       CREATE ob4:2 SET o = { n: { z: 'no' } };`,
    );
    expect(results[5]!.result).toEqual([{ id: 'ob4:1', o: { n: { z: 1 }, x: 'd' } }]);
    expect(results[6]!.status).toBe('ERR');
  });

  test('is refused under an @nullable object parent (object | null), plain or optional', async () => {
    const plain = await lastFailure(
      'DEFINE TABLE ob5 SCHEMAFULL; DEFINE FIELD o ON ob5 TYPE object | null; DEFINE FIELD o.x ON ob5 TYPE string;',
    );
    expect(plain).toContain('only an object holds a field');

    const optional = await lastFailure(
      'DEFINE TABLE ob6 SCHEMAFULL; DEFINE FIELD o ON ob6 TYPE option<object | null>; DEFINE FIELD o.x ON ob6 TYPE string;',
    );
    expect(optional).toContain('only an object holds a field');
  });

  test('is refused under a primitive parent, a literal object parent and no parent at all', async () => {
    expect(
      await lastFailure(
        'DEFINE TABLE ob7 SCHEMAFULL; DEFINE FIELD s ON ob7 TYPE string; DEFINE FIELD s.x ON ob7 TYPE string;',
      ),
    ).toContain('only an object holds a field');
    expect(
      await lastFailure(
        'DEFINE TABLE ob8 SCHEMAFULL; DEFINE FIELD l ON ob8 TYPE { y: int }; DEFINE FIELD l.x ON ob8 TYPE string;',
      ),
    ).toContain('mismatched with field');
    expect(await lastFailure('DEFINE TABLE ob9 SCHEMAFULL; DEFINE FIELD o.x ON ob9 TYPE string;')).toContain(
      'Define `o` first',
    );
  });

  test('an undeclared key on a strict object is refused, and FLEXIBLE lets it through', async () => {
    const results = await run(
      db,
      `DEFINE TABLE ob10 SCHEMAFULL; DEFINE FIELD o ON ob10 TYPE object; DEFINE FIELD o.x ON ob10 TYPE string;
       CREATE ob10:1 SET o = { x: 'a', y: 2 };
       DEFINE TABLE ob11 SCHEMAFULL; DEFINE FIELD o ON ob11 TYPE object FLEXIBLE; DEFINE FIELD o.x ON ob11 TYPE string;
       CREATE ob11:1 SET o = { x: 'a', y: 2 };`,
    );
    expect(results[3]!.status).toBe('ERR');
    expect(results[7]!.result).toEqual([{ id: 'ob11:1', o: { x: 'a', y: 2 } }]);
  });

  test('COMPUTED is refused on a nested path and accepted at the top level', async () => {
    expect(
      await lastFailure(
        'DEFINE TABLE ob12 SCHEMAFULL; DEFINE FIELD o ON ob12 TYPE object; DEFINE FIELD o.t ON ob12 TYPE datetime COMPUTED time::now();',
      ),
    ).toContain('COMPUTED` fields must be top-level');
    expect(
      await lastFailure('DEFINE TABLE ob13 SCHEMAFULL; DEFINE FIELD t ON ob13 TYPE datetime COMPUTED time::now();'),
    ).toBeUndefined();
  });
});

describe('a tuple element path field[N] (cause A of the first run on 4.0)', () => {
  test('is refused under a tuple literal parent: plain, optional, array of tuples, literal-object element', async () => {
    const plain =
      'DEFINE TABLE tu1 SCHEMAFULL; DEFINE FIELD a ON tu1 TYPE [string, int]; DEFINE FIELD a[1] ON tu1 TYPE int;';
    const optional =
      'DEFINE TABLE tu2 SCHEMAFULL; DEFINE FIELD a ON tu2 TYPE option<[string, int]>; DEFINE FIELD a[1] ON tu2 TYPE int;';
    const arrayOf =
      'DEFINE TABLE tu3 SCHEMAFULL; DEFINE FIELD a ON tu3 TYPE array<[string, int]>; DEFINE FIELD a.*[1] ON tu3 TYPE int;';
    const literalObject =
      'DEFINE TABLE tu4 SCHEMAFULL; DEFINE FIELD a ON tu4 TYPE option<[string, { x: string }]>; DEFINE FIELD a[1] ON tu4 TYPE object;';

    for (const surql of [plain, optional, arrayOf, literalObject]) {
      expect(await lastFailure(surql)).toContain(CANNOT_HOLD);
    }
  });

  test('is refused whatever the element definition carries: a type only, a DEFAULT, an object, a nested tuple', async () => {
    const element = (n: number, definition: string): string =>
      `DEFINE TABLE tu5_${n} SCHEMAFULL; DEFINE FIELD a ON tu5_${n} TYPE [string, int, object, [int, int]]; DEFINE FIELD ${definition};`;

    expect(await lastFailure(element(1, 'a[1] ON tu5_1 TYPE int'))).toContain(CANNOT_HOLD);
    expect(await lastFailure(element(2, 'a[1] ON tu5_2 TYPE int DEFAULT 5'))).toContain(CANNOT_HOLD);
    expect(await lastFailure(element(3, 'a[2] ON tu5_3 TYPE object'))).toContain(CANNOT_HOLD);
    expect(await lastFailure(element(4, 'a[3] ON tu5_4 TYPE [int, int]'))).toContain(CANNOT_HOLD);
  });

  test('leaves the paths beneath an element undefinable, because the element itself cannot be defined', async () => {
    const results = await run(
      db,
      `DEFINE TABLE tu6 SCHEMAFULL; DEFINE FIELD a ON tu6 TYPE [string, object];
       DEFINE FIELD a[1] ON tu6 TYPE object;
       DEFINE FIELD a[1].x ON tu6 TYPE string;`,
    );
    expect(String(results[2]!.result)).toContain(CANNOT_HOLD);
    expect(String(results[3]!.result)).toContain('Define `a[1]` first');
  });

  test('a bare array parent still holds an element path, an array with an element type does not', async () => {
    expect(
      await lastFailure(
        'DEFINE TABLE tu7 SCHEMAFULL; DEFINE FIELD a ON tu7 TYPE array; DEFINE FIELD a[1] ON tu7 TYPE int;',
      ),
    ).toBeUndefined();
    expect(
      await lastFailure(
        'DEFINE TABLE tu8 SCHEMAFULL; DEFINE FIELD a ON tu8 TYPE array<int>; DEFINE FIELD a[1] ON tu8 TYPE int;',
      ),
    ).toContain(CANNOT_HOLD);
    expect(
      await lastFailure(
        'DEFINE TABLE tu9 SCHEMAFULL; DEFINE FIELD a ON tu9 TYPE any; DEFINE FIELD a[1] ON tu9 TYPE int;',
      ),
    ).toContain('only an array or set holds an index');
  });

  test('an object element without sub-field definitions rejects every key it is given', async () => {
    const results = await run(
      db,
      `DEFINE TABLE tu10 SCHEMAFULL; DEFINE FIELD a ON tu10 TYPE [string, object];
       CREATE tu10 SET a = ['s', { x: 1 }];`,
    );
    expect(String(results[2]!.result)).toContain("Found field 'a[1].x', but no such field exists");
  });

  test('inline object, enum and nested-object element types enforce the shape instead, and the paths stay undefined', async () => {
    const results = await run(
      db,
      `DEFINE TABLE tu11 SCHEMAFULL;
       DEFINE FIELD a ON tu11 TYPE option<[string, { grade: 'LOW' | 'MID', code: option<'a1' | 7>, m: { z: int } }]>;
       CREATE tu11:1 SET a = ['s', { grade: 'LOW', m: { z: 1 } }];
       CREATE tu11:2 SET a = ['s', { grade: 'MID', code: 7, m: { z: 1 } }];
       CREATE tu11:3 SET a = ['s', { grade: 'BAD', m: { z: 1 } }];
       CREATE tu11:4 SET a = ['s', { grade: 'LOW', m: { z: 'x' } }];
       CREATE tu11:5 SET a = ['s', { grade: 'LOW', m: { z: 1 }, extra: 1 }];
       CREATE tu11:6;`,
    );
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK', 'ERR', 'ERR', 'ERR', 'OK']);
    expect(results[2]!.result).toEqual([{ a: ['s', { grade: 'LOW', m: { z: 1 } }], id: 'tu11:1' }]);
  });

  test('an array of tuples with an inline object element enforces it per element', async () => {
    const results = await run(
      db,
      `DEFINE TABLE tu12 SCHEMAFULL; DEFINE FIELD a ON tu12 TYPE array<[string, { x: int }]>;
       CREATE tu12:1 SET a = [['s', { x: 1 }]];
       CREATE tu12:2 SET a = [['s', { x: 'no' }]];`,
    );
    expect(results[2]!.status).toBe('OK');
    expect(String(results[3]!.result)).toContain('when coercing element at index 0');
  });

  test('a tuple under an object parent is no different: the nested tuple path is still refused', async () => {
    const results = await run(
      db,
      `DEFINE TABLE tu13 SCHEMAFULL; DEFINE FIELD o ON tu13 TYPE object; DEFINE FIELD o.t ON tu13 TYPE [string, int];
       DEFINE FIELD o.t[0] ON tu13 TYPE string DEFAULT 'x';`,
    );
    expect(results[2]!.status).toBe('OK');
    expect(String(results[3]!.result)).toContain(CANNOT_HOLD);
  });
});

describe('array-of-objects sub-field path field.*.sub', () => {
  test('is stored, read back through INFO FOR TABLE STRUCTURE, with the implicit field.* beside it', async () => {
    const results = await run(
      db,
      `DEFINE TABLE ao1 SCHEMAFULL; DEFINE FIELD a ON ao1 TYPE array<object>; DEFINE FIELD a.*.x ON ao1 TYPE string;
       INFO FOR TABLE ao1 STRUCTURE;`,
    );
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK']);
    const fields = (results[3]!.result as { fields: { name: string; kind: string }[] }).fields;
    expect(fields.map((f) => [f.name, f.kind])).toEqual([
      ['a', 'array<object>'],
      ['a.*', 'object'],
      ['a.*.x', 'string'],
    ]);
  });

  test('is enforced on write: a wrong type and an undeclared key are refused', async () => {
    const results = await run(
      db,
      `DEFINE TABLE ao2 SCHEMAFULL; DEFINE FIELD a ON ao2 TYPE array<object>; DEFINE FIELD a.*.x ON ao2 TYPE string;
       CREATE ao2:1 SET a = [{ x: 'q' }];
       CREATE ao2:2 SET a = [{ x: 1 }];
       CREATE ao2:3 SET a = [{ x: 'q', y: 1 }];`,
    );
    expect(results[3]!.status).toBe('OK');
    expect(String(results[4]!.result)).toContain('Expected `string` but found `1`');
    expect(String(results[5]!.result)).toContain("Found field 'a[0].y', but no such field exists");
  });

  test('is accepted under option<array<object>>, and a repeat without OVERWRITE is refused', async () => {
    expect(
      await lastFailure(
        'DEFINE TABLE ao3 SCHEMAFULL; DEFINE FIELD a ON ao3 TYPE option<array<object>>; DEFINE FIELD a.*.x ON ao3 TYPE string;',
      ),
    ).toBeUndefined();
    expect(
      await lastFailure(
        'DEFINE TABLE ao4 SCHEMAFULL; DEFINE FIELD a ON ao4 TYPE array<object>; DEFINE FIELD a.*.x ON ao4 TYPE string; DEFINE FIELD a.*.x ON ao4 TYPE string;',
      ),
    ).toContain("The field 'a.*.x' already exists");
  });

  test('an index on field.*.sub is stored and enforces uniqueness across rows', async () => {
    const results = await run(
      db,
      `DEFINE TABLE ao5 SCHEMAFULL; DEFINE FIELD a ON ao5 TYPE array<object>; DEFINE FIELD a.*.x ON ao5 TYPE string;
       DEFINE INDEX i ON ao5 FIELDS a.*.x UNIQUE;
       CREATE ao5:1 SET a = [{ x: 'q' }];
       CREATE ao5:2 SET a = [{ x: 'q' }];
       INFO FOR TABLE ao5 STRUCTURE;`,
    );
    expect(results[4]!.status).toBe('OK');
    expect(String(results[5]!.result)).toContain('already contains');
    const indexes = (results[6]!.result as { indexes: { name: string; cols: string[]; index: string }[] }).indexes;
    expect(indexes).toEqual([{ cols: ['a.*.x'], index: 'UNIQUE', name: 'i', table: 'ao5' }]);
  });
});

describe('clauses that must be free of side effects', () => {
  test('DEFAULT rand::uuid::v4(), rand::uuid::v7(), rand::uuid() and time::now() are accepted and fire on create', async () => {
    const results = await run(
      db,
      `DEFINE TABLE se1 SCHEMAFULL;
       DEFINE FIELD v4 ON se1 TYPE uuid DEFAULT rand::uuid::v4();
       DEFINE FIELD v7 ON se1 TYPE uuid DEFAULT rand::uuid::v7();
       DEFINE FIELD v ON se1 TYPE uuid DEFAULT rand::uuid();
       DEFINE FIELD t ON se1 TYPE datetime DEFAULT time::now();
       DEFINE FIELD up ON se1 TYPE datetime DEFAULT ALWAYS time::now();
       CREATE se1:1; CREATE se1:2;
       SELECT v4, v7 FROM se1;`,
    );
    expect(results.slice(0, 6).map((r) => r.status)).toEqual(Array(6).fill('OK'));
    const rows = results[8]!.result as { v4: unknown; v7: unknown }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.v4).not.toBeNull();
    expect(String(rows[0]!.v4)).not.toBe(String(rows[1]!.v4));
    expect(String(rows[0]!.v7)).not.toBe(String(rows[1]!.v7));
    expect(String((results[6]!.result as { v7: string }[])[0]!.v7)[14]).toBe('7');
  });

  test('DEFAULT ALWAYS time::now() does not overwrite a supplied value either', async () => {
    const results = await run(
      db,
      `DEFINE TABLE se2 SCHEMAFULL;
       DEFINE FIELD t ON se2 TYPE datetime DEFAULT time::now();
       DEFINE FIELD up ON se2 TYPE datetime DEFAULT ALWAYS time::now();
       CREATE se2:1 SET t = d'2000-01-01T00:00:00Z', up = d'2000-01-01T00:00:00Z';
       SELECT t, up FROM se2;`,
    );
    const [row] = results[4]!.result as { t: string; up: string }[];
    expect(row!.t).toBe('2000-01-01T00:00:00Z');
    expect(row!.up).toBe('2000-01-01T00:00:00Z');
  });

  test('a CREATE inside DEFAULT, VALUE, COMPUTED or ASSERT is refused when the field is defined', async () => {
    const clause = async (n: number, definition: string): Promise<string | undefined> =>
      lastFailure(`DEFINE TABLE se3_${n} SCHEMAFULL; DEFINE FIELD x ON se3_${n} ${definition};`);

    expect(await clause(1, 'TYPE int DEFAULT (CREATE se3_1:99 SET x = 1)')).toContain(
      'The DEFAULT clause must not have effects: `CREATE` writes data',
    );
    expect(await clause(2, 'TYPE any DEFAULT { CREATE se3_2:99; 1 }')).toContain(
      'The DEFAULT clause must not have effects',
    );
    expect(await clause(3, 'TYPE any VALUE (CREATE se3_3:98)')).toContain(
      'The VALUE clause must not have effects: `CREATE` writes data',
    );
    expect(await clause(4, 'COMPUTED (CREATE se3_4:97)')).toContain(
      'The COMPUTED clause must not have effects: `CREATE` writes data',
    );
    expect(await clause(5, 'TYPE int ASSERT (CREATE se3_5:96)')).toContain(
      'The ASSERT clause must not have effects: `CREATE` writes data',
    );
  });

  test('sleep() in DEFAULT is refused as blocking', async () => {
    expect(
      await lastFailure('DEFINE TABLE se4 SCHEMAFULL; DEFINE FIELD x ON se4 TYPE int DEFAULT { sleep(1ms); 1 };'),
    ).toContain('`sleep` blocks');
  });

  test('pure calls are accepted: a user function, rand::int() and a read-only SELECT', async () => {
    expect(
      await lastFailure(
        'DEFINE FUNCTION OVERWRITE fn::one() { RETURN 1; }; DEFINE TABLE se5 SCHEMAFULL; DEFINE FIELD x ON se5 TYPE int DEFAULT fn::one();',
      ),
    ).toBeUndefined();
    expect(
      await lastFailure('DEFINE TABLE se6 SCHEMAFULL; DEFINE FIELD x ON se6 TYPE int DEFAULT rand::int();'),
    ).toBeUndefined();
    expect(
      await lastFailure('DEFINE TABLE se7 SCHEMAFULL; DEFINE FIELD x ON se7 TYPE any DEFAULT (SELECT * FROM se7);'),
    ).toBeUndefined();
  });

  test('the @set VALUE clause (IF $value THEN $value.distinct() ELSE [] END) is accepted and de-duplicates', async () => {
    const results = await run(
      db,
      `DEFINE TABLE se8 SCHEMAFULL;
       DEFINE FIELD s ON se8 TYPE array<string> VALUE IF $value THEN $value.distinct() ELSE [] END;
       CREATE se8:1 SET s = ['a', 'a', 'b'];
       CREATE se8:2 SET s = [];`,
    );
    expect(results[2]!.result).toEqual([{ id: 'se8:1', s: ['a', 'b'] }]);
    expect(results[3]!.result).toEqual([{ id: 'se8:2', s: [] }]);
  });
});

describe('a typed id defined with DEFINE FIELD OVERWRITE', () => {
  test('OVERWRITE can be run twice, a plain DEFINE FIELD on an existing id cannot', async () => {
    const overwrite = await run(
      db,
      'DEFINE TABLE id1 SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id1 TYPE string; DEFINE FIELD OVERWRITE id ON id1 TYPE string;',
    );
    expect(overwrite.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);

    expect(
      await lastFailure(
        'DEFINE TABLE id2 SCHEMAFULL; DEFINE FIELD id ON id2 TYPE string; DEFINE FIELD id ON id2 TYPE string;',
      ),
    ).toContain("The field 'id' already exists");
  });

  test('a string id accepts a string and refuses an int', async () => {
    const results = await run(
      db,
      'DEFINE TABLE id3 SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id3 TYPE string; CREATE id3:abc; CREATE id3:1; CREATE id3;',
    );
    expect(results[2]!.result).toEqual([{ id: 'id3:abc' }]);
    expect(String(results[3]!.result)).toContain('Expected `string` but found `1`');
    expect(results[4]!.status).toBe('OK');
  });

  test('a uuid id is generated when omitted and a non-uuid is refused', async () => {
    const results = await run(
      db,
      'DEFINE TABLE id4 SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id4 TYPE uuid; CREATE id4; CREATE id4:abc;',
    );
    expect(results[2]!.status).toBe('OK');
    expect(String(results[3]!.result)).toContain('Expected `uuid` but found');
  });

  test('a union id (string | int) is required in create: omitting it is refused, explicit ids of either member pass', async () => {
    const results = await run(
      db,
      'DEFINE TABLE id5 SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id5 TYPE string | int; CREATE id5:abc; CREATE id5:1; CREATE id5;',
    );
    expect(results[2]!.status).toBe('OK');
    expect(results[3]!.status).toBe('OK');
    expect(String(results[4]!.result)).toContain('Cannot generate a record id of type `string | int`');
  });

  test('a table with no id definition generates a string id and accepts any explicit id', async () => {
    const results = await run(db, 'DEFINE TABLE id6 SCHEMAFULL; CREATE id6:abc; CREATE id6; CREATE id6:7;');
    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK', 'OK']);
  });
});

describe('a Duration DEFAULT', () => {
  test('unquoted (1h30m) is accepted and read back as the duration', async () => {
    const results = await run(
      db,
      `DEFINE TABLE du1 SCHEMAFULL; DEFINE FIELD d ON du1 TYPE duration DEFAULT 1h30m; CREATE du1:1; SELECT d FROM du1;`,
    );
    expect(results[2]!.status).toBe('OK');
    expect(results[3]!.result).toEqual([{ d: '1h30m' }]);
  });

  test("quoted ('1h30m') is refused at definition because it does not coerce to duration", async () => {
    expect(
      await lastFailure("DEFINE TABLE du2 SCHEMAFULL; DEFINE FIELD d ON du2 TYPE duration DEFAULT '1h30m';"),
    ).toContain('its DEFAULT does not coerce to `duration`');
  });
});
