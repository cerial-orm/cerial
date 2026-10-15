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

describe('generateMultiSchema table collision', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cerial-entry-tables-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function makeEntry(name: string, schema: string): Promise<ResolvedSchemaEntry> {
    const path = join(root, name, 'schemas');
    await mkdir(path, { recursive: true });
    await writeFile(join(path, 'schema.cerial'), schema);

    return { name, path, output: join(root, name, 'client'), clientClassName: `${name}Client` };
  }

  const model = (name: string) => `model ${name} {\n  id Record @id\n  label String\n}\n`;

  test('refuses a shared table and writes nothing to disk', async () => {
    const a = await makeEntry('alpha', model('Shared'));
    const b = await makeEntry('beta', model('Shared'));

    await expect(generateMultiSchema([a, b], {})).rejects.toThrow("table 'shared'");
    expect(existsSync(a.output)).toBe(false);
    expect(existsSync(b.output)).toBe(false);
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
