/**
 * The client generated from the `.cerial` corpus and the client generated from its TypeScript twins must be
 * the same files, byte for byte. The AST comparison in the differential test is necessary and not
 * sufficient: this one compares what a user receives.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { generate } from '../../src/cli/generate';
import { tables } from '../e2e/test-helper';

const E2E_DIR = join(import.meta.dir, '..', 'e2e');
const MULTI_SCHEMA_TABLE = /^ms_rt_/;

let scratch = '';
let cerialDir = '';
let tsDir = '';

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

function firstDifference(left: string, right: string): string {
  const a = left.split('\n');
  const b = right.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `line ${i + 1}: ${JSON.stringify(a[i])} against ${JSON.stringify(b[i])}`;
  }

  return 'no differing line';
}

function registryTables(dir: string): string[] {
  const chunks = join(dir, 'internal', 'registry', 'models');
  const source = readdirSync(chunks)
    .map((file) => readFileSync(join(chunks, file), 'utf8'))
    .join('\n');

  return [...source.matchAll(/tableName: '([^']+)'/g)].map((match) => match[1]!).sort();
}

describe('client generated from TypeScript', () => {
  beforeAll(async () => {
    scratch = mkdtempSync(join(tmpdir(), 'cerial-client-parity-'));
    cerialDir = join(scratch, 'cerial');
    tsDir = join(scratch, 'ts');

    for (const [schema, output] of [
      [join(E2E_DIR, 'schemas'), cerialDir],
      [join(E2E_DIR, 'schemas-ts'), tsDir],
    ] as const) {
      const result = await generate({ schema, output, verbose: false });
      if (!result.success) throw new Error(`generation failed for ${schema}: ${result.errors.join(', ')}`);
    }
  });

  afterAll(() => {
    if (scratch) rmSync(scratch, { recursive: true, force: true });
  });

  test('both clients hold the same file list', () => {
    expect(listFiles(tsDir)).toEqual(listFiles(cerialDir));
  });

  test('every generated file is byte for byte equal', () => {
    const differing: string[] = [];
    for (const file of listFiles(cerialDir)) {
      const left = readFileSync(join(cerialDir, file), 'utf8');
      const right = readFileSync(join(tsDir, file), 'utf8');
      if (left !== right) differing.push(`${file}: ${firstDifference(left, right)}`);
    }

    expect(differing).toEqual([]);
  });

  test('both registries cover the same tables, all of them in the e2e tables registry', () => {
    const fromCerial = registryTables(cerialDir);
    const fromTs = registryTables(tsDir);
    expect(fromTs.length).toBe(fromCerial.length);
    expect(fromTs).toEqual(fromCerial);

    // The multi-schema fixtures own their tables; every other registry entry is a model of the corpus
    const corpusTables = [...new Set(Object.values(tables).flat())]
      .filter((table) => !MULTI_SCHEMA_TABLE.test(table))
      .sort();
    expect(corpusTables).toEqual(fromTs);
  });
});
