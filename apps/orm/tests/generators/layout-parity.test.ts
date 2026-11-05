/**
 * The two `typeFiles` layouts must differ in file names only: the same files under mapped names,
 * with byte-identical content, barrels included.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import type { TypeFilesMode } from '../../src/cli/config/types';
import { redirectClientImports } from '../e2e/typecheck-overlay';

const SCHEMAS = resolve(import.meta.dir, '../e2e/schemas');
/** The folders whose files are type-only, so `'dts'` emits them as `.d.ts` */
const TYPE_ONLY = ['models', 'objects', 'tuples', 'literals'];

let scratch: string;
const trees = {} as Record<TypeFilesMode, Map<string, string>>;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(dir, entry.name))
      : entry.name === '.cerial-output.json'
        ? []
        : [join(dir, entry.name)],
  );
}

/** Every file under `root`, keyed by its path with the type-only `.d.ts` mapped back to `.ts` */
function read(root: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const path of walk(root)) {
    const key = relative(root, path)
      .split('\\')
      .join('/')
      .replace(/^((?:models|objects|tuples|literals)\/.*)\.d\.ts$/, '$1.ts');
    files.set(key, readFileSync(path, 'utf8'));
  }

  return files;
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'cerial-layout-parity-'));
  for (const typeFiles of ['dts', 'ts'] as const) {
    const outputDir = join(scratch, typeFiles);
    const result = await generateSingleSchema({ schemaPath: SCHEMAS, outputDir, typeFiles });
    if (!result.success) throw new Error(`generate ${typeFiles} failed: ${result.errors.join('; ')}`);
    trees[typeFiles] = read(outputDir);
  }
}, 120_000);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('typeFiles layout parity', () => {
  test('both layouts emit the same files under mapped names', () => {
    expect([...trees.dts.keys()].sort()).toEqual([...trees.ts.keys()].sort());
  });

  test('every type-only folder is populated, so the mapping is not vacuous', () => {
    for (const dir of TYPE_ONLY) {
      expect([...trees.ts.keys()].filter((key) => key.startsWith(`${dir}/`)).length).toBeGreaterThan(1);
    }
  });

  test('the type-only files are .d.ts under dts and .ts under ts', () => {
    const dtsRoot = join(scratch, 'dts');
    const tsRoot = join(scratch, 'ts');
    for (const dir of TYPE_ONLY) {
      const dts = readdirSync(join(dtsRoot, dir));
      const ts = readdirSync(join(tsRoot, dir));
      expect(dts.every((name) => name.endsWith('.d.ts'))).toBe(true);
      expect(ts.some((name) => name.endsWith('.d.ts'))).toBe(false);
    }
  });

  test('enums stay .ts under both layouts', () => {
    expect(readdirSync(join(scratch, 'dts', 'enums')).some((name) => name.endsWith('.d.ts'))).toBe(false);
  });

  test('content is byte-identical across layouts, barrels included', () => {
    const differing = [...trees.ts.entries()]
      .filter(([key, content]) => trees.dts.get(key) !== content)
      .map(([key]) => key);

    expect(differing).toEqual([]);
  });

  test('a barrel is among the compared files', () => {
    expect(trees.ts.has('models/index.ts')).toBe(true);
    expect(trees.ts.has('index.ts')).toBe(true);
  });
});

describe('overlay redirect', () => {
  const write = (source: string): string => {
    const dir = mkdtempSync(join(scratch, 'overlay-'));
    writeFileSync(join(dir, 'a.check.ts'), source);

    return dir;
  };

  test('rewrites a client import to the redirected client', () => {
    const dir = write(
      "import type { User } from '../../generated';\nimport { x } from '../../generated/models/user';\n",
    );

    expect(redirectClientImports(dir, 'generated-layout-ts').rewritten).toBe(2);
    expect(readFileSync(join(dir, 'a.check.ts'), 'utf8')).toBe(
      "import type { User } from '../../generated-layout-ts';\nimport { x } from '../../generated-layout-ts/models/user';\n",
    );
  });

  test('a check that points at no client reports zero rewrites, which the runner refuses', () => {
    expect(redirectClientImports(write("import { x } from '../helpers';\n"), 'generated-layout-ts').rewritten).toBe(0);
  });
});
