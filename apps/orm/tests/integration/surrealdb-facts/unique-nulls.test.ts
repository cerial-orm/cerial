/**
 * Facts about `DEFINE INDEX ... UNIQUE NULLS NOT DISTINCT` on SurrealDB 4.0: which values a plain
 * `UNIQUE` and the option compare on one field and on a composite, that `NONE` is never compared,
 * what `INFO FOR TABLE` reports so a migration reader can see the option, and what happens when the
 * option is added to or dropped from a live index. Each fact has a case that holds and one that is refused.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase, type StatementResult } from './helpers';

let db: ScratchDatabase;

beforeAll(async () => {
  db = await withScratchDatabase('unique_nulls');
});

afterAll(async () => {
  await db.remove();
});

/** The status of each statement, in order. */
function statuses(results: StatementResult[]): string[] {
  return results.map((result) => result.status);
}

/** A table with two nullable, optional columns, so each can hold a value, NULL or NONE. */
function nullableTable(table: string): string {
  return `DEFINE TABLE ${table} SCHEMAFULL;
    DEFINE FIELD a ON ${table} TYPE option<string | null>;
    DEFINE FIELD b ON ${table} TYPE option<string | null>;`;
}

/** The STRUCTURE row of every index on the table. */
async function indexRows(table: string): Promise<unknown[]> {
  const [info] = await run(db, `INFO FOR TABLE ${table} STRUCTURE;`);

  return (info!.result as { indexes: unknown[] }).indexes;
}

const DUPLICATE_NULL = 'already contains NULL';

describe('one field', () => {
  test('a plain UNIQUE index accepts two NULLs and two NONEs', async () => {
    const results = await run(
      db,
      `${nullableTable('p1')} DEFINE INDEX u ON p1 FIELDS a UNIQUE;
       CREATE p1:1 SET a = NULL; CREATE p1:2 SET a = NULL; CREATE p1:3; CREATE p1:4;`,
    );
    expect(statuses(results)).toEqual(Array(8).fill('OK'));
  });

  test('UNIQUE NULLS NOT DISTINCT refuses a second NULL, naming the index and the first record', async () => {
    const results = await run(
      db,
      `${nullableTable('n1')} DEFINE INDEX u ON n1 FIELDS a UNIQUE NULLS NOT DISTINCT;
       CREATE n1:1 SET a = NULL; CREATE n1:2 SET a = NULL;`,
    );
    expect(results[4]!.status).toBe('OK');
    expect(results[5]!.status).toBe('ERR');
    expect(String(results[5]!.result)).toBe('Database index `u` already contains NULL, with record `n1:1`');
  });

  test('UNIQUE NULLS NOT DISTINCT still accepts any number of NONEs, written absent or as NONE', async () => {
    const results = await run(
      db,
      `${nullableTable('n2')} DEFINE INDEX u ON n2 FIELDS a UNIQUE NULLS NOT DISTINCT;
       CREATE n2:1; CREATE n2:2; CREATE n2:3 SET a = NONE;`,
    );
    expect(statuses(results)).toEqual(Array(7).fill('OK'));
  });

  test('one NULL and any number of NONEs coexist under the option', async () => {
    const results = await run(
      db,
      `${nullableTable('n3')} DEFINE INDEX u ON n3 FIELDS a UNIQUE NULLS NOT DISTINCT;
       CREATE n3:1 SET a = NULL; CREATE n3:2; CREATE n3:3 SET a = NONE;`,
    );
    expect(statuses(results)).toEqual(Array(7).fill('OK'));
  });

  test('a repeated value is refused with or without the option', async () => {
    const results = await run(
      db,
      `${nullableTable('n4')} DEFINE INDEX u ON n4 FIELDS a UNIQUE NULLS NOT DISTINCT;
       CREATE n4:1 SET a = 'x'; CREATE n4:2 SET a = 'x';`,
    );
    expect(results[5]!.status).toBe('ERR');
    expect(String(results[5]!.result)).toContain("already contains 'x'");
  });

  test('UPDATE and UPSERT to a second NULL are refused; setting the first to NONE frees the slot', async () => {
    const results = await run(
      db,
      `${nullableTable('n5')} DEFINE INDEX u ON n5 FIELDS a UNIQUE NULLS NOT DISTINCT;
       CREATE n5:1 SET a = NULL; CREATE n5:2 SET a = 'x';
       UPDATE n5:2 SET a = NULL; UPSERT n5:3 SET a = NULL;
       UPDATE n5:1 SET a = NONE; CREATE n5:4 SET a = NULL;`,
    );
    expect(String(results[6]!.result)).toContain(DUPLICATE_NULL);
    expect(String(results[7]!.result)).toContain(DUPLICATE_NULL);
    expect(results[8]!.status).toBe('OK');
    expect(results[9]!.status).toBe('OK');
  });

  test('the option is accepted on a field that cannot hold NULL, where it changes nothing', async () => {
    const results = await run(
      db,
      `DEFINE TABLE n6 SCHEMAFULL; DEFINE FIELD s ON n6 TYPE option<string>;
       DEFINE INDEX u ON n6 FIELDS s UNIQUE NULLS NOT DISTINCT;
       CREATE n6:1; CREATE n6:2; CREATE n6:3 SET s = NULL;`,
    );
    expect(statuses(results).slice(0, 5)).toEqual(Array(5).fill('OK'));
    // The field type refuses NULL before the index sees it.
    expect(results[5]!.status).toBe('ERR');
    expect(String(results[5]!.result)).not.toContain('index');
  });

  test('on an object sub-field path a second NULL is refused and an absent key is NONE', async () => {
    const results = await run(
      db,
      `DEFINE TABLE n7 SCHEMAFULL; DEFINE FIELD o ON n7 TYPE option<object>;
       DEFINE FIELD o.x ON n7 TYPE option<string | null>;
       DEFINE INDEX u ON n7 FIELDS o.x UNIQUE NULLS NOT DISTINCT;
       CREATE n7:1 SET o = { x: NULL }; CREATE n7:2 SET o = { x: NULL };
       CREATE n7:3 SET o = {}; CREATE n7:4 SET o = {}; CREATE n7:5; CREATE n7:6;`,
    );
    expect(String(results[5]!.result)).toContain(DUPLICATE_NULL);
    expect(statuses(results).slice(6)).toEqual(Array(4).fill('OK'));
  });
});

