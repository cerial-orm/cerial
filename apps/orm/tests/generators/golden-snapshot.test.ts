/**
 * Golden snapshot of the e2e schema corpus: resolved AST, emitted migration DDL and generated types.
 *
 * The files under `__snapshots__/` are the contract any schema frontend is measured against. One file
 * per schema per part, named after the schema, so a diff shows which construct moved:
 *   ast/<schema>.ast.snap      resolved declarations the schema owns, source ranges removed
 *   ddl/<schema>.ddl.snap      DEFINE statements per model, models sorted by name
 *   registry/<schema>.registry.snap  the runtime metadata the generated client reads, per declaration
 *   types/<schema>.types.snap  the generated type file of every declaration the schema owns
 *   shared/<path>.snap         generated files no single schema owns: client, barrels, model registry
 *
 * Two parts carry what no type exposes. The DDL holds indexes, defaults, table names and the
 * tuple-element DEFINE FIELD skips. The registry holds what is enforced at runtime rather than by the
 * database: `@onDelete` rules, `@key`, `@sort`, `@distinct`, and the relation wiring.
 *
 * Re-approve with `bun run snapshot:update` (README.md beside this file says when that is legitimate).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { resolveInheritance } from '../../src/resolver';
import type { SchemaAST } from '../../src/types';
import { loadCorpus, SCHEMAS_DIR } from './parity-corpus';

const SNAPSHOT_DIR = join(import.meta.dir, '__snapshots__');
const UPDATE = process.env.UPDATE_GOLDEN === '1';

type Part = 'ast' | 'ddl' | 'registry' | 'types';
const PARTS: readonly Part[] = ['ast', 'ddl', 'registry', 'types'];
const SUFFIX: Record<Part, string> = {
  ast: '.ast.snap',
  ddl: '.ddl.snap',
  registry: '.registry.snap',
  types: '.types.snap',
};

/** Positions shift with every comment or blank line, and a second frontend will not share them. */
const VOLATILE_KEYS = new Set(['range', 'position']);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([k, v]) => !VOLATILE_KEYS.has(k) && v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, stable(v)]),
  );
}

/** The default layout emits type-only files as `.d.ts`; the snapshot keys keep the `.ts` name they always had. */
const keyOf = (relative: string): string =>
  /^(models|objects|tuples|literals)\//.test(relative) ? relative.replace(/\.d\.ts$/, '.ts') : relative;

const KINDS = ['models', 'objects', 'tuples', 'literals', 'enums'] as const;
type Kind = (typeof KINDS)[number];

interface Generated {
  readonly ddl: Record<string, readonly string[]>;
  /** Runtime registries by declaration kind; literals include enums. */
  readonly registry: Record<Kind, Record<string, unknown>>;
  /** Generated type files keyed by `<kind>/<lowercased name>.ts`. */
  readonly files: ReadonlyMap<string, string>;
  /** Every generated file by relative path, for the byte-for-byte comparison of two runs. */
  readonly all: ReadonlyMap<string, string>;
}

async function generate(outputDir: string): Promise<Generated> {
  // The generator logs its progress; keep the test output readable.
  const { log, info, warn, error } = console;
  console.log = console.info = console.warn = console.error = () => {};
  try {
    const result = await generateSingleSchema({ schemaPath: SCHEMAS_DIR, outputDir, logLevel: 'minimal' });
    if (!result.success) throw new Error(`corpus generation failed: ${result.errors.join('; ')}`);
  } finally {
    Object.assign(console, { log, info, warn, error });
  }

  const migrations = (await import(join(outputDir, 'internal', 'migrations.ts'))) as {
    migrationsByModel: Record<string, string[]>;
  };
  const registries = (await import(join(outputDir, 'internal', 'model-registry.ts'))) as {
    modelRegistry: Record<string, unknown>;
    objectRegistry?: Record<string, unknown>;
    tupleRegistry?: Record<string, unknown>;
    literalRegistry?: Record<string, unknown>;
  };
  const literalRegistry = registries.literalRegistry ?? {};
  const registry: Generated['registry'] = {
    models: registries.modelRegistry,
    objects: registries.objectRegistry ?? {},
    tuples: registries.tupleRegistry ?? {},
    literals: literalRegistry,
    enums: literalRegistry,
  };
  const files = new Map<string, string>();
  for (const kind of ['models', 'objects', 'tuples', 'literals', 'enums']) {
    const dir = join(outputDir, kind);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      const key = keyOf(`${kind}/${name}`);
      if (key !== `${kind}/index.ts`) files.set(key, readFileSync(join(dir, name), 'utf8'));
    }
  }

  const all = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else all.set(keyOf(relative(outputDir, path)), readFileSync(path, 'utf8'));
    }
  };
  walk(outputDir);

  return { ddl: migrations.migrationsByModel, registry, files, all };
}

