/**
 * The emitter over the whole e2e corpus: what it writes loads back to the AST `parse()` gives, typechecks,
 * and is already in the repository's format.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SchemaAST } from '../../src/types';
import {
  cleanScratch,
  compareFile,
  compareRoundTrip,
  corpusSources,
  emitSet,
  fixtureProjects,
  formatCheck,
  loadModules,
  scratch,
  typecheck,
  writeModules,
} from './convert-helpers';
import type { Emitted } from './convert-helpers';

const CORPUS = corpusSources();
const DROPPABLE = /\.(?:unique|optional|nullable|array)\(\)/;

let emitted: Emitted;
let built: SchemaAST;

beforeAll(async () => {
  emitted = emitSet(CORPUS);
  writeModules(emitted.result);
  built = await loadModules(emitted.result);
});

afterAll(cleanScratch);

describe('the corpus', () => {
  test('is enumerated, never counted', () => {
    expect(CORPUS.size).toBeGreaterThan(0);
  });

  test('parses as a set and emits one module per file with nothing refused', () => {
    expect(emitted.result.refusals).toEqual([]);
    expect(emitted.result.modules.map((m) => m.file).sort()).toEqual(
      [...CORPUS.keys()].map((name) => join(emitted.dir, name)).sort(),
    );
  });
});

describe('differential: parse() against the emitted modules', () => {
  for (const name of CORPUS.keys()) {
    test(name, () => {
      expect(compareFile(emitted, built, name)).toEqual([]);
    });
  }
});

describe('round trip: .cerial to TypeScript and back, compared as structures', () => {
  test('the harness finds files', () => {
    expect(CORPUS.size).toBeGreaterThan(0);
  });

  for (const name of CORPUS.keys()) {
    test(name, async () => {
      expect(await compareRoundTrip(emitted, name)).toEqual([]);
    });
  }
});

describe('the comparison can fail', () => {
  test('dropping one chain method from one emitted file is reported for that file', async () => {
    const target = emitted.result.modules.find((module) => DROPPABLE.test(module.text));
    expect(target).toBeDefined();
    const name = target!.file.slice(emitted.dir.length + 1);

    const mutated = emitSet(CORPUS);
    const module = mutated.result.modules.find((m) => m.file === target!.file.replace(emitted.dir, mutated.dir))!;
    const text = module.text.replace(DROPPABLE, '');
    expect(text).not.toBe(module.text);
    writeModules(mutated.result, new Map([[module.path, text]]));
    const loaded = await loadModules(mutated.result);

    expect(compareFile(mutated, loaded, name)).not.toEqual([]);
  });
});

describe('typecheck and format', () => {
  test('tsc passes over the emitted corpus', () => {
    const { status, output } = typecheck(emitted.dir);

    expect(output).toBe('');
    expect(status).toBe(0);
  }, 240_000);

  test('oxfmt reports the emitted corpus formatted', () => {
    const { status, output } = formatCheck(emitted.dir);

    expect(output).toContain(`on ${CORPUS.size} files`);
    expect(status).toBe(0);
  }, 120_000);

  test('oxfmt does fail on an unformatted file in the same tree, so the check is real', () => {
    const dir = scratch();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'loose.schema.ts'), 'export const   a = {x:1}\n');

    expect(formatCheck(dir).status).not.toBe(0);
  });

  test('tsc fails on a type error in the same setup, so the check is real', () => {
    const dir = scratch();
    writeFileSync(join(dir, 'bad.ts'), "export const a: number = 'x';\n");

    expect(typecheck(dir).status).not.toBe(0);
  }, 240_000);
});

describe('the extends-order fixtures', () => {
  const projects = fixtureProjects();
  const tree = scratch();
  const refused: string[] = [];
  let written = 0;

  beforeAll(() => {
    for (const [key, files] of projects) {
      const dir = join(tree, key.replace(/\.cerial$/, ''));
      const set = emitSet(files, dir);
      writeModules(set.result);
      written += set.result.modules.length;
      for (const refusal of set.result.refusals) refused.push(`${key}: ${refusal.caseId}`);
    }
  });

  test('the harness finds the fixtures', () => {
    expect(projects.size).toBeGreaterThan(0);
  });

  test('the cycle is refused and writes no module', () => {
    expect(refused.length).toBeGreaterThan(0);
    expect(refused.every((line) => line.startsWith('cycle: '))).toBe(true);
    expect(written).toBeGreaterThan(0);
  });

  test('tsc passes over the hoisted and threaded output', () => {
    const { status, output } = typecheck(tree);

    expect(output).toBe('');
    expect(status).toBe(0);
  }, 240_000);

  test('oxfmt reports it formatted', () => {
    const { status, output } = formatCheck(tree);

    expect(output).toContain(`on ${written} files`);
    expect(status).toBe(0);
  }, 120_000);
});
