/**
 * Guard for `DERIVED_SUFFIXES`: every type the generators export for a declaration is the declaration's name
 * or its name plus a suffix listed for its kind. A generator that adds a suffix fails here instead of silently
 * bypassing the derived-name collision check. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { DERIVED_SUFFIXES, FIXED_EXPORTS, derivedTypeNames } from '../../src/cli/validators/name-validator';

const CORPUS = resolve(import.meta.dir, '../e2e/schemas');
const EXPORT = /^export (?:declare )?(?:type|interface|const|class|enum|function) ([A-Za-z_]\w*)/gm;

let outDir = '';
afterAll(() => (outDir ? rm(outDir, { recursive: true, force: true }) : undefined));

describe('generated type names follow DERIVED_SUFFIXES', () => {
  it('names every exported type after its declaration plus a listed suffix', async () => {
    outDir = await mkdtemp(join(tmpdir(), 'cerial-derived-'));
    const built = await buildResolvedSchemaAst({ schemaPath: CORPUS });
    const result = await generateSingleSchema({ schemaPath: CORPUS, outputDir: outDir, logLevel: 'minimal' });
    expect(result.success).toBe(true);

    const ast = built.resolvedAST;
    if (!ast) throw new Error('corpus did not resolve');
    const declarations = [
      ...ast.models.filter((m) => !m.abstract).map((d) => ({ kind: 'model' as const, name: d.name })),
      ...ast.objects.map((d) => ({ kind: 'object' as const, name: d.name })),
      ...ast.tuples.map((d) => ({ kind: 'tuple' as const, name: d.name })),
      ...ast.literals.map((d) => ({ kind: 'literal' as const, name: d.name })),
      ...ast.enums.map((d) => ({ kind: 'enum' as const, name: d.name })),
    ];

    const exported = new Set<string>();
    for (const file of result.files) {
      if (!file.endsWith('.ts')) continue;
      const text = await readFile(file.startsWith('/') ? file : join(outDir, file), 'utf8');
      for (const m of text.matchAll(EXPORT)) exported.add(m[1]!);
    }

    const unexplained: string[] = [];
    for (const name of exported) {
      const related = declarations.filter((d) => name.startsWith(d.name));
      if (!related.length) continue;
      const ok = related.some((d) => name === d.name || DERIVED_SUFFIXES[d.kind].some((s) => name === `${d.name}${s}`));
      if (!ok) unexplained.push(name);
    }

    // Every export of the client entry points is a declaration's derived name or a fixed client export
    const accounted = new Set([...FIXED_EXPORTS, ...declarations.flatMap((d) => derivedTypeNames(d.kind, d.name))]);
    const surface = new Set<string>();
    for (const entry of ['index.ts', 'client.ts']) {
      const text = await readFile(join(outDir, entry), 'utf8');
      for (const m of text.matchAll(EXPORT)) surface.add(m[1]!);
      for (const m of text.matchAll(/^export (?:type )?\{([^}]*)\}/gm)) {
        for (const part of m[1]!.split(',')) {
          const name = part
            .trim()
            .split(/\s+as\s+/)
            .pop();
          if (name) surface.add(name);
        }
      }
    }
    // `Post$Relations` holds a character no declaration name can, so it cannot collide
    const unaccounted = [...surface].filter((n) => !accounted.has(n) && !n.includes('$'));

    // Every local binding a generated file imports from an external package shares the module namespace with the declarations
    const imported = new Set<string>();
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const nested = await Promise.all(
        entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
      );

      return nested.flat();
    };
    for (const file of (await walk(outDir)).filter((f) => f.endsWith('.ts'))) {
      const text = await readFile(file, 'utf8');
      for (const m of text.matchAll(/^import\s+(?:type\s+)?([^;]*?)\s+from\s+'([^']+)'/gm)) {
        if (m[2]!.startsWith('.')) continue;
        const clause = m[1]!;
        const named = /\{([^}]*)\}/.exec(clause)?.[1] ?? '';
        for (const part of named.split(',')) {
          const name = part
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)
            .pop();
          if (name) imported.add(name);
        }
        const rest = clause.replace(/\{[^}]*\}/, '');
        for (const part of rest.split(',')) {
          const name = part.trim().replace(/^\*\s+as\s+/, '');
          if (name) imported.add(name);
        }
      }
    }
    const unlistedImports = [...imported].filter((n) => !FIXED_EXPORTS.has(n));

    expect(imported.size).toBeGreaterThan(10);
    expect(unlistedImports).toEqual([]);
    expect(surface.size).toBeGreaterThan(100);
    expect(unaccounted).toEqual([]);
    expect(exported.size).toBeGreaterThan(100);
    expect(unexplained).toEqual([]);
  });
});
