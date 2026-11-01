import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { compareExact } from '../../../../src/cli/convert/compare';
import { commentLines, emitTypescript } from '../../../../src/cli/convert/emit-ts';
import type { EmitTypescriptResult } from '../../../../src/cli/convert/emit-ts';
import { splitLines } from '../../../../src/cli/convert/emit-ts/strings';
import { runPassThree } from '../../../../src/cli/passes/pass-three';
import type { SchemaSource } from '../../../../src/cli/passes/types';
import { attachComments } from '../../../../src/formatter';
import type { CommentMap } from '../../../../src/formatter';
import { loadDeclarations, materialise } from '../../../../src/parser/builder';
import { tokenize } from '../../../../src/parser/tokenizer';
import type { SchemaAST } from '../../../../src/types';
import { findSchemaFiles, SCHEMAS_DIR } from '../../../generators/parity-corpus';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const FIXTURES = resolve(import.meta.dir, '../../../fixtures/convert/extends-order');
const dirs: string[] = [];

// Built from code points because a formatter rewrites the escape into the raw character
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-emit-module-'));
  dirs.push(dir);

  return dir;
}

interface Project {
  readonly dir: string;
  readonly ast: SchemaAST;
  readonly sources: readonly SchemaSource[];
  readonly comments: Map<string, CommentMap>;
}

