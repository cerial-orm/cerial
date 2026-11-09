/**
 * Facts about the shape of `INFO FOR DB` and `INFO FOR TABLE`, as text and as
 * `STRUCTURE`: the keys a reader depends on, and the renderings that differ from
 * the text that was emitted.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

interface TextInfo {
  fields: Record<string, string>;
  indexes: Record<string, string>;
  events: Record<string, string>;
}

interface FieldRow {
  name: string;
  kind: string;
  table: string;
  readonly: boolean;
  default?: string;
  default_always?: boolean;
  value?: string;
  assert?: string;
  flexible?: boolean;
}

interface IndexRow {
  name: string;
  table: string;
  cols: string[];
  index: string;
}

interface StructureInfo {
  fields: FieldRow[];
  indexes: IndexRow[];
  events: unknown[];
  lives: unknown[];
  tables: unknown[];
  migrations: { generation: number; guaranteed: unknown[]; migrations: unknown[] };
}

const scratch: ScratchDatabase[] = [];

async function open(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  scratch.push(db);

  return db;
}

async function text(db: ScratchDatabase, table = 't'): Promise<TextInfo> {
  const [result] = await run(db, `INFO FOR TABLE ${table};`);

  return result!.result as TextInfo;
}

async function structure(db: ScratchDatabase, table = 't'): Promise<StructureInfo> {
  const [result] = await run(db, `INFO FOR TABLE ${table} STRUCTURE;`);

  return result!.result as StructureInfo;
}

function field(info: StructureInfo, name: string): FieldRow {
  const found = info.fields.find((row) => row.name === name);
  if (!found) throw new Error(`no field ${name} in ${JSON.stringify(info.fields.map((row) => row.name))}`);

  return found;
}

afterAll(async () => {
  for (const db of scratch) await db.remove();
});

describe('INFO FOR TABLE STRUCTURE keys', () => {
  let db: ScratchDatabase;
  let info: StructureInfo;

  beforeAll(async () => {
    db = await open('keys');
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD plain ON t TYPE string;
       DEFINE FIELD price ON t TYPE decimal DEFAULT 99.99;
       DEFINE FIELD s ON t TYPE string DEFAULT ALWAYS 'x' READONLY ASSERT $value != 'z' VALUE IF $value THEN $value ELSE 'q' END;
       DEFINE FIELD ob ON t TYPE object FLEXIBLE;
       DEFINE INDEX ix ON t FIELDS plain;
       DEFINE INDEX uq ON t FIELDS plain, price UNIQUE;`,
    );
    for (const result of results) expect(result.status).toBe('OK');
    info = await structure(db);
  });

  test('the top-level keys are arrays, plus a migrations object that 3.3.0 did not have', () => {
    expect(Object.keys(info).sort()).toEqual(['events', 'fields', 'indexes', 'lives', 'migrations', 'tables']);
    for (const key of ['events', 'fields', 'indexes', 'lives', 'tables'] as const) {
      expect(Array.isArray(info[key])).toBe(true);
    }
  });

  test('migrations is an object, not an array, so a reader that walks array-valued keys passes over it', () => {
    expect(Array.isArray(info.migrations)).toBe(false);
    expect(Object.keys(info.migrations).sort()).toEqual(['generation', 'guaranteed', 'migrations']);
    expect(typeof info.migrations.generation).toBe('number');
    expect(info.migrations.guaranteed).toEqual([]);
    expect(info.migrations.migrations).toEqual([]);
  });

  test('every array-valued key other than fields and indexes is empty on a table with only fields and indexes', () => {
    const rest = Object.entries(info).filter(
      ([key, value]) => !['fields', 'indexes'].includes(key) && Array.isArray(value),
    );

    expect(rest.map(([key]) => key).sort()).toEqual(['events', 'lives', 'tables']);
    for (const [, value] of rest) expect(value).toEqual([]);
  });

  test('a bare field carries name, kind, table and readonly, and none of the optional keys', () => {
    const row = field(info, 'plain');

    expect(row.name).toBe('plain');
    expect(row.kind).toBe('string');
    expect(row.table).toBe('t');
    expect(row.readonly).toBe(false);
    for (const absent of ['default', 'default_always', 'value', 'assert', 'flexible']) {
      expect(absent in row).toBe(false);
    }
  });

  test('default and default_always are present together, default_always false for a plain DEFAULT', () => {
    const row = field(info, 'price');

    expect(row.default).toBe('99.99f');
    expect(row.default_always).toBe(false);
  });

  test('DEFAULT ALWAYS, READONLY, ASSERT and VALUE each read back', () => {
    const row = field(info, 's');

    expect(row.default).toBe("'x'");
    expect(row.default_always).toBe(true);
    expect(row.readonly).toBe(true);
    expect(row.assert).toBe("$value != 'z'");
    expect(row.value).toBe("(IF $value THEN $value ELSE 'q' END)");
  });

  test('flexible is present only on a flexible field', () => {
    expect(field(info, 'ob').flexible).toBe(true);
    expect('flexible' in field(info, 'plain')).toBe(false);
  });

  test('an index carries name, table, cols and an index string; a plain index has an empty one', () => {
    const plain = info.indexes.find((row) => row.name === 'ix')!;
    const unique = info.indexes.find((row) => row.name === 'uq')!;

    expect(plain).toEqual({ name: 'ix', table: 't', cols: ['plain'], index: '' });
    expect(unique).toEqual({ name: 'uq', table: 't', cols: ['plain', 'price'], index: 'UNIQUE' });
  });
});

describe('renderings that differ from the emitted text', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open('render');
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD opt ON t TYPE option<string>;
       DEFINE FIELD price ON t TYPE decimal DEFAULT 99.99;
       DEFINE FIELD v ON t TYPE string VALUE IF $value THEN $value ELSE 'q' END;
       DEFINE INDEX ix ON t COLUMNS opt;`,
    );
    for (const result of results) expect(result.status).toBe('OK');
  });

  test('option<string> reads back as none | string, in text and in STRUCTURE', async () => {
    expect((await text(db)).fields.opt).toBe('DEFINE FIELD opt ON t TYPE none | string PERMISSIONS FULL');
    expect(field(await structure(db), 'opt').kind).toBe('none | string');
  });

  test('COLUMNS reads back as FIELDS', async () => {
    expect((await text(db)).indexes.ix).toBe('DEFINE INDEX ix ON t FIELDS opt');
  });

  test('VALUE IF ... gains parentheses and single quotes', async () => {
    const definition = (await text(db)).fields.v!;

    expect(definition).toContain("VALUE (IF $value THEN $value ELSE 'q' END)");
  });

  test('DEFAULT 99.99 on decimal reads back as 99.99f', async () => {
    expect((await text(db)).fields.price).toBe('DEFINE FIELD price ON t TYPE decimal DEFAULT 99.99f PERMISSIONS FULL');
    expect(field(await structure(db), 'price').default).toBe('99.99f');
  });
});

describe('the auto-created element field', () => {
  test('array<object> produces a name.* field of kind object with no key beyond the bare four', async () => {
    const db = await open('element_obj');
    await run(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD a ON t TYPE array<object>; DEFINE FIELD a.*.x ON t TYPE string;',
    );

    const info = await structure(db);
    const element = field(info, 'a.*');

    expect(element.kind).toBe('object');
    expect(Object.keys(element).sort()).toEqual(['kind', 'name', 'permissions', 'readonly', 'table']);
    expect(info.fields.map((row) => row.name)).toEqual(['a', 'a.*', 'a.*.x']);
  });

  test('FLEXIBLE on the array parent is copied onto the .* element and not onto the parent of a strict array', async () => {
    const db = await open('element_flex');
    await run(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD f ON t TYPE array<object> FLEXIBLE; DEFINE FIELD s ON t TYPE array<object>;',
    );
    const info = await structure(db);

    expect(field(info, 'f').flexible).toBe(true);
    expect(field(info, 'f.*').flexible).toBe(true);
    expect('flexible' in field(info, 's')).toBe(false);
    expect('flexible' in field(info, 's.*')).toBe(false);
  });

  test('set<string> and array<option<string>> each produce an element field typed as the member', async () => {
    const db = await open('element_set');
    await run(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD s ON t TYPE set<string>; DEFINE FIELD o ON t TYPE array<option<string>>;',
    );
    const info = await structure(db);

    expect(field(info, 's.*').kind).toBe('string');
    expect(field(info, 'o').kind).toBe('array<none | string>');
    expect(field(info, 'o.*').kind).toBe('none | string');
  });

  test('a scalar, an object and a tuple parent produce no element field', async () => {
    const db = await open('element_none');
    await run(
      db,
      'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD s ON t TYPE string; DEFINE FIELD o ON t TYPE object; DEFINE FIELD p ON t TYPE [int, string];',
    );

    expect((await structure(db)).fields.map((row) => row.name)).toEqual(['o', 'p', 's']);
  });

  test('TYPE array<string> produces a live name.* field nothing emitted', async () => {
    const db = await open('element');
    await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tags ON t TYPE array<string>;');

    expect((await text(db)).fields['tags.*']).toBe('DEFINE FIELD tags.* ON t TYPE string PERMISSIONS FULL');
    const element = field(await structure(db), 'tags.*');
    expect(element.kind).toBe('string');
    expect(Object.keys((await text(db)).fields).sort()).toEqual(['tags', 'tags.*']);
  });
});

describe('the kind each field type reads back as', () => {
  /** [emitted TYPE, STRUCTURE kind]; equal strings are the ones that survive unchanged. */
  const KINDS: readonly (readonly [string, string])[] = [
    ['string', 'string'],
    ['int', 'int'],
    ['float', 'float'],
    ['number', 'number'],
    ['bool', 'bool'],
    ['datetime', 'datetime'],
    ['duration', 'duration'],
    ['uuid', 'uuid'],
    ['bytes', 'bytes'],
    ['decimal', 'decimal'],
    ['geometry', 'geometry'],
    ['any', 'any'],
    ['object', 'object'],
    ['int | null', 'int | null'],
    ['option<object>', 'none | object'],
    ['option<string | null>', 'none | string | null'],
    ['record<k>', 'record<k>'],
    ['record', 'record'],
    ['record<k | other>', 'record<k | other>'],
    ['option<record<k>>', 'none | record<k>'],
    ['array<record<k>>', 'array<record<k>>'],
    ['set<string>', 'set<string>'],
    ['array<datetime>', 'array<datetime>'],
    ['array<int, 3>', 'array<int, 3>'],
    ['array<option<string>>', 'array<none | string>'],
    ['[float, option<float>]', '[float, none | float]'],
    ['[string, int | null]', '[string, int | null]'],
    ['option<[string, datetime, int, int]>', 'none | [string, datetime, int, int]'],
    ['array<[int, option<string>]>', 'array<[int, none | string]>'],
    ["'a' | 'b'", "'a' | 'b'"],
    ['1 | 2 | 3', '1 | 2 | 3'],
    ['{ a: int, b: option<string> } | "x"', "{ a: int, b: none | string } | 'x'"],
  ];
  let db: ScratchDatabase;
  let info: StructureInfo;

  beforeAll(async () => {
    db = await open('kinds');
    const defines = KINDS.map(([emitted], i) => `DEFINE FIELD f${i} ON t TYPE ${emitted};`);
    for (const result of await run(db, `DEFINE TABLE t SCHEMAFULL; ${defines.join('\n')}`)) {
      expect(result.status).toBe('OK');
    }
    info = await structure(db);
  });

  test('every kind in the e2e schemas reads back as pinned, in STRUCTURE', () => {
    for (const [i, [emitted, readback]] of KINDS.entries()) {
      expect([emitted, field(info, `f${i}`).kind]).toEqual([emitted, readback]);
    }
  });

  test('the text form carries the same kind after TYPE', async () => {
    const definitions = (await text(db)).fields;

    for (const [i, [, readback]] of KINDS.entries()) {
      expect(definitions[`f${i}`]).toStartWith(`DEFINE FIELD f${i} ON t TYPE ${readback} `);
    }
  });

  test('the optional forms differ from their required form, so drift between them is real', () => {
    const kind = (emitted: string) => field(info, `f${KINDS.findIndex(([e]) => e === emitted)}`).kind;

    expect(kind('option<object>')).not.toBe(kind('object'));
    expect(kind('[float, option<float>]')).not.toBe('[float, float]');
    expect(kind('int | null')).not.toBe(kind('int'));
  });
});

