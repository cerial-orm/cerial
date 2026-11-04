/**
 * Facts about `OVERWRITE`: a table-level overwrite keeps its children, a field-level
 * overwrite replaces only that definition, and neither touches stored rows.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

interface TableInfo {
  fields: Record<string, string>;
  indexes: Record<string, string>;
}

let db: ScratchDatabase;

async function info(): Promise<TableInfo> {
  const [result] = await run(db, 'INFO FOR TABLE t;');

  return result!.result as TableInfo;
}

beforeAll(async () => {
  db = await withScratchDatabase('overwrite');
});

afterAll(async () => {
  await db.remove();
});

describe('OVERWRITE does not cascade', () => {
  test('DEFINE TABLE OVERWRITE keeps every field and index defined before it', async () => {
    const results = await run(
      db,
      `DEFINE TABLE t SCHEMAFULL;
       DEFINE FIELD a ON t TYPE string;
       DEFINE FIELD b ON t TYPE int;
       DEFINE INDEX ia ON t FIELDS a UNIQUE;
       DEFINE INDEX ib ON t FIELDS b;
       DEFINE TABLE OVERWRITE t SCHEMAFULL;`,
    );
    expect(results.map((r) => r.status)).toEqual(Array(6).fill('OK'));

    const after = await info();
    expect(Object.keys(after.fields).sort()).toEqual(['a', 'b']);
    expect(Object.keys(after.indexes).sort()).toEqual(['ia', 'ib']);
    expect(after.indexes.ia).toContain('UNIQUE');
  });

  test('DEFINE FIELD OVERWRITE replaces that one definition and leaves siblings alone', async () => {
    const before = await info();
    const [overwritten] = await run(db, 'DEFINE FIELD OVERWRITE a ON t TYPE int;');
    expect(overwritten!.status).toBe('OK');

    const after = await info();
    expect(after.fields.a).toContain('TYPE int');
    expect(after.fields.a).not.toBe(before.fields.a);
    expect(after.fields.b).toBe(before.fields.b);
    expect(after.indexes).toEqual(before.indexes);
  });

  // Changed on 4.0 (compatibility level 4): 3.3.0 accepted the change and left the stored row alone.
  test('DEFINE FIELD OVERWRITE with a new type over rows is refused and changes neither the row nor the read', async () => {
    await run(db, 'DEFINE TABLE r SCHEMAFULL; DEFINE FIELD OVERWRITE s ON r TYPE string; CREATE r:1 SET s = "text";');
    const [before] = await run(db, 'SELECT * FROM r;');

    const [overwritten] = await run(db, 'DEFINE FIELD OVERWRITE s ON r TYPE int;');
    expect(overwritten!.status).toBe('ERR');
    expect(String(overwritten!.result)).toContain('MIGRATE EXISTING ROWS');

    const [after] = await run(db, 'SELECT * FROM r;');
    expect(after!.result).toEqual(before!.result);
    expect((after!.result as { s: unknown }[])[0]!.s).toBe('text');
  });
});

describe('scratch database lifecycle', () => {
  test('a removed scratch database is gone from the namespace', async () => {
    const throwaway = await withScratchDatabase('lifecycle');
    expect(await throwaway.exists()).toBe(true);

    await throwaway.remove();
    expect(await throwaway.exists()).toBe(false);
  });

  test('the suite database is listed while its tests run', async () => {
    expect(await db.exists()).toBe(true);
  });
});
