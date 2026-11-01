/**
 * Shared by the convert-to-TypeScript proof: the corpus is parsed as a set, emitted into a scratch
 * directory, loaded back through the builder and compared with the parse, file by file.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { compareExact } from '../../src/cli/convert';
import { emitTypescript, moduleFileOf } from '../../src/cli/convert/emit-ts';
import type { EmitTypescriptResult } from '../../src/cli/convert/emit-ts';
import { runPassThree } from '../../src/cli/passes/pass-three';
import type { SchemaSource } from '../../src/cli/passes/types';
import { loadDeclarations, materialise } from '../../src/parser/builder';
import type { SchemaAST } from '../../src/types';
import { findSchemaFiles, SCHEMAS_DIR } from './parity-corpus';

export const ORM_ROOT = resolve(import.meta.dir, '..', '..');
export const REPO_ROOT = resolve(ORM_ROOT, '..', '..');
const SCHEMA_SOURCE = join(ORM_ROOT, 'src', 'schema');

/** What the emitted modules import the builder from; `src/schema` is linked under that name beside them. */
export const SCHEMA_MODULE = 'cerial/schema';
export const EXTENDS_ORDER = join(ORM_ROOT, 'tests', 'fixtures', 'convert', 'extends-order');

const scratchDirs: string[] = [];

export function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-convert-proof-'));
  scratchDirs.push(dir);

  return dir;
}

export function cleanScratch(): void {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

/** A set of `.cerial` sources keyed by their path relative to the directory they came from. */
export type SourceSet = ReadonlyMap<string, string>;

export function readSources(dir: string): SourceSet {
  return new Map(findSchemaFiles(dir).map((path) => [relative(dir, path), readFileSync(path, 'utf8')]));
}

/** The corpus, one entry per file `findSchemaFiles` finds. */
export function corpusSources(): SourceSet {
  return readSources(SCHEMAS_DIR);
}

/** Each top-level fixture file and each fixture folder is its own project, because their names collide. */
export function fixtureProjects(): Map<string, SourceSet> {
  const all = readSources(EXTENDS_ORDER);
  const projects = new Map<string, Map<string, string>>();
  for (const [name, content] of all) {
    const key = name.includes('/') ? name.slice(0, name.indexOf('/')) : name;
    projects.set(key, new Map([...(projects.get(key) ?? []), [name, content]]));
  }

  return projects;
}

export interface Emitted {
  readonly dir: string;
  readonly ast: SchemaAST;
  readonly sources: readonly SchemaSource[];
  readonly result: EmitTypescriptResult;
}

/** Parses the set together, as `generate` does, and emits it; nothing is written yet. */
export function emitSet(files: SourceSet, dir: string = scratch()): Emitted {
  mkdirSync(join(dir, 'node_modules', 'cerial'), { recursive: true });
  symlinkSync(SCHEMA_SOURCE, join(dir, 'node_modules', 'cerial', 'schema'), 'dir');
  const sources = [...files].map(([name, content]) => ({ path: join(dir, name), content }));
  const { ast, errors } = runPassThree(sources);
  if (errors.length) throw new Error(`the sources do not parse: ${JSON.stringify(errors)}`);

  return { dir, ast, sources, result: emitTypescript(ast, { schemaImport: SCHEMA_MODULE }) };
}

export function writeModules(result: EmitTypescriptResult, replace: ReadonlyMap<string, string> = new Map()): void {
  for (const module of result.modules) {
    mkdirSync(dirname(module.path), { recursive: true });
    writeFileSync(module.path, replace.get(module.path) ?? module.text);
  }
}

function only(ast: SchemaAST, file: string): SchemaAST {
  const keep = <T extends { origin: { file: string } }>(items: T[]): T[] => items.filter((i) => i.origin.file === file);

  return {
    models: keep(ast.models),
    objects: keep(ast.objects),
    tuples: keep(ast.tuples),
    literals: keep(ast.literals),
    enums: keep(ast.enums),
    source: '',
  };
}

/** Loads every written module and builds the AST they declare. */
export async function loadModules(result: EmitTypescriptResult): Promise<SchemaAST> {
  return materialise(await loadDeclarations(result.modules.map((module) => module.path)));
}

/** The differences between one parsed file and its emitted module, under the tolerances the module reports. */
export function compareFile(emitted: Emitted, built: SchemaAST, name: string): string[] {
  const file = join(emitted.dir, name);
  const module = emitted.result.modules.find((m) => m.file === file);
  if (!module) return [`${name}: no module was emitted`];

  return compareExact(only(emitted.ast, file), only(built, moduleFileOf(file)), {
    tolerate: { declarationOrder: module.hoisted, directiveKindOrder: module.directiveKindOrder },
  });
}

export interface Run {
  readonly status: number | null;
  readonly output: string;
}

function run(command: string, args: readonly string[], cwd: string): Run {
  const done = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 240_000 });

  return { status: done.status, output: `${done.stdout}${done.stderr}` };
}

/** `tsc --noEmit` over a tree of modules, with the tsconfig written beside them. */
export function typecheck(dir: string): Run {
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        allowImportingTsExtensions: true,
        typeRoots: [join(ORM_ROOT, 'node_modules', '@types'), join(REPO_ROOT, 'node_modules', '@types')],
        types: ['bun'],
      },
      include: ['./**/*.ts'],
    }),
  );

  return run('bunx', ['tsc', '--noEmit', '-p', join(dir, 'tsconfig.json')], ORM_ROOT);
}

/** `oxfmt --check` over a tree, with the repo's options; the config's ignore patterns are relative to it. */
export function formatCheck(dir: string): Run {
  return run(
    'bunx',
    ['oxfmt', '--check', '-c', join(REPO_ROOT, '.oxfmtrc.json'), ...findSchemaFiles(dir, '.ts')],
    REPO_ROOT,
  );
}
