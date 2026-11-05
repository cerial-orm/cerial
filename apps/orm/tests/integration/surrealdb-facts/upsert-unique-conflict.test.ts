/**
 * Facts about an UPSERT whose new row hits a unique index on SurrealDB 4.0. With a WHERE that matches
 * nothing, the server retries the write as an update of the conflicting row, which the WHERE filters
 * out: the statement is OK, returns no row and writes nothing. CREATE and UPSERT by record id refuse
 * the same row. The builder therefore creates through a CREATE that reuses the UPSERT's SET clauses,
 * which holds because `$this` is NONE throughout a CREATE's SET.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

let db: ScratchDatabase;

beforeAll(async () => {
  db = await withScratchDatabase('upsert_unique_conflict');
});

afterAll(async () => {
  await db.remove();
});

/** A table keyed by email, with a second unique column, seeded with one row holding nick 'x'. */
function seeded(table: string): string {
  return `DEFINE TABLE ${table} SCHEMAFULL;
    DEFINE FIELD email ON ${table} TYPE string;
    DEFINE FIELD nick ON ${table} TYPE option<string>;
    DEFINE INDEX ${table}_email ON ${table} FIELDS email UNIQUE;
    DEFINE INDEX ${table}_nick ON ${table} FIELDS nick UNIQUE;
    CREATE ${table}:seed SET email = 'seed', nick = 'x';`;
}

async function rows(table: string): Promise<unknown> {
  const [result] = await run(db, `SELECT email, nick FROM ${table} ORDER BY email;`);

  return result!.result;
}

const SEED_ONLY = [{ email: 'seed', nick: 'x' }];

describe('UPSERT ... WHERE whose create path conflicts', () => {
  test('is OK, returns no row and writes nothing', async () => {
    await run(db, seeded('w1'));
    const [only, many] = await run(
      db,
      `UPSERT ONLY w1 SET email = 'new', nick = 'x' WHERE email = 'new' RETURN *;
       UPSERT w1 SET email = 'new', nick = 'x' WHERE email = 'new' RETURN *;`,
    );

    expect(only!.status).toBe('OK');
    expect(only!.result).toBeNull();
    expect(many!.status).toBe('OK');
    expect(many!.result).toEqual([]);
    expect(await rows('w1')).toEqual(SEED_ONLY);
  });

  test('without the conflict it creates the row', async () => {
    await run(db, seeded('w2'));
    const [result] = await run(db, `UPSERT ONLY w2 SET email = 'new', nick = 'y' WHERE email = 'new' RETURN email;`);

    expect(result!.result).toEqual({ email: 'new' });
    expect(await rows('w2')).toEqual([
      { email: 'new', nick: 'y' },
      { email: 'seed', nick: 'x' },
    ]);
  });

  test('with no WHERE, the conflict updates the row it collides with', async () => {
    await run(db, seeded('w3'));
    const [result] = await run(db, `UPSERT w3 SET email = 'new', nick = 'x' RETURN id, email;`);

    expect(result!.result).toEqual([{ id: 'w3:seed', email: 'new' }]);
  });
});

describe('the writes that refuse the same row', () => {
  test('CREATE raises the unique violation', async () => {
    await run(db, seeded('r1'));
    const [result] = await run(db, `CREATE r1 SET email = 'new', nick = 'x';`);

    expect(result!.status).toBe('ERR');
    expect(String(result!.result)).toMatch(/^Database index `r1_nick` already contains 'x', with record `r1:seed`$/);
    expect(await rows('r1')).toEqual(SEED_ONLY);
  });

  test('UPSERT by record id raises the unique violation', async () => {
    await run(db, seeded('r2'));
    const [result] = await run(db, `UPSERT ONLY r2:new SET email = 'new', nick = 'x';`);

    expect(result!.status).toBe('ERR');
    expect(String(result!.result)).toContain('Database index `r2_nick` already contains');
    expect(await rows('r2')).toEqual(SEED_ONLY);
  });
});

describe('$this in a CREATE SET', () => {
  test('is NONE in every clause, so IF $this == NONE takes the create value after earlier fields are set', async () => {
    await run(db, seeded('t1'));
    const [result] = await run(
      db,
      `CREATE ONLY t1 SET email = IF $this == NONE THEN 'c' ELSE 'u' END,
         nick = IF $this == NONE THEN 'cn' ELSE 'un' END RETURN email, nick;`,
    );

    expect(result!.result).toEqual({ email: 'c', nick: 'cn' });
  });

  test('is not NONE when the CREATE names its record id', async () => {
    await run(db, seeded('t2'));
    const [result] = await run(
      db,
      `CREATE ONLY t2:named SET email = 'e', nick = IF $this == NONE THEN 'cn' ELSE 'un' END RETURN nick;`,
    );

    expect(result!.result).toEqual({ nick: 'un' });
  });
});

describe('the branching transaction the builder emits', () => {
  const branching = (table: string, email: string, nick: string) => `BEGIN TRANSACTION;
    LET $up_matched = (SELECT id FROM ${table} WHERE email = '${email}' LIMIT 1)[0];
    LET $up_result = IF $up_matched {
      UPSERT ONLY ${table} SET email = IF $this == NONE THEN '${email}' ELSE email END,
        nick = IF $this == NONE THEN '${nick}' ELSE 'upd' END WHERE email = '${email}' RETURN email, nick
    } ELSE {
      CREATE ONLY ${table} SET email = IF $this == NONE THEN '${email}' ELSE email END,
        nick = IF $this == NONE THEN '${nick}' ELSE 'upd' END RETURN email, nick
    };
    COMMIT TRANSACTION;
    RETURN $up_result;`;

  test('raises the violation when the create path conflicts, and writes nothing', async () => {
    await run(db, seeded('b1'));
    const results = await run(db, branching('b1', 'new', 'x'));

    expect(results.some((r) => r.status === 'ERR' && String(r.result).includes('`b1_nick` already contains'))).toBe(
      true,
    );
    expect(await rows('b1')).toEqual(SEED_ONLY);
  });

  test('creates when nothing matches and updates when the WHERE matches', async () => {
    await run(db, seeded('b2'));
    const created = await run(db, branching('b2', 'new', 'y'));
    expect(created.at(-1)!.result).toEqual({ email: 'new', nick: 'y' });

    const updated = await run(db, branching('b2', 'seed', 'z'));
    expect(updated.at(-1)!.result).toEqual({ email: 'seed', nick: 'upd' });
  });
});
