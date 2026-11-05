/**
 * Every relative import and export specifier in generated output carries a `.js` extension, so the
 * client compiles for an ESM consumer on `nodenext` or `node16` (TS2835 otherwise) and still
 * resolves to the `.ts` and `.d.ts` files under every other resolution mode.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import type { TypeFilesMode } from '../../src/cli/config/types';

const SCHEMAS = resolve(import.meta.dir, '../e2e/schemas');
const SPECIFIER = /(?:from|import\()\s*['"](\.{1,2}(?:\/[^'"]*)?)['"]/g;

let scratch: string;
const roots = {} as Record<TypeFilesMode, string>;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function specifiers(root: string): { file: string; specifier: string }[] {
  return walk(root).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((m) => ({ file, specifier: m[1]! })),
  );
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'cerial-esm-specifiers-'));
  for (const typeFiles of ['dts', 'ts'] as const) {
    const outputDir = join(scratch, typeFiles);
    const result = await generateSingleSchema({ schemaPath: SCHEMAS, outputDir, typeFiles });
    if (!result.success) throw new Error(`generate ${typeFiles} failed: ${result.errors.join('; ')}`);
    roots[typeFiles] = outputDir;
  }
}, 120_000);

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe.each(['dts', 'ts'] as const)('relative specifiers with typeFiles %s', (typeFiles) => {
  test('there are relative specifiers to check', () => {
    expect(specifiers(roots[typeFiles]).length).toBeGreaterThan(100);
  });

  test('every one ends in .js', () => {
    const bare = specifiers(roots[typeFiles]).filter((s) => !s.specifier.endsWith('.js'));

    expect(bare).toEqual([]);
  });

  test('every one points at a generated file once .js maps back to .ts or .d.ts', () => {
    const missing = specifiers(roots[typeFiles]).filter(({ file, specifier }) => {
      const base = resolve(dirname(file), specifier.slice(0, -'.js'.length));

      return !existsSync(`${base}.ts`) && !existsSync(`${base}.d.ts`);
    });

    expect(missing).toEqual([]);
  });
});
