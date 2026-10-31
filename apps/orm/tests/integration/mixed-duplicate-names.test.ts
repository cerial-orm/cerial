/**
 * A name declared twice in one entry is refused whichever forms declare it, and both declarations are named.
 * Runs `generate` on real projects, so the refusal is proven end to end. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';

afterAll(removeMixedProjects);

type Form = 'dsl' | 'ts';
type Kind = 'model' | 'object' | 'tuple' | 'literal' | 'enum';

const CLI = resolve(import.meta.dir, '../../bin/cerial.ts');
const IMPORTS = "import { e, enum as enumeration, f, literal, model, object, tuple, variant } from 'cerial/schema';\n";

interface Declaration {
  readonly dsl: (name: string, tag: string) => string;
  readonly ts: (name: string, tag: string) => string;
}

// `tag` makes two declarations of one name differ, so the refusal cannot be mistaken for a repeat of one source
const DECLARATIONS: Record<Kind, Declaration> = {
  model: {
    dsl: (n, t) => `model ${n} {\n  id Record(int) @id\n  ${t} String\n}\n`,
    ts: (n, t) => `export const ${n} = model('${n}', { id: f.record('int').id(), ${t}: f.string() });\n`,
  },
  object: {
    dsl: (n, t) => `object ${n} {\n  ${t} String\n}\n`,
    ts: (n, t) => `export const ${n} = object('${n}', { ${t}: f.string() });\n`,
  },
  tuple: {
    dsl: (n) => `tuple ${n} {\n  Float,\n  Float\n}\n`,
    ts: (n) => `export const ${n} = tuple('${n}', { x: e.float(), y: e.float() });\n`,
  },
  literal: {
    dsl: (n, t) => `literal ${n} {\n  '${t}'\n}\n`,
    ts: (n, t) => `export const ${n} = literal('${n}', [variant.string('${t}')]);\n`,
  },
  enum: {
    dsl: (n, t) => `enum ${n} {\n  ${t.toUpperCase()}\n}\n`,
    ts: (n, t) => `export const ${n} = enumeration('${n}', ['${t.toUpperCase()}']);\n`,
  },
};

const KINDS = Object.keys(DECLARATIONS) as Kind[];
const COMBINATIONS: Array<[Form, Form]> = [
  ['dsl', 'dsl'],
  ['ts', 'ts'],
  ['dsl', 'ts'],
];

/** The file a declaration is written to; two declarations of one form never share a file */
function fileFor(form: Form, index: number): string {
  return form === 'dsl' ? `decl${index}.cerial` : `decl${index}.schema.ts`;
}

async function project(declared: Array<{ form: Form; kind: Kind; name: string; tag: string }>): Promise<string> {
  const files: Record<string, string> = {};
  declared.forEach(({ form, kind, name, tag }, i) => {
    const text = DECLARATIONS[kind][form](name, tag);
    files[fileFor(form, i)] = form === 'ts' ? IMPORTS + text : text;
  });

  return mixedProject(files);
}

async function generateIn(dir: string): Promise<{ success: boolean; errors: string[]; files: string[] }> {
  return generateSingleSchema({ schemaPath: dir, outputDir: join(dir, 'out'), logLevel: 'minimal' });
}