const corpus = loadCorpus();
const resolved: SchemaAST = resolveInheritance(corpus.ast);

const nodesByName = <T extends { name: string }>(nodes: readonly T[]): Map<string, T> =>
  new Map(nodes.map((n) => [n.name, n]));
const resolvedBy: Record<Kind, Map<string, { name: string }>> = {
  models: nodesByName(resolved.models),
  objects: nodesByName(resolved.objects),
  tuples: nodesByName(resolved.tuples),
  literals: nodesByName(resolved.literals),
  enums: nodesByName(resolved.enums),
};

/** Declarations a schema file owns, by kind, in the order the file declares them. */
const owned = (parsed: SchemaAST): Record<Kind, string[]> => ({
  models: parsed.models.map((m) => m.name),
  objects: parsed.objects.map((o) => o.name),
  tuples: parsed.tuples.map((t) => t.name),
  literals: parsed.literals.map((l) => l.name),
  enums: parsed.enums.map((e) => e.name),
});

const abstractModels = new Set(resolved.models.filter((m) => m.abstract).map((m) => m.name));

function astText(parsed: SchemaAST): string {
  const names = owned(parsed);
  const body = Object.fromEntries(
    KINDS.map((kind) => [kind, names[kind].map((n) => resolvedBy[kind].get(n))]).filter(
      ([, nodes]) => (nodes as unknown[]).length,
    ),
  );

  return `${JSON.stringify(stable(body), null, 2)}\n`;
}

function ddlText(parsed: SchemaAST, ddl: Generated['ddl']): string {
  // Models are sorted by name so reordering declarations inside a schema file is not a diff. Statements
  // inside a model keep their emitted order: a DEFINE FIELD that moved after a DEFINE INDEX is a real
  // change a reviewer must see.
  const models = parsed.models
    .map((m) => m.name)
    .filter((n) => !abstractModels.has(n))
    .sort();

  return models
    .map((name) => {
      const statements = ddl[name];
      if (!statements) throw new Error(`no migration statements emitted for model '${name}'`);

      return `-- ${name}\n${statements.join('\n')}\n`;
    })
    .join('\n');
}

function registryText(parsed: SchemaAST, registry: Generated['registry']): string {
  const names = owned(parsed);
  const body: Record<string, Record<string, unknown>> = {};
  for (const kind of KINDS) {
    // Abstract models never reach the registry.
    const declared = kind === 'models' ? names.models.filter((n) => !abstractModels.has(n)) : names[kind];
    if (!declared.length) continue;
    body[kind] = Object.fromEntries(
      declared.map((name) => {
        const entry = registry[kind][name];
        if (entry === undefined) throw new Error(`no registry entry for ${kind} '${name}'`);

        return [name, entry];
      }),
    );
  }

  return `${JSON.stringify(stable(body), null, 2)}\n`;
}

function typesText(parsed: SchemaAST, files: Generated['files']): string {
  const names = owned(parsed);
  const sections: string[] = [];
  for (const kind of KINDS) {
    const declared = kind === 'models' ? names.models.filter((n) => !abstractModels.has(n)) : names[kind];
    for (const name of [...declared].sort()) {
      const path = `${kind}/${name.toLowerCase()}.ts`;
      const content = files.get(path);
      if (content === undefined) throw new Error(`no generated type file '${path}' for '${name}'`);
      sections.push(`// ===== ${path} =====\n${content}`);
    }
  }

  return sections.join('\n');
}

/** Generated files that belong to no one declaration, so they are snapshotted whole. */
const sharedPaths = (): string[] => [...first.all.keys()].filter((p) => !first.files.has(p)).sort();
const sharedSnapshotPath = (path: string): string => join(SNAPSHOT_DIR, 'shared', `${path}.snap`);

function snapshotPath(part: Part, schemaFile: string): string {
  return join(SNAPSHOT_DIR, part, schemaFile.replace(/\.cerial$/, SUFFIX[part]));
}

function expected(part: Part, schemaFile: string): string {
  const path = snapshotPath(part, schemaFile);
  if (!existsSync(path)) {
    throw new Error(`missing golden snapshot ${path}; if the corpus grew on purpose, run: bun run snapshot:update`);
  }

  return readFileSync(path, 'utf8');
}

