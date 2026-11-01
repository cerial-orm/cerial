/**
 * The emitter over the whole e2e corpus: what it writes loads back to the AST `parse()` gives, typechecks,
 * and is already in the repository's format.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { emitCerial } from '../../src/cli/convert';
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
  runTwins,
  scratch,
  TWINS_DIR,
  typecheck,
  writeModules,
} from './convert-helpers';
import { findSchemaFiles } from './parity-corpus';
import type { Emitted, TwinRun } from './convert-helpers';

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

function firstDifference(first: ReadonlyMap<string, string>, second: ReadonlyMap<string, string>): string[] {
  const found: string[] = [];
  for (const name of new Set([...first.keys(), ...second.keys()])) {
    const a = first.get(name)?.split('\n') ?? [];
    const b = second.get(name)?.split('\n') ?? [];
    const line = a.findIndex((text, i) => text !== b[i]);
    if (line >= 0 || a.length !== b.length) {
      const at = line >= 0 ? line : a.length;
      found.push(`${name}:${at + 1}: '${a[at] ?? ''}' became '${b[at] ?? ''}'`);
    }
  }

  return found;
}

describe('the twins: TypeScript to .cerial to TypeScript, then a second pass', () => {
  let run: TwinRun;

  beforeAll(async () => {
    run = await runTwins();
  });

  test('the harness finds files', () => {
    expect(run.differences.size).toBeGreaterThan(0);
    expect(run.cerial.size).toBe(run.differences.size);
  });

  test('a twins directory with no files fails rather than passing', async () => {
    await expect(runTwins(undefined, scratch())).rejects.toThrow('no schema files');
  });

  test('every twin is a file of the first pass', () => {
    expect(run.differences.size).toBe(findSchemaFiles(TWINS_DIR, '.schema.ts').length);
  });

  describe("against the twin's own AST", () => {
    for (const name of findSchemaFiles(TWINS_DIR, '.schema.ts').map((path) => relative(TWINS_DIR, path))) {
      test(name, () => {
        expect(run.differences.get(name.replace(/\.schema\.ts$/, '.cerial'))).toEqual([]);
      });
    }
  });

  test('the .cerial text of a second pass equals the first, byte for byte', () => {
    expect(firstDifference(run.cerial, run.cerialAgain)).toEqual([]);
  });

  test('the TypeScript text of a second pass equals the first, byte for byte', () => {
    expect(firstDifference(run.typescript, run.typescriptAgain)).toEqual([]);
  });
});

describe('the second-pass check is separate from the AST check', () => {
  test('an emitter that orders fields differently on alternate passes still loads to the twins, and is caught', async () => {
    let calls = 0;
    const alternating: typeof emitCerial = (ast, declarations, extra) => {
      calls += 1;
      if (calls % 2) return emitCerial(ast, declarations, extra);
      const sorted: SchemaAST = {
        ...ast,
        models: ast.models.map((model) => ({
          ...model,
          fields: [...model.fields].sort((a, b) => a.name.localeCompare(b.name)),
        })),
      };

      return emitCerial(sorted, declarations, extra);
    };
    const run = await runTwins({ cerial: alternating });

    expect([...run.differences.values()].flat()).toEqual([]);
    expect(firstDifference(run.cerial, run.cerialAgain)).not.toEqual([]);
  });
});