describe('defaults, computed values and indexes as they read back', () => {
  let db: ScratchDatabase;
  let info: StructureInfo;

  beforeAll(async () => {
    db = await open('defaults');
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD id7 ON t TYPE string DEFAULT rand::uuid::v7();
       DEFINE FIELD id4 ON t TYPE string DEFAULT rand::uuid::v4();
       DEFINE FIELD ts ON t TYPE datetime DEFAULT ALWAYS time::now();
       DEFINE FIELD dur ON t TYPE duration DEFAULT 1h30m;
       DEFINE FIELD comp ON t TYPE datetime COMPUTED time::now();
       DEFINE FIELD arr ON t TYPE array<object>;
       DEFINE FIELD s ON t TYPE string;
       DEFINE FIELD n ON t TYPE int;
       DEFINE INDEX ip ON t FIELDS s;
       DEFINE INDEX iu ON t FIELDS s, n UNIQUE;
       DEFINE INDEX ia ON t FIELDS arr.*.x;`,
    );
    for (const result of results) expect(result.status).toBe('OK');
    info = await structure(db);
  });

  test('a uuid default reads back with its namespace backticked, and time::now() does not', () => {
    expect(field(info, 'id7').default).toBe('`rand`::uuid::v7()');
    expect(field(info, 'id4').default).toBe('`rand`::uuid::v4()');
    expect(field(info, 'ts').default).toBe('time::now()');
    expect(field(info, 'ts').default_always).toBe(true);
  });

  test('a duration default reads back unquoted and a COMPUTED field carries computed, not value', () => {
    expect(field(info, 'dur').default).toBe('1h30m');
    const comp = field(info, 'comp') as FieldRow & { computed?: string };

    expect(comp.computed).toBe('time::now()');
    expect('value' in comp).toBe(false);
  });

  test('a plain field gains no default, computed or value key', () => {
    for (const absent of ['default', 'default_always', 'computed', 'value']) {
      expect(absent in field(info, 's')).toBe(false);
    }
  });

  test('an index over an array element path keeps the .* in cols; a unique composite lists its columns in order', () => {
    const named = (name: string) => info.indexes.find((row) => row.name === name)!;

    expect(named('ia').cols).toEqual(['arr.*.x']);
    expect(named('iu')).toEqual({ name: 'iu', table: 't', cols: ['s', 'n'], index: 'UNIQUE' });
    expect(named('ip').index).toBe('');
  });
});

describe('names', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open('names');
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD plain ON t TYPE string;
       DEFINE FIELD \`a b\` ON t TYPE string;
       DEFINE FIELD \`a.b\` ON t TYPE string;
       DEFINE FIELD \`o y\` ON t TYPE object;
       DEFINE FIELD \`o y\`.z ON t TYPE string;
       DEFINE FIELD \`é\` ON t TYPE string;
       DEFINE FIELD \`select\` ON t TYPE string;
       DEFINE FIELD \`value\` ON t TYPE string;
       DEFINE INDEX \`my ix\` ON t FIELDS plain;`,
    );
    for (const result of results) expect(result.status).toBe('OK');
  });

  test('STRUCTURE field names are rendered idioms, keywords included', async () => {
    const names = (await structure(db)).fields.map((row) => row.name);

    for (const name of ['plain', '`a b`', '`a.b`', '`o y`.z', '`é`', '`select`', '`value`']) {
      expect(names).toContain(name);
    }
  });

  test('text field keys are the same idioms except that keywords come back bare', async () => {
    const keys = Object.keys((await text(db)).fields);

    for (const name of ['plain', '`a b`', '`a.b`', '`o y`.z', '`é`', 'select', 'value']) {
      expect(keys).toContain(name);
    }
    expect(keys).not.toContain('`select`');
    expect(keys).not.toContain('`value`');
  });

  test('a nested field whose parent is not defined is refused, so an unnamed parent never reaches INFO', async () => {
    const [refused] = await run(db, 'DEFINE FIELD `p q`.z ON t TYPE string;');

    expect(refused!.status).toBe('ERR');
    expect(refused!.result).toBe(
      'Cannot define field ``p q`.z`: the field ``p q`` it is nested in is not defined. Define ``p q`` first',
    );
    expect((await structure(db)).fields.map((row) => row.name)).not.toContain('`p q`.z');
  });

  test('an index name comes back raw', async () => {
    expect(Object.keys((await text(db)).indexes)).toEqual(['my ix']);
    expect((await structure(db)).indexes[0]!.name).toBe('my ix');
  });

  test('a hostile table name comes back raw as data, in INFO FOR DB text and STRUCTURE', async () => {
    const hostile = 'a`\nb; REMOVE TABLE t';
    const [defined] = await run(db, 'DEFINE TABLE `a\\`\nb; REMOVE TABLE t` SCHEMAFULL;');
    expect(defined!.status).toBe('OK');

    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');
    const tables = (dbText!.result as { tables: Record<string, string> }).tables;
    const rows = (dbStructure!.result as { tables: { name: string }[] }).tables;

    expect(Object.keys(tables)).toContain(hostile);
    expect(rows.map((row) => row.name)).toContain(hostile);
    expect(Object.keys(tables)).toContain('t');
  });
});