describe('a composite', () => {
  test('a plain UNIQUE composite treats any NULL column as distinct', async () => {
    const results = await run(
      db,
      `${nullableTable('cp')} DEFINE INDEX u ON cp FIELDS a, b UNIQUE;
       CREATE cp:1 SET a = NULL, b = NULL; CREATE cp:2 SET a = NULL, b = NULL;
       CREATE cp:3 SET a = 'x', b = NULL; CREATE cp:4 SET a = 'x', b = NULL;`,
    );
    expect(statuses(results)).toEqual(Array(8).fill('OK'));
  });

  test('UNIQUE NULLS NOT DISTINCT refuses a repeated [NULL, NULL]', async () => {
    const results = await run(
      db,
      `${nullableTable('c1')} DEFINE INDEX u ON c1 FIELDS a, b UNIQUE NULLS NOT DISTINCT;
       CREATE c1:1 SET a = NULL, b = NULL; CREATE c1:2 SET a = NULL, b = NULL;`,
    );
    expect(results[5]!.status).toBe('ERR');
    expect(String(results[5]!.result)).toBe('Database index `u` already contains [NULL, NULL], with record `c1:1`');
  });

  test('UNIQUE NULLS NOT DISTINCT refuses a repeated value with one NULL column', async () => {
    const results = await run(
      db,
      `${nullableTable('c2')} DEFINE INDEX u ON c2 FIELDS a, b UNIQUE NULLS NOT DISTINCT;
       CREATE c2:1 SET a = 'x', b = NULL; CREATE c2:2 SET a = 'x', b = NULL;
       CREATE c2:3 SET a = NULL, b = 'y'; CREATE c2:4 SET a = NULL, b = 'y';`,
    );
    expect(String(results[5]!.result)).toContain("already contains ['x', NULL]");
    expect(String(results[7]!.result)).toContain("already contains [NULL, 'y']");
  });

  test('a NONE in any column leaves the tuple uncompared, under the option', async () => {
    const results = await run(
      db,
      `${nullableTable('c3')} DEFINE INDEX u ON c3 FIELDS a, b UNIQUE NULLS NOT DISTINCT;
       CREATE c3:1 SET a = 'x'; CREATE c3:2 SET a = 'x';
       CREATE c3:3 SET a = NULL; CREATE c3:4 SET a = NULL;
       CREATE c3:5 SET b = NULL; CREATE c3:6 SET b = NULL;
       CREATE c3:7; CREATE c3:8;`,
    );
    expect(statuses(results)).toEqual(Array(12).fill('OK'));
  });

  test('a repeated tuple of values is refused under the option', async () => {
    const results = await run(
      db,
      `${nullableTable('c4')} DEFINE INDEX u ON c4 FIELDS a, b UNIQUE NULLS NOT DISTINCT;
       CREATE c4:1 SET a = 'x', b = 'y'; CREATE c4:2 SET a = 'x', b = 'y';`,
    );
    expect(String(results[5]!.result)).toContain("already contains ['x', 'y']");
  });
});

