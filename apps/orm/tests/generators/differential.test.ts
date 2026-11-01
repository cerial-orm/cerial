/**
 * The two frontends must agree: `parse()` of a `.cerial` file and the builder's materialise pass over its
 * TypeScript twin have to produce the same raw `SchemaAST`, key for key.
 *
 * Comparison unit: one `.cerial` file against one twin module, the file-for-file tree under
 * `tests/e2e/schemas-ts/`. Names a file uses from other files are resolved the way `generate` resolves
 * them. The `.cerial` side is parsed with the name sets of the whole corpus, and the twin side is
 * materialised together with the twin modules it imports (real imports between twins), then cut down
 * to the declarations that module itself exports.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { loadDeclarations, materialise } from '../../src/parser/builder';
import { compareExact } from '../../src/cli/convert';
import type { SchemaAST } from '../../src/types';
import { findSchemaFiles, loadCorpus, SCHEMAS_DIR } from './parity-corpus';

const TWINS_DIR = join(import.meta.dir, '..', 'e2e', 'schemas-ts');

/** The twin of `schemas/<dir>/<name>.cerial` is `schemas-ts/<dir>/<name>.schema.ts`. */
export function twinPathOf(cerialPath: string): string {
  const relative = cerialPath.slice(SCHEMAS_DIR.length + 1).replace(/\.cerial$/, '.schema.ts');

  return join(TWINS_DIR, relative);
}

function localImports(module: string): string[] {
  const found: string[] = [];
  for (const [, specifier] of readFileSync(module, 'utf8').matchAll(/from\s+'(\.{1,2}\/[^']+)'/g)) {
    const target = resolve(dirname(module), specifier!);
    for (const candidate of [target, `${target}.ts`]) {
      if (candidate.startsWith(TWINS_DIR) && existsSync(candidate) && candidate.endsWith('.ts')) found.push(candidate);
    }
  }

  return found;
}

/** The module and the twin modules it imports, transitively. */
function closureOf(module: string, seen = new Set<string>()): string[] {
  if (seen.has(module)) return [...seen];
  seen.add(module);
  for (const next of localImports(module)) closureOf(next, seen);

  return [...seen];
}

/** `parse()` of one corpus file, with the name sets of the whole corpus as `generate` supplies them. */
function parsedAst(cerialPath: string): SchemaAST {
  const corpus = loadCorpus();
  const index = corpus.files.indexOf(cerialPath.slice(SCHEMAS_DIR.length + 1));
  if (index < 0) throw new Error(`${cerialPath} is not in the corpus`);

  return corpus.parsed[index]!;
}

/** The load-plus-materialise pass over a twin and its imports, keeping what the twin itself exports. */
async function builtAst(twinPath: string): Promise<SchemaAST> {
  const all = materialise(await loadDeclarations(closureOf(twinPath)));
  const own = <T extends { readonly origin: { readonly file: string } }>(items: readonly T[]): T[] =>
    items.filter((item) => item.origin.file === twinPath);

  return {
    models: own(all.models),
    objects: own(all.objects),
    tuples: own(all.tuples),
    literals: own(all.literals),
    enums: own(all.enums),
    source: '',
  };
}

/** Differences between a `.cerial` file and its twin; empty when they agree. */
export async function differentialOf(cerialPath: string): Promise<string[]> {
  const twin = twinPathOf(cerialPath);
  if (!existsSync(twin)) return [`no twin at ${twin}`];

  return compareExact(parsedAst(cerialPath), await builtAst(twin));
}

/** The `.cerial` file a twin stands for: the inverse of `twinPathOf`. */
function cerialPathOf(twinPath: string, schemasDir: string, twinsDir: string): string {
  return join(schemasDir, relative(twinsDir, twinPath).replace(/\.schema\.ts$/, '.cerial'));
}

/** One message per `.cerial` file whose twin is absent from `twins`. Paths are absolute. */
export function missingTwins(cerials: readonly string[], twins: readonly string[]): string[] {
  const have = new Set(twins);

  return cerials.filter((path) => !have.has(twinPathOf(path))).map((path) => `no twin for ${path}`);
}

