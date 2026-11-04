/**
 * Facts about reserved words as names on SurrealDB 4.0. The v4.0.0 `RESERVED_KEYWORD` set in
 * `common/src/keywords.rs` is word for word the 3.3.0 one (44 words), but the 4.0 parser reads keywords
 * by position, so what a word can name is measured here: as a field, as a table and inside an expression,
 * bare and quoted. Enum names never reach the database, so an enum is covered by its members being
 * quoted string literals.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

let db: ScratchDatabase;

beforeAll(async () => {
  db = await withScratchDatabase('keywords');
});

afterAll(async () => {
  await db.remove();
});

type Quote = (name: string) => string;
const bare: Quote = (name) => name;
const quoted: Quote = (name) => `\`${name}\``;

/** True when every statement ran; a parse error comes back as an HTTP 400 and counts as refused. */
async function succeeds(surql: string): Promise<boolean> {
  try {
    return (await run(db, surql)).every((result) => result.status === 'OK');
  } catch {
    return false;
  }
}

/** Defines, writes, reads and filters on a field called `name`, then confirms the stored name. */
async function fieldWorks(name: string, q: Quote): Promise<boolean> {
  const table = `f_${name}`;
  const ok = await succeeds(
    `REMOVE TABLE IF EXISTS ${table}; DEFINE TABLE ${table} SCHEMAFULL; DEFINE FIELD ${q(name)} ON ${table} TYPE option<int>;
     CREATE ${table}:1 SET ${q(name)} = 1; SELECT ${q(name)} FROM ${table}; SELECT * FROM ${table} WHERE ${q(name)} = 1;`,
  );
  if (!ok) return false;
  const [info] = await run(db, `INFO FOR TABLE ${table} STRUCTURE;`);
  const fields = (info!.result as { fields: { name: string }[] }).fields;

  return fields.some((field) => field.name.replaceAll('`', '') === name);
}

/** Defines a table called `name`, writes a row, and reads it back; the stored name must be `name`. */
async function tableWorks(name: string, q: Quote): Promise<boolean> {
  const ok = await succeeds(
    `REMOVE TABLE IF EXISTS ${q(name)}; DEFINE TABLE ${q(name)} SCHEMAFULL; DEFINE FIELD a ON ${q(name)} TYPE option<int>;
     CREATE ${q(name)}:1 SET a = 1; SELECT a FROM ${q(name)}; SELECT * FROM ${q(name)};`,
  );
  if (!ok) return false;
  const [info] = await run(db, 'INFO FOR DB;');
  const tables = Object.keys((info!.result as { tables: Record<string, string> }).tables);

  return tables.some((table) => table.replaceAll('`', '').toLowerCase() === name);
}

/**
 * Uses a field called `name` in arithmetic, `ORDER BY` and an `UPDATE ... SET` that reads it. The sum must
 * come back as the field plus one: a word the parser reads as a clause can parse and answer something else.
 */
async function expressionWorks(name: string, q: Quote): Promise<boolean> {
  const table = `x_${name}`;
  try {
    const results = await run(
      db,
      `REMOVE TABLE IF EXISTS ${table}; DEFINE TABLE ${table} SCHEMAFULL; DEFINE FIELD ${q(name)} ON ${table} TYPE option<int>;
       CREATE ${table}:1 SET ${q(name)} = 2; SELECT ${q(name)} + 1 AS s FROM ${table};
       SELECT * FROM ${table} ORDER BY ${q(name)}; UPDATE ${table} SET ${q(name)} = ${q(name)} + 1;`,
    );

    return results.every((result) => result.status === 'OK') && JSON.stringify(results[4]!.result) === '[{"s":3}]';
  } catch {
    return false;
  }
}

// Words the v4.0.0 source set and the project's extras both list, split by what 4.0 does with them.
const STATEMENT_WORDS = [
  'alter',
  'break',
  'continue',
  'create',
  'define',
  'delete',
  'false',
  'for',
  'function',
  'if',
  'info',
  'insert',
  'let',
  'none',
  'null',
  'rebuild',
  'relate',
  'remove',
  'return',
  'select',
  'sleep',
  'throw',
  'true',
  'update',
  'upsert',
];

/** In the v4.0.0 source set or the project's extras, yet usable bare as a field, a table and in expressions. */
const USABLE_WORDS = [
  'access',
  'after',
  'all',
  'and',
  'as',
  'before',
  'begin',
  'by',
  'cancel',
  'commit',
  'contains',
  'content',
  'diff',
  'else',
  'end',
  'fetch',
  'field',
  'from',
  'full',
  'group',
  'in',
  'index',
  'inside',
  'intersects',
  'is',
  'kill',
  'limit',
  'live',
  'merge',
  'not',
  'on',
  'option',
  'or',
  'order',
  'outside',
  'parallel',
  'patch',
  'sequence',
  'set',
  'show',
  'start',
  'tb',
  'then',
  'timeout',
  'type',
  'use',
  'where',
];

