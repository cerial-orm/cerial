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

  test('the top-level keys are arrays', () => {
    expect(Object.keys(info).sort()).toEqual(['events', 'fields', 'indexes', 'lives', 'tables']);
    expect(Array.isArray(info.fields)).toBe(true);
    expect(Array.isArray(info.indexes)).toBe(true);
    expect(Array.isArray(info.events)).toBe(true);
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
  test('TYPE array<string> produces a live name.* field nothing emitted', async () => {
    const db = await open('element');
    await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD tags ON t TYPE array<string>;');

    expect((await text(db)).fields['tags.*']).toBe('DEFINE FIELD tags.* ON t TYPE string PERMISSIONS FULL');
    const element = field(await structure(db), 'tags.*');
    expect(element.kind).toBe('string');
    expect(Object.keys((await text(db)).fields).sort()).toEqual(['tags', 'tags.*']);
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
    'configs',
    'functions',
    'models',
    'modules',
    'params',
    'sequences',
    'tables',
    'users',
  ];

  test('an empty database lists every key, as empty objects in text and empty arrays in STRUCTURE', async () => {
    const [dbText, dbStructure] = await run(db, 'INFO FOR DB; INFO FOR DB STRUCTURE;');

    expect(Object.keys(dbText!.result as object).sort()).toEqual(KEYS);
    expect(Object.keys(dbStructure!.result as object).sort()).toEqual(KEYS);
    for (const key of KEYS) {
      expect((dbText!.result as Record<string, unknown>)[key]).toEqual({});
      expect((dbStructure!.result as Record<string, unknown>)[key]).toEqual([]);
    }
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
    for (const key of ['apis', 'buckets', 'configs', 'models', 'modules', 'sequences']) {
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
  test('200 calls one by one against one multi-statement request', async () => {
    const db = await open('timing');
    const tables = Array.from({ length: 200 }, (_, i) => `timing_${i}`);
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

    expect(batch).toHaveLength(200);
    for (const result of batch) expect(result.status).toBe('OK');
    console.log(`INFO FOR TABLE x200: one by one ${singleMs.toFixed(0)} ms, one request ${batchMs.toFixed(0)} ms`);
  });
});