/** One message per twin whose `.cerial` file is absent from `cerials`. Paths are absolute. */
export function strayTwins(cerials: readonly string[], twins: readonly string[]): string[] {
  const have = new Set(cerials);

  return twins
    .filter((path) => !have.has(cerialPathOf(path, SCHEMAS_DIR, TWINS_DIR)))
    .map((path) => `no .cerial file for twin ${path}`);
}

const CERIALS = findSchemaFiles(SCHEMAS_DIR);
const TWINS = findSchemaFiles(TWINS_DIR, '.schema.ts');

const byDirectory = new Map<string, string[]>();
for (const path of CERIALS) {
  const directory = relative(SCHEMAS_DIR, dirname(path)) || '.';
  byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), path]);
}

for (const [directory, paths] of [...byDirectory].sort(([a], [b]) => a.localeCompare(b))) {
  describe(`${directory}/`, () => {
    test.each(paths.map((path) => [relative(SCHEMAS_DIR, path), path] as const))(
      '%s matches its twin',
      async (_name, path) => {
        expect(await differentialOf(path)).toEqual([]);
      },
    );
  });
}

describe('the corpus and the twins pair up', () => {
  test('every .cerial file has a twin', () => {
    expect(missingTwins(CERIALS, TWINS)).toEqual([]);
  });

  test('every twin has a .cerial file', () => {
    expect(strayTwins(CERIALS, TWINS)).toEqual([]);
  });
});

describe('the pairing checks', () => {
  const cerial = (name: string) => join(SCHEMAS_DIR, `${name}.cerial`);
  const twin = (name: string) => join(TWINS_DIR, `${name}.schema.ts`);

  test('a .cerial file with no twin is named, nested directories included', () => {
    expect(missingTwins([cerial('a/x'), cerial('a/b/y')], [twin('a/x')])).toEqual([`no twin for ${cerial('a/b/y')}`]);
  });

  test('a twin with no .cerial file is named', () => {
    expect(strayTwins([cerial('a/x')], [twin('a/x'), twin('a/old')])).toEqual([
      `no .cerial file for twin ${twin('a/old')}`,
    ]);
  });

  test('a matched set reports nothing in either direction', () => {
    expect(missingTwins([cerial('a/x')], [twin('a/x')])).toEqual([]);
    expect(strayTwins([cerial('a/x')], [twin('a/x')])).toEqual([]);
  });

  test('an empty twin list names every file', () => {
    expect(missingTwins([cerial('a'), cerial('b')], [])).toHaveLength(2);
  });

  test('the walk finds files on temp directories by suffix', () => {
    const root = mkdtempSync(join(tmpdir(), 'pairing-'));
    try {
      mkdirSync(join(root, 'd/e'), { recursive: true });
      writeFileSync(join(root, 'd/e/a.cerial'), '');
      writeFileSync(join(root, 'd/b.cerial'), '');
      writeFileSync(join(root, 'd/c.txt'), '');

      expect(findSchemaFiles(root).map((path) => relative(root, path))).toEqual(['d/b.cerial', 'd/e/a.cerial']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('the comparison', () => {
  test('a key added to a twin node is reported', async () => {
    const twin = await builtAst(twinPathOf(join(SCHEMAS_DIR, 'core/test-basics.cerial')));
    const parsed = parsedAst(join(SCHEMAS_DIR, 'core/test-basics.cerial'));
    const field = twin.models.find((model) => model.name === 'Post')!.fields[1]!;
    (field as unknown as Record<string, unknown>).isArray = false;

    expect(compareExact(parsed, twin)).toEqual(['models.Post.fields[1].isArray: only in the second']);
  });

  test('a missing twin is reported by path', async () => {
    expect(await differentialOf(join(SCHEMAS_DIR, 'core/nope.cerial'))).toEqual([
      `no twin at ${join(TWINS_DIR, 'core/nope.schema.ts')}`,
    ]);
  });
});