describe('the same name declared twice', () => {
  for (const kind of KINDS) {
    for (const [first, second] of COMBINATIONS) {
      it(`refuses two ${kind} declarations: ${first} then ${second}`, async () => {
        const dir = await project([
          { form: first, kind, name: 'Dup', tag: 'one' },
          { form: second, kind, name: 'Dup', tag: 'two' },
        ]);

        const built = await buildResolvedSchemaAst({ schemaPath: dir });
        const result = await generateIn(dir);
        const text = result.errors.join('\n');

        expect(built.parseErrors).toEqual([]);
        expect(built.resolvedAST).toBeNull();
        expect(result.success).toBe(false);
        expect(text).toContain(`Duplicate ${kind} name: Dup`);
        expect(existsSync(join(dir, 'out'))).toBe(false);

        // Both origins appear, each in its own form: `file:line` for .cerial, `file (export X)` for TypeScript
        const origin = (form: Form, index: number): string =>
          form === 'dsl' ? `${join(dir, fileFor(form, index))}:` : `${join(dir, fileFor(form, index))} (export Dup)`;
        expect(text).toContain(origin(first, 0));
        expect(text).toContain(origin(second, 1));
      });
    }
  }

  it('shows a .cerial line number next to the TypeScript export in a mixed collision', async () => {
    const dir = await project([
      { form: 'dsl', kind: 'model', name: 'Dup', tag: 'one' },
      { form: 'ts', kind: 'model', name: 'Dup', tag: 'two' },
    ]);

    const result = await generateIn(dir);

    expect(result.errors.join('\n')).toMatch(/decl0\.cerial:\d+ and in .*decl1\.schema\.ts \(export Dup\)/);
  });

  it('does not stop at the first duplicate, so every one is listed', async () => {
    const dir = await project([
      { form: 'dsl', kind: 'model', name: 'A', tag: 'one' },
      { form: 'ts', kind: 'model', name: 'A', tag: 'two' },
      { form: 'dsl', kind: 'object', name: 'B', tag: 'one' },
      { form: 'ts', kind: 'object', name: 'B', tag: 'two' },
    ]);

    const text = (await generateIn(dir)).errors.join('\n');

    expect(text).toContain('Duplicate model name: A');
    expect(text).toContain('Duplicate object name: B');
  });

  it('exits non-zero from the CLI and writes no client', async () => {
    const dir = await project([
      { form: 'dsl', kind: 'model', name: 'Dup', tag: 'one' },
      { form: 'ts', kind: 'model', name: 'Dup', tag: 'two' },
    ]);
    const proc = Bun.spawn(['bun', CLI, 'generate', '-s', dir, '-o', join(dir, 'out'), '-y'], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stderr, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

    expect(code).toBe(1);
    expect(stderr).toContain('Duplicate model name: Dup');
    expect(existsSync(join(dir, 'out'))).toBe(false);
  });
});

describe('one name shared by two kinds', () => {
  const cases: Array<{ label: string; a: [Form, Kind]; b: [Form, Kind]; message: string }> = [
    {
      label: 'a .cerial model and a TypeScript object',
      a: ['dsl', 'model'],
      b: ['ts', 'object'],
      message:
        'Duplicate name: Dup (declared as model in decl0.cerial:1 and as object in decl1.schema.ts (export Dup))',
    },
    {
      label: 'a TypeScript model and a .cerial object',
      a: ['ts', 'model'],
      b: ['dsl', 'object'],
      message:
        'Duplicate name: Dup (declared as model in decl0.schema.ts (export Dup) and as object in decl1.cerial:1)',
    },
    {
      label: 'a TypeScript enum and a .cerial literal',
      a: ['ts', 'enum'],
      b: ['dsl', 'literal'],
      message:
        'Duplicate name: Dup (declared as literal in decl1.cerial:1 and as enum in decl0.schema.ts (export Dup))',
    },
    {
      label: 'a .cerial enum and a TypeScript literal',
      a: ['dsl', 'enum'],
      b: ['ts', 'literal'],
      message:
        'Duplicate name: Dup (declared as literal in decl1.schema.ts (export Dup) and as enum in decl0.cerial:1)',
    },
    {
      label: 'a TypeScript tuple and a .cerial model',
      a: ['ts', 'tuple'],
      b: ['dsl', 'model'],
      message: 'Duplicate name: Dup (declared as model in decl1.cerial:1 and as tuple in decl0.schema.ts (export Dup))',
    },
  ];

  for (const { label, a, b, message } of cases) {
    it(`refuses ${label}`, async () => {
      const dir = await project([
        { form: a[0], kind: a[1], name: 'Dup', tag: 'one' },
        { form: b[0], kind: b[1], name: 'Dup', tag: 'two' },
      ]);

      const result = await generateIn(dir);
      // Origins are absolute paths into a temporary directory; compare them relative to it
      const found = result.errors.map((e) => e.replaceAll(/\S*\/(decl\d)/g, '$1')).filter((e) => e.includes('Dup'));

      expect(result.success).toBe(false);
      expect(found).toEqual([message]);
      expect(existsSync(join(dir, 'out'))).toBe(false);
    });
  }
});

describe('one declaration reached through two modes', () => {
  const MODEL_DSL = DECLARATIONS.model.dsl('Shop', 'title');
  const MODEL_TS = IMPORTS + DECLARATIONS.model.ts('Basket', 'note');

  it('is not a duplicate when a mixed entry lists the files it also discovers', async () => {
    const dir = await mixedProject({ 'shop.cerial': MODEL_DSL, 'basket.schema.ts': MODEL_TS });

    const result = await generateSingleSchema({
      schemaPath: dir,
      files: [join(dir, 'shop.cerial'), join(dir, 'basket.schema.ts')],
      outputDir: join(dir, 'out'),
      logLevel: 'minimal',
    });

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    expect(existsSync(join(dir, 'out'))).toBe(true);
  });

  it('is not a duplicate when the same file is listed twice and also discovered', async () => {
    const dir = await mixedProject({ 'shop.cerial': MODEL_DSL, 'basket.schema.ts': MODEL_TS });
    const listed = [join(dir, 'shop.cerial'), join(dir, 'shop.cerial'), join(dir, 'basket.schema.ts')];

    const built = await buildResolvedSchemaAst({ schemaPath: dir, files: [...listed, ...listed] });

    expect(built.extendsErrors).toEqual([]);
    expect(built.resolvedAST?.models.map((m) => m.name).sort()).toEqual(['Basket', 'Shop']);
  });
});
