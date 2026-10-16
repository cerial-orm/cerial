import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedSchemaEntry } from '../../../src/cli/config';
import { generateMultiSchema } from '../../../src/cli/generate';
import type { EntryModels } from '../../../src/cli/validators';
import { validateEntryTableNames } from '../../../src/cli/validators';
import { CerialGenerationError } from '../../../src/errors';

function entry(name: string, ...models: Array<[string, boolean?]>): EntryModels {
  return {
    name,
    models: models.map(([modelName, abstract]) => ({ name: modelName, abstract })),
  };
}

function withDb(e: EntryModels, database?: string): EntryModels {
  return { ...e, database };
}

function message(entries: EntryModels[]): string {
  try {
    validateEntryTableNames(entries);
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return (error as Error).message;
  }

  return '';
}

describe('validateEntryTableNames', () => {
  test('accepts entries with disjoint tables', () => {
    expect(message([entry('a', ['User']), entry('b', ['Post'])])).toBe('');
  });

  test('accepts one entry holding several models', () => {
    expect(message([entry('a', ['User'], ['Post'])])).toBe('');
  });

  test('names the table, both entries and the model in each', () => {
    const msg = message([entry('a', ['UserAccount']), entry('b', ['userAccount'])]);

    expect(msg).toContain("table 'user_account'");
    expect(msg).toContain("model 'UserAccount' in entry 'a'");
    expect(msg).toContain("model 'userAccount' in entry 'b'");
  });

  test('suggests a rename and says table names follow the model name', () => {
    const msg = message([entry('a', ['User']), entry('b', ['User'])]);

    expect(msg).toContain('Rename one of the models');
    expect(msg).toContain('Table names follow the model name');
    expect(msg).toContain('no table directive exists');
  });

  test('reports three entries on one table together', () => {
    const msg = message([entry('a', ['User']), entry('b', ['User']), entry('c', ['User'])]);

    expect(msg).toContain("entry 'a'");
    expect(msg).toContain("entry 'b'");
    expect(msg).toContain("entry 'c'");
  });

  test('reports every colliding table, not the first', () => {
    const msg = message([entry('a', ['User'], ['Post']), entry('b', ['User'], ['Post'])]);

    expect(msg).toContain("table 'user'");
    expect(msg).toContain("table 'post'");
  });

  test('abstract models contribute no table', () => {
    expect(message([entry('a', ['Base', true]), entry('b', ['Base', true])])).toBe('');
    expect(message([entry('a', ['Base', true]), entry('b', ['Base'])])).toBe('');
  });
});

// The earlier "refuse every collision" rule no longer holds: a collision is allowed only when every owner
// configures its own database on its own connection and they all differ.
describe('validateEntryTableNames databases', () => {
  const pair = (a?: string, b?: string): EntryModels[] => [
    withDb(entry('a', ['User']), a),
    withDb(entry('b', ['User']), b),
  ];

  test('allows a collision when both entries configure different databases', () => {
    expect(message(pair('tenant_a', 'tenant_b'))).toBe('');
  });

  test('refuses a collision when both entries configure the same database', () => {
    const msg = message(pair('shared', 'shared'));

    expect(msg).toContain("table 'user'");
    expect(msg).toContain("entry 'a' (database 'shared')");
    expect(msg).toContain("entry 'b' (database 'shared')");
  });

  test('refuses a collision when one entry has no database, in either order', () => {
    expect(message(pair('tenant_a', undefined))).toContain("entry 'b' (no database set on the entry)");
    expect(message(pair(undefined, 'tenant_b'))).toContain("entry 'a' (no database set on the entry)");
  });

  test('refuses a collision when neither entry has a database (both inherited from the root)', () => {
    expect(message(pair(undefined, undefined))).toContain("table 'user'");
  });

  test('refuses an empty-string database as unset', () => {
    expect(message(pair('', 'tenant_b'))).toContain("table 'user'");
  });

  test('refuses three owners when two of them share a database', () => {
    const msg = message([
      withDb(entry('a', ['User']), 'one'),
      withDb(entry('b', ['User']), 'two'),
      withDb(entry('c', ['User']), 'one'),
    ]);

    expect(msg).toContain("table 'user'");
  });

  test('allows three owners on three different databases', () => {
    const entries = ['one', 'two', 'three'].map((db, i) => withDb(entry(`e${i}`, ['User']), db));

    expect(message(entries)).toBe('');
  });

  test('judges each table on its own owners', () => {
    const msg = message([
      withDb(entry('a', ['User'], ['Post']), 'one'),
      withDb(entry('b', ['User'], ['Post']), 'two'),
      withDb(entry('c', ['Post']), 'two'),
    ]);

    expect(msg).toContain("table 'post'");
    expect(msg).not.toContain("table 'user'");
  });
});

