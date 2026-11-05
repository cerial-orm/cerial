import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  writeEnumsIndex,
  writeLiteralsIndex,
  writeModelsIndex,
  writeObjectsIndex,
  writeTuplesIndex,
} from '../../../src/generators/client/barrel-writer';
import { mdl, obj } from './helpers';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cerial-barrel-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const read = (path: string): Promise<string> => readFile(path, 'utf-8');
const names = [{ name: 'Alpha' }, { name: 'Beta' }];

describe('type barrels', () => {
  test('models barrel re-exports with export type *', async () => {
    const text = await read(await writeModelsIndex(dir, [mdl('User', 'user', [])]));

    expect(text).toContain("export type * from './user.js';");
    expect(text).not.toMatch(/export \* from/);
  });

  test('objects barrel re-exports with export type *', async () => {
    const text = await read(await writeObjectsIndex(dir, [obj('Address', [])]));

    expect(text).toContain("export type * from './address.js';");
    expect(text).not.toMatch(/export \* from/);
  });

  test('tuples barrel re-exports with export type *', async () => {
    const text = await read(
      await writeTuplesIndex(
        dir,
        names.map((n) => ({ ...n, elements: [] })),
      ),
    );

    expect(text).toContain("export type * from './alpha.js';");
    expect(text).toContain("export type * from './beta.js';");
    expect(text).not.toMatch(/export \* from/);
  });

  test('literals barrel re-exports with export type *', async () => {
    const text = await read(
      await writeLiteralsIndex(
        dir,
        names.map((n) => ({ ...n, variants: [] })),
      ),
    );

    expect(text).toContain("export type * from './alpha.js';");
    expect(text).not.toMatch(/export \* from/);
  });
});

describe('enums barrel', () => {
  test('stays a value export because enums hold runtime consts', async () => {
    const text = await read(
      await writeEnumsIndex(
        dir,
        names.map((n) => ({ ...n, variants: [] })),
      ),
    );

    expect(text).toContain("export * from './alpha.js';");
    expect(text).toContain("export * from './beta.js';");
    expect(text).not.toContain('export type');
  });
});
