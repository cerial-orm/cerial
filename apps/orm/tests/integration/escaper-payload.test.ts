/**
 * The SDK's identifier escapers against a live statement, on a throwaway database of their own.
 *
 * Up to SDK 2.0.9, `escapeIdent` escaped the closing angle bracket but not the backslash, so `\⟩` ended the
 * identifier early and the rest of the value ran as code. On 2.2.1 the escapers escape the backslash along
 * with the closing quote, and quote a value holding `⟩` with backticks instead, so every payload here stays
 * inside its identifier. Each payload is shaped for its slot, aimed at the old angle-bracket quoting and at
 * the backtick quoting, and the control concatenates the same kind of value unescaped to prove the harness
 * sees an injection when one runs. The escapers are still not re-exported from the root entry: Cerial binds
 * values as parameters and passes identifiers through `sql.ident`, so concatenating escaped text is not a
 * path it offers.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { escapeIdent, escapeIdPart, RecordId, Surreal, Table } from 'surrealdb';

const DATABASE = `escaper_payload_${process.pid}_${Date.now()}`;

// Each slot gets one payload per quoting style: angle brackets closed by `\⟩`, and backticks closed by a
// bare and by a backslash-escaped backtick.
const IDENT_PAYLOADS = [
  'x\\⟩ FROM victim; DELETE victim; SELECT ⟨y',
  'x` FROM victim; DELETE victim; SELECT `y',
  'x\\` FROM victim; DELETE victim; SELECT `y',
] as const;
const ID_PAYLOADS = [
  'x\\⟩; DELETE victim; SELECT * FROM u:⟨y',
  'x`; DELETE victim; SELECT * FROM u:`y',
  'x\\`; DELETE victim; SELECT * FROM u:`y',
] as const;
const TABLE_PAYLOADS = [
  'x\\⟩; DELETE victim; SELECT * FROM ⟨y',
  'x`; DELETE victim; SELECT * FROM `y',
  'x\\`; DELETE victim; SELECT * FROM `y',
] as const;

let db: Surreal;

async function victimCount(): Promise<number> {
  const [rows] = await db.query<[{ n: number }[]]>('SELECT count() AS n FROM victim GROUP ALL').collect();

  return rows[0]?.n ?? 0;
}

/** Runs a statement the way a caller who concatenated a value would; a rejection is the outcome. */
async function run(statement: string): Promise<string | undefined> {
  try {
    await db.query(statement).collect();
  } catch (error) {
    return (error as Error).message;
  }
}

describe('SDK escapers against a payload', () => {
  beforeAll(async () => {
    db = new Surreal();
    await db.connect('http://127.0.0.1:8000', {
      namespace: 'main',
      authentication: { username: 'root', password: 'root' },
    });
    await db.query(`DEFINE DATABASE ${DATABASE}`).collect();
    await db.use({ namespace: 'main', database: DATABASE });
  });

  afterAll(async () => {
    if (!db) return;
    await db.use({ namespace: 'main' }).catch(() => {});
    await db
      .query(`REMOVE DATABASE IF EXISTS ${DATABASE}`)
      .collect()
      .catch(() => {});
    await db.close();
  });

  beforeEach(async () => {
    await db
      .query(
        'DEFINE TABLE IF NOT EXISTS victim SCHEMALESS; DEFINE TABLE IF NOT EXISTS u SCHEMALESS; DELETE victim; DELETE u; CREATE victim:1; CREATE u:1;',
      )
      .collect();
  });

  test('control: an unescaped payload concatenated into each slot runs the injected DELETE', async () => {
    expect(await victimCount()).toBe(1);
    await run(`SELECT ⟨${IDENT_PAYLOADS[0].replace('\\', '')}⟩ FROM u`);
    expect(await victimCount()).toBe(0);

    await run('CREATE victim:1');
    await run(`SELECT * FROM u:\`${ID_PAYLOADS[1]}\``);
    expect(await victimCount()).toBe(0);

    await run('CREATE victim:1');
    await run(`SELECT * FROM \`${TABLE_PAYLOADS[1]}\``);
    expect(await victimCount()).toBe(0);
  });

  test('control: a plain value leaves the victim', async () => {
    expect(await run(`SELECT ${escapeIdent('abc')} FROM u`)).toBeUndefined();
    expect(await run(`SELECT * FROM u:${escapeIdPart('abc')}`)).toBeUndefined();
    expect(await victimCount()).toBe(1);
  });

  test.each(IDENT_PAYLOADS)('escapeIdent keeps %p inside the column identifier', async (payload) => {
    expect(await run(`SELECT ${escapeIdent(payload)} FROM u`)).toBeUndefined();
    expect(await victimCount()).toBe(1);
  });

  test.each(ID_PAYLOADS)('escapeIdPart keeps %p inside the record id', async (payload) => {
    expect(await run(`SELECT * FROM u:${escapeIdPart(payload)}`)).toBeUndefined();
    expect(await victimCount()).toBe(1);
  });

  test.each(TABLE_PAYLOADS)('String(new Table(p)) keeps %p inside the table name', async (payload) => {
    // A missing table is an error, and it names the whole payload as the table.
    expect(await run(`SELECT * FROM ${String(new Table(payload))}`)).toContain(`The table '${payload}' does not exist`);
    expect(await victimCount()).toBe(1);
  });

  test.each(ID_PAYLOADS)("String(new RecordId('u', p)) keeps %p inside the record id", async (payload) => {
    expect(await run(`SELECT * FROM ${String(new RecordId('u', payload))}`)).toBeUndefined();
    expect(await victimCount()).toBe(1);
  });

  test('the escaped identifier names the payload itself, so the quoting round-trips', async () => {
    await run(`CREATE u:${escapeIdPart(ID_PAYLOADS[2])}`);
    const [rows] = await db.query<[{ id: RecordId }[]]>('SELECT id FROM u WHERE id != u:1').collect();

    expect(rows.map((row) => row.id.id)).toEqual([ID_PAYLOADS[2]]);
  });

  test('the same values bound as parameters leave the victim', async () => {
    await db.query('SELECT * FROM type::record($t, $id)', { t: 'u', id: ID_PAYLOADS[0] }).collect();
    await db.query('SELECT $v FROM u', { v: IDENT_PAYLOADS[0] }).collect();

    expect(await victimCount()).toBe(1);
  });
});