describe('generateMultiSchema table collision', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cerial-entry-tables-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeEntry(name: string, schema: string, explicitDatabase?: string): Promise<ResolvedSchemaEntry> {
    const path = join(root, name, 'schemas');
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'schema.cerial'), schema);

    return { name, path, output: join(root, name, 'client'), clientClassName: `${name}Client`, explicitDatabase };
  }

  const model = (name: string) => `model ${name} {\n  id Record @id\n  label String\n}\n`;

  test('refuses a shared table and writes nothing to disk', async () => {
    const a = await makeEntry('alpha', model('Shared'));
    const b = await makeEntry('beta', model('Shared'));

    await expect(generateMultiSchema([a, b], {})).rejects.toThrow("table 'shared'");
    expect(existsSync(a.output)).toBe(false);
    expect(existsSync(b.output)).toBe(false);
  });

  test('refuses a shared table when both entries pin the same database, writing nothing', async () => {
    const a = await makeEntry('alpha', model('Shared'), 'same');
    const b = await makeEntry('beta', model('Shared'), 'same');

    await expect(generateMultiSchema([a, b], {})).rejects.toThrow("database 'same'");
    expect(existsSync(a.output)).toBe(false);
  });

  test('refuses a shared table when only one entry pins a database', async () => {
    const a = await makeEntry('alpha', model('Shared'), 'one');
    const b = await makeEntry('beta', model('Shared'));

    await expect(generateMultiSchema([a, b], {})).rejects.toThrow("table 'shared'");
    expect(existsSync(b.output)).toBe(false);
  });

  test('allows a shared table when both entries pin different databases', async () => {
    const a = await makeEntry('alpha', model('Shared'), 'one');
    const b = await makeEntry('beta', model('Shared'), 'two');

    const result = await generateMultiSchema([a, b], {});

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(existsSync(a.output)).toBe(true);
    expect(existsSync(b.output)).toBe(true);
  });

  test('refuses a collision between models whose names differ', async () => {
    const a = await makeEntry('alpha', model('UserAccount'));
    const b = await makeEntry('beta', model('userAccount'));

    await expect(generateMultiSchema([a, b], {})).rejects.toThrow("table 'user_account'");
    expect(existsSync(a.output)).toBe(false);
  });

  test('ignores a shared abstract model and still generates both clients', async () => {
    const base = 'abstract model Base {\n  label String\n}\n';
    const a = await makeEntry('alpha', `${base}${model('Left')}`);
    const b = await makeEntry('beta', `${base}${model('Right')}`);

    const result = await generateMultiSchema([a, b], {});

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(existsSync(a.output)).toBe(true);
    expect(existsSync(b.output)).toBe(true);
  });

  test('accepts disjoint tables and generates both clients', async () => {
    const a = await makeEntry('alpha', model('Left'));
    const b = await makeEntry('beta', model('Right'));

    const result = await generateMultiSchema([a, b], {});

    expect(result.success).toBe(true);
    expect(existsSync(a.output)).toBe(true);
    expect(existsSync(b.output)).toBe(true);
  });
});