function onlyFrom(ast: SchemaAST, file: string): SchemaAST {
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

/** Parses the files together, as `generate` does, and attaches each file's comments. */
function project(dir: string, files: Record<string, string>): Project {
  const sources = Object.entries(files).map(([name, content]) => ({ path: join(dir, name), content }));
  const { ast, errors } = runPassThree(sources);
  expect(errors).toEqual([]);
  const comments = new Map<string, CommentMap>();
  for (const { path, content } of sources) {
    comments.set(path, attachComments(tokenize(content), onlyFrom(ast, path)));
  }

  return { dir, ast, sources, comments };
}

function fixture(...names: string[]): Project {
  const dir = scratch();
  const files: Record<string, string> = {};
  for (const name of names) files[name] = readFileSync(join(FIXTURES, name), 'utf8');

  return project(dir, files);
}

function emit(p: Project, withComments = true): EmitTypescriptResult {
  return emitTypescript(p.ast, { schemaImport: SCHEMA_MODULE, comments: withComments ? p.comments : undefined });
}

function write(result: EmitTypescriptResult): void {
  for (const module of result.modules) {
    mkdirSync(dirname(module.path), { recursive: true });
    writeFileSync(module.path, module.text);
  }
}

function textOf(result: EmitTypescriptResult, file: string): string {
  const found = result.modules.find((module) => module.file.endsWith(file));
  expect(found).toBeDefined();

  return found!.text;
}

/** Loads the emitted modules, importing them in the order given, and compares with the parsed source. */
async function loadAndCompare(
  p: Project,
  result: EmitTypescriptResult,
  order: readonly string[] = [],
): Promise<string[]> {
  write(result);
  const paths = result.modules.map((module) => module.path);
  const first = order.map((name) => join(p.dir, name.replace(/\.cerial$/, '.schema.ts')));
  const files = [...first, ...paths.filter((path) => !first.includes(path))];
  const built = materialise(await loadDeclarations(files));

  return compareExact(p.ast, built, {
    tolerate: {
      declarationOrder: result.modules.flatMap((module) => module.hoisted),
      directiveKindOrder: result.modules.flatMap((module) => module.directiveKindOrder),
    },
  });
}

describe('declaration order', () => {
  test('hoists a parent above its child', async () => {
    const p = fixture('child-first.cerial');
    const result = emit(p);
    const text = textOf(result, 'child-first.cerial');

    expect(text.indexOf('export const Base')).toBeGreaterThan(-1);
    expect(text.indexOf('export const Base')).toBeLessThan(text.indexOf('export const Child'));
    expect(result.modules[0]!.hoisted).toEqual(['Base']);
    expect(await loadAndCompare(p, result)).toEqual([]);
  });

  test('the hoist is the only difference the comparison needs to tolerate', async () => {
    const p = fixture('child-first.cerial');
    const result = emit(p);
    write(result);
    const built = materialise(await loadDeclarations(result.modules.map((module) => module.path)));

    expect(compareExact(p.ast, built)).not.toEqual([]);
    expect(compareExact(p.ast, built, { tolerate: { declarationOrder: ['Base'] } })).toEqual([]);
    expect(compareExact(p.ast, built, { tolerate: { declarationOrder: ['Nobody'] } })).not.toEqual([]);
  });

  test('hoists a chain of three', async () => {
    const p = fixture('chain.cerial');
    const result = emit(p);
    const text = textOf(result, 'chain.cerial');
    const at = (name: string) => text.indexOf(`export const ${name}`);

    expect(at('Bottom')).toBeLessThan(at('Middle'));
    expect(at('Middle')).toBeLessThan(at('Top'));
    expect([...result.modules[0]!.hoisted].sort()).toEqual(['Bottom', 'Middle']);
    expect(await loadAndCompare(p, result)).toEqual([]);
  });

  test('a file already in order hoists nothing and tolerates nothing', async () => {
    const p = fixture('in-order.cerial');
    const result = emit(p);

    expect(result.modules[0]!.hoisted).toEqual([]);
    write(result);
    const built = materialise(await loadDeclarations(result.modules.map((module) => module.path)));
    expect(compareExact(p.ast, built)).toEqual([]);
  });

  test('keeps the source order of unrelated declarations', () => {
    const p = project(scratch(), {
      'order.cerial': 'object B {\n  n Int\n}\n\nenum A {\n  X\n}\n\nobject C {\n  n Int\n}\n',
    });
    const text = textOf(emit(p), 'order.cerial');
    const at = (name: string) => text.indexOf(`export const ${name}`);

    expect(at('B')).toBeLessThan(at('A'));
    expect(at('A')).toBeLessThan(at('C'));
    expect(text).toContain('import { enum as enumeration, f, object } from');
  });
});

describe('modules and imports', () => {
  test('names each module after its file and imports only what it uses', () => {
    const p = fixture('back-edge/a.cerial', 'back-edge/b.cerial');
    const result = emit(p);

    expect(result.modules.map((module) => module.path)).toEqual([
      join(p.dir, 'back-edge/a.schema.ts'),
      join(p.dir, 'back-edge/b.schema.ts'),
    ]);
    expect(textOf(result, 'a.cerial')).toContain(`import { f, object } from '${SCHEMA_MODULE}';`);
    expect(textOf(result, 'a.cerial')).toContain("import { Base } from './b.schema';");
  });

  test('a mixed entry imports a name from the TypeScript module that exports it', () => {
    const p = project(scratch(), { 'user.cerial': 'model User extends Base {\n  name String\n}\n' });
    const base = {
      ...p.ast.models[0]!,
      name: 'Base',
      extends: undefined,
      origin: { kind: 'ts' as const, file: join(p.dir, 'shared/base.schema.ts'), export: 'BaseModel' },
    };
    const ast: SchemaAST = { ...p.ast, models: [...p.ast.models, base] };
    const text = textOf(emitTypescript(ast, { schemaImport: SCHEMA_MODULE }), 'user.cerial');

    expect(text).toContain("import { BaseModel } from './shared/base.schema';");
    expect(text).toContain('extends: BaseModel');
  });

  test('emitting twice gives equal text', () => {
    const p = fixture('child-first.cerial');

    expect(emit(p)).toEqual(emit(p));
    expect(emit(p).modules[0]!.text).toBe(emit(p).modules[0]!.text);
  });
});

describe('extends across modules', () => {
  test('emits a thunk back-edge as a bare string, in either import order', async () => {
    const names = ['back-edge/a.cerial', 'back-edge/b.cerial'] as const;
    for (const order of [names, [names[1], names[0]]]) {
      const p = fixture(...names);
      const result = emit(p);

      expect(result.refusals).toEqual([]);
      expect(textOf(result, 'b.cerial')).toContain("marker: f.object('Marker')");
      expect(textOf(result, 'b.cerial')).not.toContain("'./a.schema'");
      expect(await loadAndCompare(p, result, order)).toEqual([]);
    }
  });

  test('refuses a pure extends cycle, one record per child, and does not throw', () => {
    const p = fixture('cycle/a.cerial', 'cycle/b.cerial');
    const result = emit(p);

    expect(result.refusals.map((r) => [r.caseId, r.declaration]).sort()).toEqual([
      ['extends-cross-file-cycle', 'Child'],
      ['extends-cross-file-cycle', 'Other'],
    ]);
    expect(result.refusals.find((r) => r.declaration === 'Child')!.module).toBe(join(p.dir, 'cycle/a.schema.ts'));
    expect(result.refusals.every((r) => r.reason.includes('extends'))).toBe(true);
    expect(result.modules).toEqual([]);
  });

  test('an import cycle of only thunks and strings emits and loads, in either order', async () => {
    const names = ['thunks/a.cerial', 'thunks/b.cerial'] as const;
    for (const order of [names, [names[1], names[0]]]) {
      const p = fixture(...names);
      const result = emit(p);

      expect(result.refusals).toEqual([]);
      expect(textOf(result, 'a.cerial')).toContain('f.object(() => Right)');
      expect(textOf(result, 'b.cerial')).toContain('f.object(() => Plain)');
      expect(await loadAndCompare(p, result, order)).toEqual([]);
    }
  });

  test('a reference without a cycle in between is the handle itself', async () => {
    const p = project(scratch(), {
      'a.cerial': 'object Used {\n  n Int\n}\n',
      'b.cerial': 'object User {\n  used Used?\n}\n',
    });
    const result = emit(p);

    expect(textOf(result, 'b.cerial')).toContain('f.object(Used)');
    expect(await loadAndCompare(p, result)).toEqual([]);
  });

  test('a declaration that refers to itself is a bare name', async () => {
    const p = project(scratch(), { 'tree.cerial': 'object Tree {\n  n Int\n  child Tree?\n}\n' });
    const result = emit(p);

    expect(textOf(result, 'tree.cerial')).toContain("f.object('Tree')");
    expect(await loadAndCompare(p, result)).toEqual([]);
  });

  test('two declarations that refer to each other are bare names', async () => {
    const p = project(scratch(), {
      'pair.cerial': 'object Left {\n  right Right?\n}\n\nobject Right {\n  left Left?\n}\n',
    });
    const result = emit(p);
    const text = textOf(result, 'pair.cerial');

    expect(text).toContain("f.object('Right')");
    expect(text).toContain("f.object('Left')");
    expect(await loadAndCompare(p, result)).toEqual([]);
  });
});

describe('comments', () => {
  const COMMENTED = [
    '# header',
    '',
    '# about User',
    'model User { # open',
    '  id Record @id',
    '  # about name',
    '  name String # trailing name',
    '  age Int',
    '}',
    '',
    '/* about',
    ' * Role */',
    'enum Role {',
    '  Admin',
    '}',
    '# footer',
    '',
  ].join('\n');

  test('prints each comment as // beside the declaration or field it belongs to', async () => {
    const p = project(scratch(), { 'user.cerial': COMMENTED });
    const result = emit(p);
    const text = textOf(result, 'user.cerial');

    expect(text.startsWith('// header\n\nimport {')).toBe(true);
    expect(text).toContain('// about User\n// open\nexport const User = model(');
    expect(text).toContain('    // about name\n    name: f.string(), // trailing name\n');
    expect(text).toContain('// about\n// Role\nexport const Role = enumeration(');
    expect(text.trimEnd().endsWith('// footer')).toBe(true);
    expect(await loadAndCompare(p, result)).toEqual([]);
  });

  test('a comment on a derived foreign key is kept above its declaration', async () => {
    const p = project(scratch(), {
      'post.cerial': [
        'model User {',
        '  id Record @id',
        '}',
        '',
        'model Post {',
        '  id Record @id',
        '  # the key',
        '  authorId Record',
        '  author Relation @field(authorId) @model(User)',
        '}',
        '',
      ].join('\n'),
    });
    const result = emit(p);
    const text = textOf(result, 'post.cerial');

    expect(text).toContain('// the key');
    expect(text).not.toContain('authorId:');
    expect(await loadAndCompare(p, result)).toEqual([]);
  });

  test('a hoisted parent takes its comments with it', () => {
    const p = project(scratch(), {
      'order.cerial':
        '# child note\nobject Child extends Base {\n  n Int\n}\n\n# base note\nobject Base {\n  m Int\n}\n',
    });
    const text = textOf(emit(p), 'order.cerial');

    expect(text).toContain('// base note\nexport const Base');
    expect(text).toContain('// child note\nexport const Child');
    expect(text.indexOf('// base note')).toBeLessThan(text.indexOf('// child note'));
  });

  test('a file with no comments prints none', () => {
    const p = project(scratch(), { 'plain.cerial': 'object Plain {\n  n Int\n}\n' });

    for (const withComments of [true, false]) {
      expect(textOf(emit(p, withComments), 'plain.cerial')).not.toMatch(/^\s*\/\//m);
    }
  });

  test('emitting twice gives equal text', () => {
    const p = project(scratch(), { 'user.cerial': COMMENTED });

    expect(emit(p).modules[0]!.text).toBe(emit(p).modules[0]!.text);
  });

  test('line and paragraph separators end nothing: such a comment evaluates to no code', async () => {
    const source = [
      `# note${LS}globalThis.__ran = 'hash'${PS}more`,
      `/* block${LS}globalThis.__ran = 'block' */`,
      'object Safe {',
      `  # field${LS}globalThis.__ran = 'field'`,
      '  n Int',
      '}',
      '',
    ].join('\n');
    const p = project(scratch(), { 'safe.cerial': source });
    const result = emit(p);
    const text = textOf(result, 'safe.cerial');

    expect(text).not.toContain(LS);
    expect(text).not.toContain(PS);
    for (const line of text.split('\n').filter((l) => l.includes('__ran'))) expect(line.trim()).toMatch(/^\/\//);
    expect(await loadAndCompare(p, result)).toEqual([]);
    expect((globalThis as Record<string, unknown>).__ran).toBeUndefined();
  });

  test('an ordinary comment prints unchanged', () => {
    expect(commentLines('// plain note')).toEqual(['// plain note']);
    expect(commentLines('//tight')).toEqual(['//tight']);
    expect(commentLines('# hash note')).toEqual(['// hash note']);
    expect(commentLines('/* one */')).toEqual(['// one']);
    expect(commentLines(`# a${LS}b${PS}c`)).toEqual(['// a', '//b', '//c']);
    expect(commentLines('# crlf\r')).toEqual(['// crlf', '//']);
  });

  test('splits at every JavaScript line terminator and nowhere else', () => {
    expect(splitLines(`a${LS}b${PS}c\r\nd\re\nf g`)).toEqual(['a', 'b', 'c', 'd', 'e', 'f g']);
    expect(splitLines('no break')).toEqual(['no break']);
  });
});

describe('every corpus comment', () => {
  test('is present in the output', () => {
    const dir = scratch();
    const files = findSchemaFiles(SCHEMAS_DIR);
    expect(files.length).toBeGreaterThan(0);
    const sources = files.map((file) => ({
      path: join(dir, relative(SCHEMAS_DIR, file)),
      content: readFileSync(file, 'utf8'),
    }));
    const { ast, errors } = runPassThree(sources);
    expect(errors).toEqual([]);
    const comments = new Map<string, CommentMap>();
    for (const { path, content } of sources) comments.set(path, attachComments(tokenize(content), onlyFrom(ast, path)));

    const result = emitTypescript(ast, { schemaImport: SCHEMA_MODULE, comments });
    expect(result.refusals).toEqual([]);

    let counted = 0;
    let hash = 0;
    for (const { path, content } of sources) {
      const module = result.modules.find((m) => m.file === path);
      expect(module).toBeDefined();
      for (const token of tokenize(content).filter((t) => t.type === 'comment')) {
        counted++;
        if (token.value.startsWith('#')) hash++;
        const body = token.value.replace(/^(#|\/\/|\/\*)/, '').replace(/\*\/$/, '');
        for (const line of splitLines(body)) {
          const text = line
            .trim()
            .replace(/^\*\s?/, '')
            .trim();
          if (text) expect(module!.text).toContain(text);
        }
      }
    }
    expect(counted).toBeGreaterThan(0);
    expect(hash).toBeGreaterThan(0);
  });
});