describe('what INFO FOR TABLE reports', () => {
  beforeAll(async () => {
    await run(
      db,
      `${nullableTable('r1')}
       DEFINE INDEX plain ON r1 FIELDS a UNIQUE;
       DEFINE INDEX one ON r1 FIELDS a UNIQUE NULLS NOT DISTINCT;
       DEFINE INDEX two ON r1 FIELDS a, b UNIQUE NULLS NOT DISTINCT;
       DEFINE INDEX nonunique ON r1 FIELDS b;`,
    );
  });

  test('STRUCTURE carries the option as part of the index string, after UNIQUE', async () => {
    const rows = await indexRows('r1');
    expect(rows).toContainEqual({ name: 'plain', table: 'r1', cols: ['a'], index: 'UNIQUE' });
    expect(rows).toContainEqual({ name: 'one', table: 'r1', cols: ['a'], index: 'UNIQUE NULLS NOT DISTINCT' });
    expect(rows).toContainEqual({ name: 'two', table: 'r1', cols: ['a', 'b'], index: 'UNIQUE NULLS NOT DISTINCT' });
    expect(rows).toContainEqual({ name: 'nonunique', table: 'r1', cols: ['b'], index: '' });
  });

  test('the text form ends with the option, and COLUMNS reads back as FIELDS', async () => {
    const [info] = await run(db, 'INFO FOR TABLE r1;');
    const indexes = (info!.result as { indexes: Record<string, string> }).indexes;
    expect(indexes.one).toBe('DEFINE INDEX one ON r1 FIELDS a UNIQUE NULLS NOT DISTINCT');
    expect(indexes.two).toBe('DEFINE INDEX two ON r1 FIELDS a, b UNIQUE NULLS NOT DISTINCT');
  });

  test('IF NOT EXISTS and COLUMNS are accepted with the option and read back the same', async () => {
    await run(
      db,
      `${nullableTable('r2')} DEFINE INDEX IF NOT EXISTS u ON TABLE r2 COLUMNS a UNIQUE NULLS NOT DISTINCT;`,
    );
    expect(await indexRows('r2')).toEqual([
      { name: 'u', table: 'r2', cols: ['a'], index: 'UNIQUE NULLS NOT DISTINCT' },
    ]);
  });
});

describe('the grammar', () => {
  test('NULLS NOT DISTINCT without UNIQUE is a parse error that runs nothing', async () => {
    await expect(run(db, `${nullableTable('g1')} DEFINE INDEX u ON g1 FIELDS a NULLS NOT DISTINCT;`)).rejects.toThrow(
      'Parse error',
    );
    expect(await indexRows('g1')).toEqual([]);
  });

  test('UNIQUE NULLS DISTINCT, the explicit default, is a parse error', async () => {
    await expect(
      run(db, `${nullableTable('g2')} DEFINE INDEX u ON g2 FIELDS a UNIQUE NULLS DISTINCT;`),
    ).rejects.toThrow('expected NOT');
  });
});

describe('adding or dropping the option on a live index', () => {
  test('OVERWRITE adding the option over two stored NULLs is refused and leaves the old index', async () => {
    const results = await run(
      db,
      `${nullableTable('a1')} CREATE a1:1 SET a = NULL; CREATE a1:2 SET a = NULL;
       DEFINE INDEX u ON a1 FIELDS a UNIQUE;
       DEFINE INDEX OVERWRITE u ON a1 FIELDS a UNIQUE NULLS NOT DISTINCT;`,
    );
    expect(results[5]!.status).toBe('OK');
    expect(String(results[6]!.result)).toBe('Database index `u` already contains NULL, with record `a1:1`');
    expect(await indexRows('a1')).toEqual([{ name: 'u', table: 'a1', cols: ['a'], index: 'UNIQUE' }]);
  });

  test('OVERWRITE adding the option over one stored NULL and many NONEs succeeds', async () => {
    const results = await run(
      db,
      `${nullableTable('a2')} CREATE a2:1 SET a = NULL; CREATE a2:2; CREATE a2:3;
       DEFINE INDEX u ON a2 FIELDS a UNIQUE;
       DEFINE INDEX OVERWRITE u ON a2 FIELDS a UNIQUE NULLS NOT DISTINCT;`,
    );
    expect(statuses(results)).toEqual(Array(8).fill('OK'));
    expect(await indexRows('a2')).toEqual([
      { name: 'u', table: 'a2', cols: ['a'], index: 'UNIQUE NULLS NOT DISTINCT' },
    ]);
  });

  test('a fresh DEFINE INDEX with the option over two stored NULLs is refused, inside a transaction too', async () => {
    const results = await run(
      db,
      `${nullableTable('a3')} CREATE a3:1 SET a = NULL; CREATE a3:2 SET a = NULL;
       BEGIN; DEFINE INDEX u ON a3 FIELDS a UNIQUE NULLS NOT DISTINCT; COMMIT;`,
    );
    expect(String(results[6]!.result)).toContain(DUPLICATE_NULL);
    expect(results[7]!.status).toBe('ERR');
    expect(await indexRows('a3')).toEqual([]);
  });

  test('OVERWRITE dropping the option always succeeds and a second NULL is then accepted', async () => {
    const results = await run(
      db,
      `${nullableTable('d1')} DEFINE INDEX u ON d1 FIELDS a UNIQUE NULLS NOT DISTINCT;
       CREATE d1:1 SET a = NULL; CREATE d1:2 SET a = NULL;
       DEFINE INDEX OVERWRITE u ON d1 FIELDS a UNIQUE;
       CREATE d1:3 SET a = NULL;`,
    );
    expect(String(results[5]!.result)).toContain(DUPLICATE_NULL);
    expect(results[6]!.status).toBe('OK');
    expect(results[7]!.status).toBe('OK');
    expect(await indexRows('d1')).toEqual([{ name: 'u', table: 'd1', cols: ['a'], index: 'UNIQUE' }]);
  });
});