describe('INFO FOR DB keys', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open('dbkeys');
  });

  const KEYS = [
    'accesses',
    'analyzers',
    'apis',
    'buckets',
    'compatibility',
    'configs',
    'extensions',
    'functions',
    'models',
    'params',
    'sequences',
    'tables',
    'types',
    'users',
  ];
  const COLLECTIONS = KEYS.filter((key) => key !== 'compatibility');

  test('an empty database lists every key: collections as empty objects in text and empty arrays in STRUCTURE', async () => {
    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');

    expect(Object.keys(dbText!.result as object).sort()).toEqual(KEYS);
    expect(Object.keys(dbStructure!.result as object).sort()).toEqual(KEYS);
    for (const key of COLLECTIONS) {
      expect((dbText!.result as Record<string, unknown>)[key]).toEqual({});
      expect((dbStructure!.result as Record<string, unknown>)[key]).toEqual([]);
    }
  });

  test('compatibility is a number, the same in text and STRUCTURE, and is not a collection', async () => {
    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');
    const asText = dbText!.result as Record<string, unknown>;
    const asRows = dbStructure!.result as Record<string, unknown>;

    expect(asText.compatibility).toBe(4);
    expect(asRows.compatibility).toBe(4);
    expect(Array.isArray(asRows.compatibility)).toBe(false);
  });

  test('modules, a key 3.3.0 listed, is gone', async () => {
    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');

    expect('modules' in (dbText!.result as object)).toBe(false);
    expect('modules' in (dbStructure!.result as object)).toBe(false);
  });

  test('each key reports a definition made in the database', async () => {
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FUNCTION fn::f() { RETURN 1; };
       DEFINE PARAM $p VALUE 1;
       DEFINE ANALYZER an TOKENIZERS blank;
       DEFINE ACCESS ac ON DATABASE TYPE RECORD DURATION FOR SESSION 1h;
       DEFINE USER u ON DATABASE PASSWORD 'secret-not-real' ROLES VIEWER;`,
    );
    for (const result of results) expect(result.status).toBe('OK');

    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');
    const asText = dbText!.result as Record<string, Record<string, string>>;
    const asRows = dbStructure!.result as Record<string, { name: string }[]>;

    expect(Object.keys(asText.functions!)).toEqual(['f']);
    expect(asText.functions!.f).toContain('DEFINE FUNCTION fn::f()');
    expect(Object.keys(asText.params!)).toEqual(['p']);
    expect(Object.keys(asText.analyzers!)).toEqual(['an']);
    expect(Object.keys(asText.accesses!)).toEqual(['ac']);
    expect(Object.keys(asText.users!)).toEqual(['u']);
    expect(Object.keys(asText.tables!)).toEqual(['t']);
    for (const key of ['functions', 'params', 'analyzers', 'accesses', 'users', 'tables']) {
      expect(asRows[key]!.map((row) => row.name)).toEqual(Object.keys(asText[key]!));
    }
    for (const key of ['apis', 'buckets', 'configs', 'models', 'sequences', 'types', 'extensions']) {
      expect(asRows[key]).toEqual([]);
    }
  });

  test('credentials are redacted in text and in STRUCTURE', async () => {
    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');
    const asText = JSON.stringify(dbText!.result);
    const asRows = JSON.stringify(dbStructure!.result);

    expect(asText).toContain('[REDACTED]');
    expect(asRows).toContain('[REDACTED]');
    expect(asText).not.toContain('secret-not-real');
    expect(asRows).not.toContain('secret-not-real');
  });
});

describe('cost of many INFO FOR TABLE calls', () => {
  // Each call is a round trip (about 10 ms locally, more on CI), so 50 keep it inside the default budget
  test('50 calls one by one against one multi-statement request', async () => {
    const db = await open('timing');
    const tables = Array.from({ length: 50 }, (_, i) => `timing_${i}`);
    const define = tables.map((name) => `DEFINE TABLE ${name} SCHEMAFULL; DEFINE FIELD a ON ${name} TYPE string;`);
    for (const result of await run(db, define.join('\n'))) expect(result.status).toBe('OK');

    const singleStart = performance.now();
    for (const name of tables) {
      const [result] = await run(db, `INFO FOR TABLE ${name};`);
      expect(result!.status).toBe('OK');
    }
    const singleMs = performance.now() - singleStart;

    const batchStart = performance.now();
    const batch = await run(db, tables.map((name) => `INFO FOR TABLE ${name};`).join('\n'));
    const batchMs = performance.now() - batchStart;

    expect(batch).toHaveLength(50);
    for (const result of batch) expect(result.status).toBe('OK');
    console.log(`INFO FOR TABLE x50: one by one ${singleMs.toFixed(0)} ms, one request ${batchMs.toFixed(0)} ms`);
  });
});
