/**
 * Facts about writes and record ids the ORM rests on, measured on SurrealDB 4.0.0: union id
 * generation, UPSERT ... WHERE, ONLY on a missing record, and writes to undefined tables.
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
  const results = await run(db, surql);
  const last = results[results.length - 1]!;
  expect(last.status).toBe('ERR');

  return String(last.result);
}

const count = async (table: string): Promise<number> =>
  ((await ok(`SELECT count() FROM ${table} GROUP ALL`)) as { count: number }[])[0]?.count ?? 0;

beforeAll(async () => {
  db = await withScratchDatabase('writes_and_ids');
});

afterAll(async () => {
  await db.remove();
});

describe('create with no id', () => {
  beforeAll(async () => {
    const results = await run(
      db,
      `DEFINE TABLE id_str SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id_str TYPE string;
       DEFINE TABLE id_uuid SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id_uuid TYPE uuid;
       DEFINE TABLE id_str_int SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id_str_int TYPE string | int;
       DEFINE TABLE id_uuid_int SCHEMAFULL; DEFINE FIELD OVERWRITE id ON id_uuid_int TYPE uuid | int;`,
    );
    expect(results.every((r) => r.status === 'OK')).toBe(true);
  });

  test('a plain string id is generated', async () => {
    const [row] = (await ok('CREATE id_str')) as { id: string }[];

    expect(String(row!.id)).toMatch(/^id_str:/);
  });

  test('a uuid id is generated', async () => {
    const [row] = (await ok('CREATE id_uuid')) as { id: string }[];

    expect(String(row!.id)).toMatch(/^id_uuid:u'[0-9a-f-]{36}'$/);
  });

  test('string | int is still refused with no id, naming the type', async () => {
    const message = await refused('CREATE id_str_int');

    expect(message).toContain('Cannot generate a record id of type `string | int`');
    expect(message).toContain('specify an explicit record id');
    expect(await count('id_str_int')).toBe(0);
  });

  test('uuid | int is still refused with no id', async () => {
    const message = await refused('CREATE id_uuid_int');

    expect(message).toContain('Cannot generate a record id of type `uuid | int`');
    expect(await count('id_uuid_int')).toBe(0);
  });

  test('an explicit id on a union id table is accepted, for either member', async () => {
    expect(await ok('CREATE id_str_int:7')).toEqual([{ id: expect.anything() }]);
    expect(await ok('CREATE id_str_int:abc')).toEqual([{ id: expect.anything() }]);
    expect(await ok('SELECT VALUE id FROM id_str_int ORDER BY id')).toHaveLength(2);
  });

  test('an id of a type outside the union is refused', async () => {
    const message = await refused('CREATE id_str_int:[1]');

    expect(message.length).toBeGreaterThan(0);
    expect(await count('id_str_int')).toBe(2);
  });
});

describe('UPSERT ... WHERE', () => {
  beforeAll(async () => {
    const results = await run(
      db,
      `DEFINE TABLE up SCHEMAFULL; DEFINE FIELD name ON up TYPE string;
       DEFINE FIELD n ON up TYPE int ASSERT $value > 0;`,
    );
    expect(results.every((r) => r.status === 'OK')).toBe(true);
  });

  test('matching zero rows creates one', async () => {
    const rows = (await ok("UPSERT up SET name = 'zero', n = 1 WHERE name = 'zero'")) as { name: string }[];

    expect(rows).toHaveLength(1);
    expect(await count('up')).toBe(1);
  });

  test('matching one row updates it and creates nothing', async () => {
    const before = await count('up');
    const rows = (await ok("UPSERT up SET name = 'zero', n = 2 WHERE name = 'zero'")) as { n: number }[];

    expect(rows).toHaveLength(1);
    expect(rows[0]!.n).toBe(2);
    expect(await count('up')).toBe(before);
  });

  test('matching two rows updates both and creates nothing', async () => {
    await ok("CREATE up SET name = 'dup', n = 1; CREATE up SET name = 'dup', n = 1;");
    const before = await count('up');
    const rows = (await ok("UPSERT up SET n = 9 WHERE name = 'dup'")) as { n: number }[];

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.n === 9)).toBe(true);
    expect(await count('up')).toBe(before);
  });

  test('a WHERE that cannot match still creates exactly one row', async () => {
    const before = await count('up');
    await ok("UPSERT up SET name = 'never', n = 1 WHERE name = 'a' AND name = 'b'");

    expect(await count('up')).toBe(before + 1);
  });

  test('a create that fails ASSERT is refused and stores nothing', async () => {
    const before = await count('up');
    const message = await refused("UPSERT up SET name = 'bad', n = -1 WHERE name = 'bad'");

    expect(message).toContain('must conform to: $value > 0');
    expect(await count('up')).toBe(before);
  });

  test('a create missing a required field is refused and stores nothing', async () => {
    const before = await count('up');
    const message = await refused("UPSERT up SET n = 5 WHERE name = 'nobody'");

    expect(message).toContain('Expected `string` but found `NONE`');
    expect(await count('up')).toBe(before);
  });
});

describe('ONLY on a missing record', () => {
  beforeAll(async () => {
    const results = await run(
      db,
      `DEFINE TABLE ow SCHEMAFULL; DEFINE FIELD name ON ow TYPE string; DEFINE FIELD n ON ow TYPE int;
       CREATE ow:1 SET name = 'a', n = 1; CREATE ow:2 SET name = 'a', n = 1;`,
    );
    expect(results.every((r) => r.status === 'OK')).toBe(true);
  });

  test('UPDATE ONLY by id answers null and creates nothing', async () => {
    expect(await ok('UPDATE ONLY ow:404 SET n = 1')).toBeNull();
    expect(await count('ow')).toBe(2);
  });

  test('UPDATE ONLY by id on an existing record answers the record', async () => {
    expect(await ok('UPDATE ONLY ow:1 SET n = 5')).toMatchObject({ n: 5 });
  });

  test('UPDATE ONLY with a WHERE matching nothing answers null', async () => {
    expect(await ok("UPDATE ONLY ow SET n = 3 WHERE name = 'nobody'")).toBeNull();
  });

  test('UPDATE ONLY with a WHERE matching two records is an error', async () => {
    expect(await refused("UPDATE ONLY ow SET n = 3 WHERE name = 'a'")).toBe(
      'Expected a single result output when using the ONLY keyword',
    );
  });

  test('UPSERT ONLY on a missing id creates it and answers the record', async () => {
    expect(await ok("UPSERT ONLY ow:405 SET name = 'x', n = 1")).toMatchObject({ name: 'x' });
    expect(await count('ow')).toBe(3);
  });

  test('UPSERT ONLY on a missing id that fails the schema is an error, not null', async () => {
    expect(await refused('UPSERT ONLY ow:406 SET n = 1')).toContain('Expected `string` but found `NONE`');
    expect(await count('ow')).toBe(3);
  });

  test('DELETE ONLY on a missing record answers null', async () => {
    expect(await ok('DELETE ONLY ow:404')).toBeNull();
  });

  test('SELECT FROM ONLY a missing record answers null', async () => {
    expect(await ok('SELECT * FROM ONLY ow:404')).toBeNull();
    expect(await ok('SELECT * FROM ONLY [ow:404]')).toBeNull();
    expect(await ok("SELECT * FROM ONLY ow WHERE name = 'nobody' LIMIT 1")).toBeNull();
  });

  test('SELECT FROM ONLY an existing record answers the object; without ONLY a missing one is []', async () => {
    expect(await ok('SELECT * FROM ONLY [ow:1]')).toMatchObject({ name: 'a' });
    expect(await ok('SELECT * FROM [ow:404]')).toEqual([]);
    expect(await ok('SELECT * FROM ow:404')).toEqual([]);
  });

  test('SELECT FROM ONLY a list of several existing records is an error, one existing and one missing is not', async () => {
    expect(await refused('SELECT * FROM ONLY [ow:1, ow:2]')).toBe(
      'Expected a single result output when using the ONLY keyword',
    );
    expect(await ok('SELECT * FROM ONLY [ow:1, ow:404]')).toMatchObject({ name: 'a' });
  });
});

describe('writes to an undefined table', () => {
  const tableNames = async (): Promise<string[]> =>
    Object.keys(((await ok('INFO FOR DB')) as { tables: Record<string, string> }).tables);

  test.each([
    ['CREATE', 'CREATE w_create SET a = 1', 'w_create'],
    ['CREATE with an id', 'CREATE w_create_id:1 SET a = 1', 'w_create_id'],
    ['UPSERT with an id', 'UPSERT w_upsert_id:1 SET a = 1', 'w_upsert_id'],
    ['UPSERT whole table', 'UPSERT w_upsert SET a = 1', 'w_upsert'],
    ['UPSERT with a WHERE', 'UPSERT w_upsert_where SET a = 1 WHERE a = 2', 'w_upsert_where'],
    ['INSERT', 'INSERT INTO w_insert { a: 1 }', 'w_insert'],
  ])('%s writes the row and defines the table schemaless', async (_label, surql, table) => {
    const rows = (await ok(surql)) as { a: number }[];

    expect(rows[0]!.a).toBe(1);
    expect(await tableNames()).toContain(table);
    expect(String(((await ok('INFO FOR DB')) as { tables: Record<string, string> }).tables[table!])).toContain(
      'SCHEMALESS',
    );
  });

  test.each([
    ['UPDATE by id', 'UPDATE w_upd:1 SET a = 1', 'w_upd'],
    ['UPDATE whole table', 'UPDATE w_upd_all SET a = 1', 'w_upd_all'],
    ['UPDATE ONLY by id', 'UPDATE ONLY w_upd_only:1 SET a = 1', 'w_upd_only'],
    ['DELETE by id', 'DELETE w_del:1', 'w_del'],
    ['SELECT by id', 'SELECT * FROM w_sel:1', 'w_sel'],
    ['SELECT ONLY by id', 'SELECT * FROM ONLY w_sel_only:1', 'w_sel_only'],
    ['SELECT whole table', 'SELECT * FROM w_sel_all', 'w_sel_all'],
  ])('%s is refused and defines nothing', async (_label, surql, table) => {
    expect(await refused(surql)).toBe(`The table '${table}' does not exist`);
    expect(await tableNames()).not.toContain(table);
  });

  test('a record id on an undefined table inside a list is refused too', async () => {
    expect(await refused('SELECT * FROM ONLY [w_list:1]')).toBe("The table 'w_list' does not exist");
  });

  test('a record link to an undefined table reads back without error', async () => {
    await ok('DEFINE TABLE holder SCHEMALESS; CREATE holder:1 SET ref = w_link:1');

    expect(await ok('SELECT VALUE ref FROM holder:1')).toEqual([expect.anything()]);
  });
});
