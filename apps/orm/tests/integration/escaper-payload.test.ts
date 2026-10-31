/**
 * The SDK's identifier escapers against a live statement, on a throwaway database of their own.
 *
 * `escapeIdent` escapes the closing angle bracket but not the backslash, so a value ending the identifier
 * early reaches the statement as code. The payloads here run the escapers' output through the server to show
 * what they do, which is why the root entry no longer re-exports them. Each payload is shaped for its slot:
 * the same string in a slot that parses it as a second `FROM` is only a parse error.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { escapeIdent, escapeIdPart, RecordId, Surreal, Table } from 'surrealdb';

const DATABASE = `escaper_payload_${process.pid}_${Date.now()}`;

// `\⟩` closes the angle-bracket quoting early: the backslash is not itself escaped.
const IDENT_PAYLOAD = 'x\\⟩ FROM victim; DELETE victim; SELECT ⟨y';
const ID_PAYLOAD = 'x\\⟩; DELETE victim; SELECT * FROM u:⟨y';
const TABLE_PAYLOAD = 'x\\⟩; DELETE victim; SELECT * FROM ⟨y';

let db: Surreal;

async function victimCount(): Promise<number> {
  const [rows] = await db.query<[{ n: number }[]]>('SELECT count() AS n FROM victim GROUP ALL').collect();

  return rows[0]?.n ?? 0;
}

/** Runs a statement the way a caller who concatenated an escaped value would; a rejection is the outcome. */
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

  test('control: a plain value leaves the victim, so the harness can tell', async () => {
    expect(await run(`SELECT ${escapeIdent('abc')} FROM u`)).toBeUndefined();
    expect(await run(`SELECT * FROM u:${escapeIdPart('abc')}`)).toBeUndefined();
    expect(await victimCount()).toBe(1);
  });

  test('escapeIdent in a column slot runs the injected DELETE', async () => {
    expect(await victimCount()).toBe(1);

    await run(`SELECT ${escapeIdent(IDENT_PAYLOAD)} FROM u`);

    expect(await victimCount()).toBe(0);
  });

  test('escapeIdPart in a record-id slot runs the injected DELETE', async () => {
    // The column payload is only a parse error here, because the id slot cannot take a second FROM.
    expect(await run(`SELECT * FROM u:${escapeIdPart(IDENT_PAYLOAD)}`)).toContain('Parse error');
    expect(await victimCount()).toBe(1);

    await run(`SELECT * FROM u:${escapeIdPart(ID_PAYLOAD)}`);

    expect(await victimCount()).toBe(0);
  });

  test('String(new Table(p)) in a table slot runs the injected DELETE', async () => {
    expect(await run(`SELECT * FROM ${String(new Table(IDENT_PAYLOAD))}`)).toContain('Parse error');
    expect(await victimCount()).toBe(1);

    await run(`SELECT * FROM ${String(new Table(TABLE_PAYLOAD))}`);

    expect(await victimCount()).toBe(0);
  });

  test("String(new RecordId('u', p)) in a record-id slot runs the injected DELETE", async () => {
    expect(await run(`SELECT * FROM ${String(new RecordId('u', IDENT_PAYLOAD))}`)).toContain('Parse error');
    expect(await victimCount()).toBe(1);

    await run(`SELECT * FROM ${String(new RecordId('u', ID_PAYLOAD))}`);

    expect(await victimCount()).toBe(0);
  });

  test('the same values bound as parameters leave the victim', async () => {
    await db.query('SELECT * FROM type::record($t, $id)', { t: 'u', id: ID_PAYLOAD }).collect();
    await db.query('SELECT $v FROM u', { v: IDENT_PAYLOAD }).collect();

    expect(await victimCount()).toBe(1);
  });
});
