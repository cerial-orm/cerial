/**
 * The removal plan against hostile names: every identifier read back from a live schema is quoted on its way into
 * a `REMOVE`, so executing the plan removes exactly the hostile constructs and nothing else, and the plan written as
 * comments runs nothing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import {
  buildMigrationPlan,
  commentOut,
  diffSchema,
  readLiveSchema,
  type MigrationPlan,
  type SchemaModel,
} from '../../src/migrations';
import { NAME_CASES, quote, quotePath } from './surrealdb-facts/hostile-names';
import { run, withScratchDatabase, type ScratchDatabase } from './surrealdb-facts/helpers';

const URL = 'http://127.0.0.1:8000';
const COMMENTED = ['LF', 'CR', 'NEL', 'LS', 'PS'];

let scratch: ScratchDatabase;
let surreal: Surreal;

async function ok(surql: string): Promise<void> {
  const results = await run(scratch, surql);
  expect(results.map((r) => r.status)).toEqual(results.map(() => 'OK'));
}

/** Per hostile name: a table, a field and an index of that name; plus the survivors `victim` and `host`. */
async function seed(names: readonly string[]): Promise<void> {
  const info = await run(scratch, 'INFO FOR DB;');
  const tables = Object.keys((info[0]!.result as { tables: Record<string, string> }).tables);
  await ok(tables.map((t) => `REMOVE TABLE ${quote(t)};`).join('\n') || 'RETURN 1;');
  await ok(`
    DEFINE TABLE victim SCHEMAFULL;
    DEFINE FIELD v ON victim TYPE int;
    DEFINE FIELD w ON victim TYPE string;
    CREATE victim:1 SET v = 1, w = 'kept';
    DEFINE TABLE host SCHEMAFULL;
    DEFINE FIELD sibling ON host TYPE string;`);
  for (const name of names) {
    await ok(`
      DEFINE TABLE ${quote(name)} SCHEMAFULL;
      DEFINE FIELD inner ON ${quote(name)} TYPE string;
      DEFINE INDEX ${quote(name)} ON ${quote(name)} FIELDS inner;
      DEFINE FIELD ${quotePath(name)} ON host TYPE string;
      DEFINE INDEX ${quote(name)} ON host FIELDS sibling;`);
  }
}

/** Reads live, diffs against a desired schema of `victim` and `host` alone, and plans the removals. */
async function planRemovals(names: readonly string[]): Promise<MigrationPlan> {
  const live = await readLiveSchema(surreal);
  const keep = (table: string) => live.tables.find((t) => t.name === table)!;
  const sibling = keep('host').fields.filter((f) => f.path.length === 1 && f.path[0] === 'sibling');
  const desired: SchemaModel = {
    tables: [keep('victim'), { name: 'host', fields: sibling, indexes: [] }],
    unmanaged: [],
  };
  const differences = diffSchema(desired, live, { managedTables: ['victim', 'host', ...names] });

  return buildMigrationPlan(differences, new Map(), live);
}

async function remaining(): Promise<{ tables: string[]; hostFields: string[]; hostIndexes: string[] }> {
  const live = await readLiveSchema(surreal);
  const host = live.tables.find((t) => t.name === 'host')!;

  return {
    tables: live.tables.map((t) => t.name).sort(),
    hostFields: host.fields.map((f) => JSON.stringify(f.path)).sort(),
    hostIndexes: host.indexes.map((ix) => ix.name),
  };
}

beforeAll(async () => {
  scratch = await withScratchDatabase('rmpayload');
  surreal = new Surreal();
  await surreal.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });
  await surreal.use({ namespace: 'main', database: scratch.name });
});

afterAll(async () => {
  await surreal.close().catch(() => {});
  await scratch.remove();
});

const allNames = NAME_CASES.map((c) => c.name);

describe('executing the removal plan', () => {
  beforeEach(() => seed(allNames));

  test('removes every hostile table, field and index and leaves victim whole', async () => {
    const plan = await planRemovals(allNames);
    const statements = plan.flatMap((item) => (item.statement === undefined ? [] : [item.statement]));
    expect(statements.some((s) => s.startsWith('REMOVE TABLE'))).toBe(true);
    expect(statements.some((s) => s.startsWith('REMOVE FIELD'))).toBe(true);
    expect(statements.some((s) => s.startsWith('REMOVE INDEX'))).toBe(true);

    await ok(statements.join('\n'));

    expect(await remaining()).toEqual({
      tables: ['host', 'victim'],
      hostFields: [JSON.stringify(['sibling'])],
      hostIndexes: [],
    });
    const [rows] = await run(scratch, 'SELECT v, w FROM victim;');
    expect(rows!.result).toEqual([{ v: 1, w: 'kept' }]);
    const live = await readLiveSchema(surreal);
    expect(live.tables.find((t) => t.name === 'victim')!.fields.map((f) => f.path)).toEqual([['v'], ['w']]);
  });
});

describe('the plan written as comments', () => {
  beforeEach(() => seed(allNames));

  test('runs nothing for names holding LF, CR, NEL, LS and PS', async () => {
    const names = NAME_CASES.filter((c) => COMMENTED.includes(c.label)).map((c) => c.name);
    expect(names).toHaveLength(COMMENTED.length);
    const before = await remaining();
    const plan = await planRemovals(allNames);
    const script = plan
      .flatMap((item) => (item.statement === undefined ? [] : [commentOut(item.statement)]))
      .join('\n');
    expect(script.split('\n').every((line) => line.startsWith('-- '))).toBe(true);

    const results = await run(scratch, script);

    expect(results).toEqual([]);
    expect(await remaining()).toEqual(before);
    const [rows] = await run(scratch, 'SELECT * FROM victim;');
    expect(rows!.result).toHaveLength(1);
    for (const name of names) expect(before.tables).toContain(name);
  });
});
