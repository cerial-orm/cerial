/**
 * The live schema reader against the shared instance, each case in a scratch database of its own.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import { buildFieldModel, diffSchema, quoteIdent, readLiveSchema } from '../../src/migrations';
import type { SchemaModel, TableModel } from '../../src/migrations';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });

  return db;
}

/** A connected socket on a fresh database. */
async function scratch(label: string): Promise<Surreal> {
  const name = `reader_${label}_${process.pid}_${Date.now().toString(36)}`;
  const root = await admin();
  await root.query(`DEFINE DATABASE ${name}`).collect();
  await root.use({ namespace: 'main', database: name });
  names.push(name);
  opened.push(root);

  return root;
}

async function exec(db: Surreal, surql: string): Promise<void> {
  await db.query(surql).collect();
}

function table(tables: readonly TableModel[], name: string): TableModel {
  const found = tables.find((t) => t.name === name);
  if (!found) throw new Error(`no table ${name} in ${JSON.stringify(tables.map((t) => t.name))}`);

  return found;
}

afterAll(async () => {
  const root = await admin();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  await root.close();
  for (const db of opened) await db.close().catch(() => {});
});

describe('readLiveSchema', () => {
  test('an empty database reads as nothing, with no unmanaged item from the twelve empty INFO keys', async () => {
    const db = await scratch('empty');

    expect(await readLiveSchema(db)).toEqual({ tables: [], unmanaged: [] });
  });

  test('reads tables, fields, nested fields, composite and unique indexes, and each option', async () => {
    const db = await scratch('shape');
    await exec(
      db,
      `DEFINE TABLE user SCHEMAFULL;
       DEFINE FIELD name ON user TYPE string;
       DEFINE FIELD nick ON user TYPE option<string> DEFAULT 'x';
       DEFINE FIELD stamp ON user TYPE datetime DEFAULT ALWAYS time::now();
       DEFINE FIELD slug ON user TYPE string VALUE string::lowercase($value) ASSERT string::len($value) > 0 READONLY;
       DEFINE FIELD addr ON user TYPE object FLEXIBLE;
       DEFINE FIELD addr.city ON user TYPE string;
       DEFINE FIELD \`select\` ON user TYPE int;
       DEFINE FIELD \`a.b\` ON user TYPE int;
       DEFINE INDEX by_name ON user FIELDS name, nick UNIQUE;
       DEFINE INDEX by_city ON user FIELDS addr.city;
       DEFINE INDEX by_dot ON user FIELDS \`a.b\`;`,
    );

    const model = await readLiveSchema(db);
    const user = table(model.tables, 'user');
    const field = (...path: string[]) => user.fields.find((f) => JSON.stringify(f.path) === JSON.stringify(path));

    expect(field('name')).toEqual({ path: ['name'], kind: 'string' });
    expect(field('nick')?.default).toBe("'x'");
    expect(field('nick')?.defaultAlways).toBeUndefined();
    expect(field('stamp')?.defaultAlways).toBe(true);
    expect(field('slug')?.assert).toBeDefined();
    expect(field('slug')?.value).toBeDefined();
    expect(field('slug')?.readonly).toBe(true);
    expect(field('addr')?.flexible).toBe(true);
    expect(field('addr', 'city')?.kind).toBe('string');
    expect(field('select')?.kind).toBe('int');
    expect(field('a.b')?.kind).toBe('int');
    expect(field('name')).not.toHaveProperty('default');
    expect(field('name')).not.toHaveProperty('flexible');

    const index = (name: string) => user.indexes.find((i) => i.name === name)!;
    expect(index('by_name')).toEqual({ name: 'by_name', columns: [['name'], ['nick']], index: 'UNIQUE' });
    expect(index('by_city')).toEqual({ name: 'by_city', columns: [['addr', 'city']], index: '' });
    expect(index('by_dot').columns).toEqual([['a.b']]);
    expect(model.unmanaged).toEqual([]);
  });

  test('drops the element field an array or set parent implies, and keeps a hand-defined one', async () => {
    const db = await scratch('elements');
    await exec(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD tags ON t TYPE array<string>;
       DEFINE FIELD opt ON t TYPE option<array<int>>;
       DEFINE FIELD grid ON t TYPE array<array<int>>;
       DEFINE FIELD ids ON t TYPE set<string>;
       DEFINE FIELD checked ON t TYPE array<string>;
       DEFINE FIELD OVERWRITE checked.* ON t TYPE string ASSERT $value != 'x';
       DEFINE FIELD plain ON t TYPE array<string>;
       DEFINE FIELD OVERWRITE plain.* ON t TYPE string DEFAULT 'd';`,
    );

    const paths = table((await readLiveSchema(db)).tables, 't').fields.map((f) => JSON.stringify(f.path));

    expect(paths).toContain('["tags"]');
    expect(paths).toContain('["grid"]');
    for (const implied of ['["tags",{"element":true}]', '["opt",{"element":true}]', '["grid",{"element":true}]']) {
      expect(paths).not.toContain(implied);
    }
    expect(paths).not.toContain('["grid",{"element":true},{"element":true}]');
    expect(paths).not.toContain('["ids",{"element":true}]');
    expect(paths).toContain('["checked",{"element":true}]');
    expect(paths).toContain('["plain",{"element":true}]');
  });

  test('drops the FLEXIBLE element an array<object> FLEXIBLE parent implies, and keeps one the parent lacks', async () => {
    const db = await scratch('flexible_element');
    await exec(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD loose ON t TYPE array<object> FLEXIBLE;
       DEFINE FIELD strict ON t TYPE array<object>;
       DEFINE FIELD OVERWRITE strict.* ON t TYPE object FLEXIBLE;`,
    );

    const paths = table((await readLiveSchema(db)).tables, 't').fields.map((f) => JSON.stringify(f.path));

    expect(paths).not.toContain('["loose",{"element":true}]');
    expect(paths).toContain('["strict",{"element":true}]');
  });

  describe('4.0 shapes read with no false drift', () => {
    const DDL = [
      'DEFINE TABLE doc SCHEMAFULL',
      'DEFINE FIELD OVERWRITE pair ON TABLE doc TYPE [{ x: float, y: float }, { x: float, y: float }]',
      'DEFINE FIELD OVERWRITE deep ON TABLE doc TYPE [string, { name: string, age: option<int>, pos: [float, { payload: string }] }]',
      'DEFINE FIELD OVERWRITE loose ON TABLE doc TYPE [string, object] FLEXIBLE',
      "DEFINE FIELD OVERWRITE optPair ON TABLE doc TYPE option<[string, { grade: 'LOW' | 'HIGH' }]>",
      'DEFINE FIELD `after` ON TABLE doc TYPE string',
      'DEFINE FIELD `select` ON TABLE doc TYPE option<int>',
      'DEFINE FIELD items ON TABLE doc TYPE array<object>',
      'DEFINE FIELD items.*.sku ON TABLE doc TYPE string',
      'DEFINE FIELD items.*.qty ON TABLE doc TYPE int',
      'DEFINE INDEX by_sku ON TABLE doc FIELDS items.*.sku',
    ];
    const desired: SchemaModel = {
      tables: [
        {
          name: 'doc',
          fields: [
            buildFieldModel({ path: ['pair'], kind: '[{ x: float, y: float }, { x: float, y: float }]' }),
            buildFieldModel({
              path: ['deep'],
              kind: '[string, { name: string, age: option<int>, pos: [float, { payload: string }] }]',
            }),
            buildFieldModel({ path: ['loose'], kind: '[string, object]', flexible: true }),
            buildFieldModel({ path: ['optPair'], kind: "option<[string, { grade: 'LOW' | 'HIGH' }]>" }),
            buildFieldModel({ path: ['after'], kind: 'string' }),
            buildFieldModel({ path: ['select'], kind: 'option<int>' }),
            buildFieldModel({ path: ['items'], kind: 'array<object>' }),
            buildFieldModel({ path: ['items', { element: true }, 'sku'], kind: 'string' }),
            buildFieldModel({ path: ['items', { element: true }, 'qty'], kind: 'int' }),
          ],
          indexes: [],
        },
      ],
      unmanaged: [],
    };

    test('a freshly defined schema matches, and the implicit items.* field is not read as extra', async () => {
      const db = await scratch('shapes40');
      await exec(db, DDL.join(';\n'));

      const live = await readLiveSchema(db);
      const doc = table(live.tables, 'doc');
      const paths = doc.fields.map((f) => JSON.stringify(f.path));

      expect(live.unmanaged).toEqual([]);
      expect(paths).toContain('["after"]');
      expect(paths).toContain('["select"]');
      expect(paths).not.toContain('["items",{"element":true}]');
      expect(doc.fields.find((f) => f.path[0] === 'loose')?.flexible).toBe(true);
      const fieldDrift = diffSchema(desired, live, { managedTables: [] }).filter((d) => d.field);

      expect(fieldDrift).toEqual([]);
    });

    test('a real change to each shape is reported', async () => {
      const db = await scratch('shapes40_drift');
      await exec(
        db,
        DDL.join(';\n')
          .replace('{ x: float, y: float }, { x: float, y: float }]', '{ x: float, y: int }, { x: float, y: float }]')
          .replace('TYPE [string, object] FLEXIBLE', 'TYPE [string, object]')
          .replace('`after` ON TABLE doc TYPE string', '`after` ON TABLE doc TYPE int'),
      );

      const changed = diffSchema(desired, await readLiveSchema(db), { managedTables: [] })
        .filter((d) => d.kind === 'field-changed')
        .map((d) => `${d.field![0]}:${d.changes!.join(',')}`)
        .sort();

      expect(changed).toEqual(['after:kind', 'loose:flexible', 'pair:kind']);
    });
  });

  test('reports events, functions, params, table and field permissions and non-normal tables as unmanaged', async () => {
    const db = await scratch('unmanaged');
    await exec(
      db,
      `DEFINE TABLE a SCHEMAFULL;
       DEFINE FIELD x ON a TYPE int PERMISSIONS FOR select NONE;
       DEFINE EVENT ev ON a WHEN true THEN (1);
       DEFINE TABLE open SCHEMAFULL PERMISSIONS FULL;
       DEFINE TABLE rel TYPE RELATION;
       DEFINE FUNCTION fn::f() { RETURN 1 };
       DEFINE PARAM $p VALUE 1;`,
    );

    const { tables, unmanaged } = await readLiveSchema(db);

    expect(tables.map((t) => t.name)).toEqual(['a', 'open', 'rel']);
    expect(unmanaged).toEqual(
      expect.arrayContaining([
        { kind: 'functions', name: 'f' },
        { kind: 'params', name: 'p' },
        { kind: 'events', name: 'ev', table: 'a' },
        { kind: 'field-permissions', name: 'x', table: 'a' },
        { kind: 'table-permissions', name: 'open' },
        { kind: 'table-kind', name: 'rel' },
      ]),
    );
    expect(unmanaged.some((item) => item.name === 'a' && item.kind.startsWith('table'))).toBe(false);
  });

  test('leaves the state tables out', async () => {
    const db = await scratch('state');
    await exec(
      db,
      'DEFINE TABLE _cerial_migrations SCHEMAFULL; DEFINE TABLE _cerial_migration_lease SCHEMAFULL; DEFINE TABLE kept SCHEMAFULL;',
    );

    const model = await readLiveSchema(db);

    expect(model.tables.map((t) => t.name)).toEqual(['kept']);
  });

  test('a hostile table name reads back raw and is requested safely', async () => {
    const db = await scratch('hostile');
    const hostile = 'a`\n; REMOVE TABLE victim; --';
    await exec(
      db,
      `DEFINE TABLE victim SCHEMAFULL; DEFINE FIELD n ON victim TYPE int; CREATE victim:1 SET n = 1;
       DEFINE TABLE ${quoteIdent(hostile)} SCHEMAFULL;
       DEFINE FIELD ${quoteIdent('f`;\n')} ON ${quoteIdent(hostile)} TYPE int;
       DEFINE INDEX ${quoteIdent('i\n; REMOVE TABLE victim')} ON ${quoteIdent(hostile)} FIELDS ${quoteIdent('f`;\n')};`,
    );

    const { tables } = await readLiveSchema(db);

    expect(tables.map((t) => t.name).sort()).toEqual([hostile, 'victim'].sort());
    const read = table(tables, hostile);
    expect(read.fields.map((f) => f.path)).toEqual([['f`;\n']]);
    expect(read.indexes).toEqual([{ name: 'i\n; REMOVE TABLE victim', columns: [['f`;\n']], index: '' }]);
    const [rows] = await db.query<[{ n: number }[]]>('SELECT n FROM victim').collect();
    expect(rows).toEqual([{ n: 1 }]);
  });

  test('issues two requests however many tables there are', async () => {
    const db = await scratch('batch');
    await exec(db, Array.from({ length: 25 }, (_, i) => `DEFINE TABLE t${i} SCHEMAFULL;`).join(' '));
    let calls = 0;
    const counted = new Proxy(db, {
      get(target, prop) {
        if (prop === 'query') {
          calls++;

          return target.query.bind(target);
        }
        const value = Reflect.get(target, prop, target);

        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const { tables } = await readLiveSchema(counted);

    expect(tables).toHaveLength(25);
    expect(calls).toBe(2);
  });

  test('a failed statement throws CerialMigrationError naming it', async () => {
    const db = await scratch('failed');
    await exec(db, 'DEFINE TABLE t SCHEMAFULL;');
    const failing = {
      query: (text: string) => ({
        responses: async () => [
          text.startsWith('INFO FOR DB')
            ? { success: true, type: 'other', result: { tables: [{ name: 't', permissions: {} }] } }
            : { success: false, error: new Error('boom') },
        ],
      }),
    } as unknown as Surreal;

    const error = await readLiveSchema(failing).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as CerialMigrationError).statement?.text).toBe('INFO FOR TABLE `t` STRUCTURE');
  });

  test('a dropped connection stays a connection error', async () => {
    const db = await scratch('dropped');
    await db.close();

    const error = await readLiveSchema(db).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CerialMigrationError);
  });
});