describe('statement-starting words and literals', () => {
  test.each(STATEMENT_WORDS)('%s is refused bare as a field, a table and in an expression', async (word) => {
    expect(await fieldWorks(word, bare)).toBe(false);
    expect(await tableWorks(word, bare)).toBe(false);
    expect(await expressionWorks(word, bare)).toBe(false);
  });

  test.each(STATEMENT_WORDS)('%s works once quoted as a field and as a table', async (word) => {
    expect(await fieldWorks(word, quoted)).toBe(true);
    expect(await tableWorks(word, quoted)).toBe(true);
  });
});

describe('words that 4.0 accepts bare although the 3.3.0 set or the project lists them', () => {
  test.each(USABLE_WORDS)('%s works bare as a field, a table and in an expression', async (word) => {
    expect(await fieldWorks(word, bare)).toBe(true);
    expect(await tableWorks(word, bare)).toBe(true);
    expect(await expressionWorks(word, bare)).toBe(true);
  });

  test('and, or, not, in, is and contains still work as operators beside a field of the same name', async () => {
    const results = await run(
      db,
      `DEFINE TABLE ops SCHEMAFULL;
       DEFINE FIELD and ON ops TYPE option<int>; DEFINE FIELD or ON ops TYPE option<bool>; DEFINE FIELD in ON ops TYPE option<int>;
       CREATE ops:1 SET and = 1, or = true, in = 2;
       SELECT * FROM ops WHERE and = 1 AND in = 2 OR or = false;
       SELECT * FROM ops WHERE and = 9 AND in = 9;`,
    );
    expect(results.map((result) => result.status)).toEqual(['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'OK']);
    expect((results[5]!.result as unknown[]).length).toBe(1);
    expect((results[6]!.result as unknown[]).length).toBe(0);
  });
});

describe('words that are refused only in some positions', () => {
  test('rand works as a field and a table but not inside an expression', async () => {
    expect(await fieldWorks('rand', bare)).toBe(true);
    expect(await tableWorks('rand', bare)).toBe(true);
    expect(await expressionWorks('rand', bare)).toBe(false);
    expect(await expressionWorks('rand', quoted)).toBe(true);
  });

  test('value is refused as a field, reads as the VALUE clause in an expression, and names a table', async () => {
    expect(await fieldWorks('value', bare)).toBe(false);
    expect(await expressionWorks('value', bare)).toBe(false);
    expect(await tableWorks('value', bare)).toBe(true);
    expect(await fieldWorks('value', quoted)).toBe(true);
  });

  test.each(['only', 'table'])('%s names a field but not a table', async (word) => {
    expect(await fieldWorks(word, bare)).toBe(true);
    expect(await expressionWorks(word, bare)).toBe(true);
    expect(await tableWorks(word, bare)).toBe(false);
    expect(await tableWorks(word, quoted)).toBe(true);
  });
});

describe('words in neither the 3.3.0 set nor the project list that 4.0 still refuses', () => {
  test('explain is refused bare as a field, a table and in an expression, in any case', async () => {
    for (const word of ['explain', 'EXPLAIN', 'Explain']) {
      expect(await fieldWorks(word, bare)).toBe(false);
      expect(await expressionWorks(word, bare)).toBe(false);
    }
    expect(await tableWorks('explain', bare)).toBe(false);
  });

  test('explain works once quoted', async () => {
    expect(await fieldWorks('explain', quoted)).toBe(true);
    expect(await tableWorks('explain', quoted)).toBe(true);
    expect(await expressionWorks('explain', quoted)).toBe(true);
  });

  test('overwrite is refused bare as a field and in an expression but names a table', async () => {
    expect(await fieldWorks('overwrite', bare)).toBe(false);
    expect(await expressionWorks('overwrite', bare)).toBe(false);
    expect(await tableWorks('overwrite', bare)).toBe(true);
  });

  test('overwrite works once quoted as a field', async () => {
    expect(await fieldWorks('overwrite', quoted)).toBe(true);
    expect(await expressionWorks('overwrite', quoted)).toBe(true);
  });

  test('a definition clause word such as comment or permissions is not refused as a field', async () => {
    for (const word of ['comment', 'permissions', 'readonly', 'default', 'assert', 'flexible']) {
      expect(await fieldWorks(word, bare)).toBe(true);
    }
  });
});

describe('keywords as enum members', () => {
  test('are accepted as quoted string literal members of a field type and rejected when unlisted', async () => {
    const [, defined, created, wrong] = await run(
      db,
      `DEFINE TABLE en SCHEMAFULL;
       DEFINE FIELD kind ON en TYPE 'select' | 'update' | 'explain' | 'overwrite';
       CREATE en:1 SET kind = 'explain';
       CREATE en:2 SET kind = 'delete';`,
    );
    expect(defined!.status).toBe('OK');
    expect(created!.status).toBe('OK');
    expect(wrong!.status).toBe('ERR');
  });
});