// Top level so the shared-file tests below can be registered per file.
const tempDirs = [mkdtempSync(join(tmpdir(), 'cerial-golden-a-')), mkdtempSync(join(tmpdir(), 'cerial-golden-b-'))];
const first: Generated = await generate(tempDirs[0]!);
const second: Generated = await generate(tempDirs[1]!);

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const actualFor = (part: Part, i: number): string => {
  const parsed = corpus.parsed[i]!;
  if (part === 'ast') return astText(parsed);
  if (part === 'ddl') return ddlText(parsed, first.ddl);
  if (part === 'registry') return registryText(parsed, first.registry);

  return typesText(parsed, first.files);
};

describe('golden snapshot: preconditions', () => {
  test('the corpus parses without errors', () => {
    expect(corpus.errors).toEqual([]);
    expect(corpus.files.length).toBeGreaterThan(0);
  });

  test('every declaration is owned by exactly one schema file', () => {
    for (const kind of KINDS) {
      const all = corpus.parsed.flatMap((p) => owned(p)[kind]);
      expect(all.length).toBe(new Set(all).size);
      expect(all.length).toBe(resolvedBy[kind].size);
    }
  });

  test('two generations of the corpus are byte-identical in every file', () => {
    expect([...second.all.keys()].sort()).toEqual([...first.all.keys()].sort());
    for (const [path, content] of first.all) {
      // Compare per file so a failure names it.
      if (second.all.get(path) !== content) throw new Error(`generated file differs between runs: ${path}`);
    }
  });

  test('two generations of the corpus emit identical snapshot content', () => {
    expect(Object.keys(second.ddl).sort()).toEqual(Object.keys(first.ddl).sort());
    for (const name of Object.keys(first.ddl)) expect(second.ddl[name]).toEqual(first.ddl[name]!);
    expect([...second.files.keys()].sort()).toEqual([...first.files.keys()].sort());
    for (const [path, content] of first.files) expect(second.files.get(path)).toBe(content);
    expect(JSON.stringify(stable(second.registry))).toBe(JSON.stringify(stable(first.registry)));
  });

  test('snapshot content carries no machine-specific path', () => {
    const everything = corpus.files.flatMap((f, i) => PARTS.map((p) => actualFor(p, i)));
    for (const text of everything) {
      expect(text).not.toContain(tempDirs[0]!);
      expect(text).not.toContain(SCHEMAS_DIR);
    }
  });

  test('no snapshot file is left over for a schema that no longer exists', () => {
    if (UPDATE) return;
    const wanted = new Set([
      ...corpus.files.flatMap((f) => PARTS.map((p) => snapshotPath(p, f))),
      ...sharedPaths().map(sharedSnapshotPath),
    ]);
    const onDisk: string[] = [];
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else onDisk.push(path);
      }
    };
    walk(SNAPSHOT_DIR);
    expect(onDisk.filter((p) => !wanted.has(p)).sort()).toEqual([]);
  });
});

describe('golden snapshot: corpus', () => {
  if (UPDATE) {
    test('rewrite the snapshot', () => {
      rmSync(SNAPSHOT_DIR, { recursive: true, force: true });
      corpus.files.forEach((file, i) => {
        for (const part of PARTS) {
          const path = snapshotPath(part, file);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, actualFor(part, i));
        }
      });
      for (const path of sharedPaths()) {
        mkdirSync(dirname(sharedSnapshotPath(path)), { recursive: true });
        writeFileSync(sharedSnapshotPath(path), first.all.get(path)!);
      }
    });

    return;
  }

  describe('shared generated files', () => {
    for (const path of sharedPaths()) {
      test(path, () => {
        const snapshot = sharedSnapshotPath(path);
        if (!existsSync(snapshot)) {
          throw new Error(`missing golden snapshot ${snapshot}; if this is intended, run: bun run snapshot:update`);
        }
        expect(first.all.get(path)).toBe(readFileSync(snapshot, 'utf8'));
      });
    }
  });

  corpus.files.forEach((file, i) => {
    describe(file, () => {
      test('resolved AST', () => {
        expect(actualFor('ast', i)).toBe(expected('ast', file));
      });

      test('migration DDL', () => {
        expect(actualFor('ddl', i)).toBe(expected('ddl', file));
      });

      test('runtime registry', () => {
        expect(actualFor('registry', i)).toBe(expected('registry', file));
      });

      test('generated types', () => {
        expect(actualFor('types', i)).toBe(expected('types', file));
      });
    });
  });
});
