import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { renderUsage } from 'citty';
import { convertCommand } from '../../../../src/cli/commands/convert';
import { LOSSY_CASES, runConvert } from '../../../../src/cli/convert';
import type { ConvertOptions, ConvertResult } from '../../../../src/cli/convert';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { CerialGenerationError } from '../../../../src/errors';
import type { SchemaAST } from '../../../../src/types';

const SCHEMA_MODULE = resolve(import.meta.dir, '../../../../src/schema');
const LOSSY = resolve(import.meta.dir, '../../../fixtures/convert/lossy');
const EXTENDS_ORDER = resolve(import.meta.dir, '../../../fixtures/convert/extends-order');
const originalCwd = process.cwd();

let root: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'cerial-lossy-')));
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(root, { recursive: true, force: true });
});

const IMPORT = `import { defineSchema, e, enum as enum_, f, literal, model, object, tuple, variant } from '${SCHEMA_MODULE}';\n`;
const mod = (body: string): string => `${IMPORT}${body}\n`;

const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Hash and mtime of every entry, so a touched or rewritten file shows. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of (await readdir(dir, { recursive: true })).sort()) {
    const info = await lstat(join(dir, name));
    out[name] = info.isFile()
      ? `${hash(await readFile(join(dir, name)))}@${info.mtimeMs}`
      : info.isDirectory()
        ? 'dir'
        : 'link';
  }

  return out;
}

async function project(files: Record<string, string>): Promise<void> {
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true });
    await writeFile(join(root, name), text);
  }
}

const fixture = (name: string): Promise<string> => readFile(join(LOSSY, name), 'utf8');
const extendsFixture = (name: string): Promise<string> => readFile(join(EXTENDS_ORDER, name), 'utf8');

const toCerial = (options: ConvertOptions = {}): Promise<ConvertResult> =>
  runConvert({ to: 'cerial', schema: root, ...options });

const toTs = (options: ConvertOptions = {}): Promise<ConvertResult> =>
  runConvert({ to: 'ts', schema: root, schemaImport: SCHEMA_MODULE, ...options });

/** Runs a conversion that must be refused with a generation error, and proves the tree is byte- and mtime-identical. */
async function refused(run: () => Promise<unknown>): Promise<string> {
  const before = await snapshot(root);
  const error = await run().then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CerialGenerationError);
  expect(await snapshot(root)).toEqual(before);

  return (error as CerialGenerationError).message;
}

async function parsed(dir: string): Promise<SchemaAST> {
  const built = await buildResolvedSchemaAst({ schemaPath: dir });
  expect(built.parseErrors).toEqual([]);

  return built.combinedAST;
}

interface Expanded {
  readonly texts: Record<string, string>;
  readonly ast: SchemaAST;
  readonly result: ConvertResult;
}

/** Converts TypeScript to .cerial under `out`, then reparses what was written. */
async function expandToCerial(files: Record<string, string>, options: ConvertOptions = {}): Promise<Expanded> {
  await project(files);
  const out = join(root, 'out');
  const result = await toCerial({ output: out, ...options });
  const texts: Record<string, string> = {};
  for (const name of (await readdir(out, { recursive: true })).sort())
    if (name.endsWith('.cerial')) texts[name] = await readFile(join(out, name), 'utf8');

  return { texts, ast: await parsed(out), result };
}

const allText = (expanded: Expanded): string => Object.values(expanded.texts).join('\n');
const modelNames = (ast: SchemaAST): string[] => ast.models.map((m) => m.name).sort();

const EXPANDED = '// expanded by cerial convert:';
const DERIVED = '// derived by cerial convert from the TypeScript relation';

/** Rows register here as they are defined, so the last test can tell which are missing. */
const proven = new Set<string>();

function row(id: string, run: () => Promise<void>): void {
  if (proven.has(id)) throw new Error(`Row '${id}' is tested twice`);
  proven.add(id);
  it(id, run);
}

/** The ids with no test, and the tests with no row. */
function unproven(rowIds: readonly string[], testIds: ReadonlySet<string>): { missing: string[]; stray: string[] } {
  return {
    missing: rowIds.filter((id) => !testIds.has(id)),
    stray: [...testIds].filter((id) => !rowIds.includes(id)),
  };
}

const AUTHOR = "export const Author = model('Author', { id: f.record().id(), name: f.string() });";
const authorModule = mod(AUTHOR);

describe('rows that expand, --to cerial', () => {
  row('loop-built-model', async () => {
    const out = await expandToCerial({
      'loop.schema.ts': mod(
        "export const [Alpha, Beta, Gamma] = ['Alpha', 'Beta', 'Gamma'].map((n) => model(n, { id: f.record().id() }));",
      ),
    });

    const text = allText(out);
    for (const name of ['Alpha', 'Beta', 'Gamma'])
      expect(text).toMatch(new RegExp(`${EXPANDED} built by a loop in TypeScript[^\\n]*\\nmodel ${name} \\{`));
    expect(modelNames(out.ast)).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  row('helper-built-declaration', async () => {
    const out = await expandToCerial({
      'make.ts': mod('export function makeUser(name: string) { return model(name, { id: f.record().id() }); }'),
      'user.schema.ts': mod("import { makeUser } from './make';\nexport const User = makeUser('User');"),
      'local.schema.ts': mod(
        "const make = (name: string) => model(name, { id: f.record().id() });\nexport const Local = make('Local');",
      ),
    });

    expect(out.texts['user.cerial']).toMatch(/built by the function 'makeUser' in TypeScript[^\n]*\nmodel User \{/);
    expect(out.texts['local.cerial']).toMatch(/built by the function 'make' in TypeScript[^\n]*\nmodel Local \{/);
    expect(out.texts['user.cerial']).toContain(EXPANDED);
    expect(modelNames(out.ast)).toEqual(['Local', 'User']);
  });

  row('shared-field-set', async () => {
    const out = await expandToCerial({
      'doc.schema.ts': mod(
        [
          'const timestamps = { createdAt: f.date().createdAt(), updatedAt: f.date().updatedAt() };',
          "const label = f.string().default('x');",
          "export const Doc = model('Doc', { id: f.record().id(), ...timestamps, tag: label.optional() });",
          "export const Note = model('Note', { id: f.record().id(), ...timestamps });",
        ].join('\n'),
      ),
    });

    const text = out.texts['doc.cerial']!;
    expect(text).toContain("fields shared in TypeScript ('timestamps')");
    expect(text).toContain("fields shared in TypeScript ('label')");
    expect(text.match(/createdAt /g)).toHaveLength(2);
    expect(modelNames(out.ast)).toEqual(['Doc', 'Note']);
    expect(out.ast.models.find((m) => m.name === 'Doc')!.fields.map((x) => x.name)).toEqual([
      'id',
      'createdAt',
      'updatedAt',
      'tag',
    ]);
  });

  row('literal-constant-argument', async () => {
    const out = await expandToCerial({
      'limit.schema.ts': mod(
        [
          'const LIMIT = 5;',
          "const ROLES = ['admin', 'guest'] as const;",
          "export const Cap = model('Cap', { id: f.record().id(), max: f.int().default(LIMIT) });",
          "export const Role = enum_('Role', ROLES);",
        ].join('\n'),
      ),
    });

    const text = out.texts['limit.cerial']!;
    expect(text).toContain('@default(5)');
    expect(text).toMatch(/enum Role \{\s*admin,\s*guest\s*\}/);
    expect(text).not.toContain('//');
    expect(out.ast.enums.map((x) => x.name)).toEqual(['Role']);
  });

  row('derived-foreign-key', async () => {
    const out = await expandToCerial({
      'author.schema.ts': authorModule,
      'tag.schema.ts': mod("export const Tag = model('Tag', { id: f.record().id() });"),
      'post.schema.ts': mod(
        [
          "import { Author } from './author.schema';",
          "import { Tag } from './tag.schema';",
          "export const Post = model('Post', {",
          '  id: f.record().id(),',
          '  author: f.relation(() => Author),',
          '  tags: f.relation(() => Tag).array(),',
          "  reviewer: f.relation(() => Author).optional().onDelete('SetNull'),",
          "  owner: f.relation(() => Author).optional().onDelete('SetNone'),",
          "  editor: f.relation(() => Author).field('editedBy'),",
          '});',
        ].join('\n'),
      ),
    });

    const text = out.texts['post.cerial']!;
    for (const [relation, key] of [
      ['author', 'authorId'],
      ['tags', 'tagIds'],
      ['reviewer', 'reviewerId'],
      ['owner', 'ownerId'],
      ['editor', 'editedBy'],
    ] as const)
      expect(text).toMatch(new RegExp(`${DERIVED} '${relation}': the key was not declared there\\n\\s+${key} `));
    expect(text.match(/derived by cerial convert/g)).toHaveLength(5);
    expect(text).not.toMatch(/derived by cerial convert[^\n]*\n\s+(author|tags|reviewer|owner|editor) /);
    expect(out.texts['author.cerial']).not.toContain('derived by');
    expect(modelNames(out.ast)).toEqual(['Author', 'Post', 'Tag']);
  });

  row('inherited-derived-key', async () => {
    const out = await expandToCerial({
      'author.schema.ts': authorModule,
      'base.schema.ts': mod(
        "import { Author } from './author.schema';\nexport const Base = model('Base', { id: f.record().id(), author: f.relation(() => Author) }, { abstract: true });",
      ),
      'child.schema.ts': mod(
        "import { Base } from './base.schema';\nexport const Child = model('Child', { name: f.string() }, { extends: Base });",
      ),
    });

    expect(out.texts['base.cerial']).toMatch(new RegExp(`${DERIVED} 'author'[^\\n]*\\n\\s+authorId `));
    expect(out.texts['child.cerial']).not.toContain('derived by');
    expect(out.texts['child.cerial']).not.toContain('authorId');
    expect(out.texts['child.cerial']).toContain('model Child extends Base');
  });

  row('bound-or-reverse-relation', async () => {
    const out = await expandToCerial({
      'author.schema.ts': mod(
        "export const Author = model('Author', { id: f.record().id(), posts: f.reverse(() => Post).array() });\nexport const Post = model('Post', { id: f.record().id(), authorRef: f.record(), author: f.relation(() => Author).field('authorRef') });",
      ),
    });

    const text = allText(out);
    expect(text).toContain('authorRef');
    expect(text).toContain('posts');
    expect(text).not.toContain('derived by cerial convert');
    expect(text).not.toContain(EXPANDED);
    expect(modelNames(out.ast)).toEqual(['Author', 'Post']);
  });

  row('typescript-comments', async () => {
    const out = await expandToCerial({
      'user.schema.ts': mod(
        [
          '/** The account model. */',
          "export const User = model('User', {",
          '  // the key',
          '  id: f.record().id(),',
          '  name: f.string(), /* shown in the UI */',
          '});',
        ].join('\n'),
      ),
    });

    const text = out.texts['user.cerial']!;
    expect(text).not.toContain('account');
    expect(text).not.toContain('shown in the UI');
    expect(text).not.toContain('//');
    expect(text).not.toContain('#');
    expect(await renderUsage(convertCommand)).toContain('does not preserve TypeScript comments');
    expect(out.result.lines.join('\n')).not.toContain('comment');
    expect(modelNames(out.ast)).toEqual(['User']);
  });

  row('export-name-differs', async () => {
    const out = await expandToCerial({
      'user.schema.ts': mod("export const UserModel = model('User', { id: f.record().id() });"),
    });

    expect(out.texts['user.cerial']).toContain('model User {');
    expect(allText(out)).not.toContain('UserModel');
    expect(out.result.warnings.join('\n')).toContain('UserModel -> User');
  });

  row('default-export', async () => {
    const out = await expandToCerial({
      'user.schema.ts': mod("export default model('User', { id: f.record().id() });"),
    });

    expect(out.texts['user.cerial']).toContain('model User {');
    expect(allText(out)).not.toContain('default');
    expect(out.result.warnings.join('\n')).toContain('default -> User');
  });

  row('multi-name-export', async () => {
    const out = await expandToCerial({
      'user.schema.ts': mod(
        "export const User = model('User', { id: f.record().id() });\nexport const Same = User;\nexport { User as Aliased };",
      ),
    });

    expect(out.texts['user.cerial']!.match(/model User \{/g)).toHaveLength(1);
    expect(out.ast.models).toHaveLength(1);
    expect(out.result.warnings.join('\n')).toContain('Same -> User');
    expect(out.result.warnings.join('\n')).toContain('Aliased -> User');
  });

  row('barrel-reexport', async () => {
    const out = await expandToCerial({
      'user.schema.ts': mod("export const User = model('User', { id: f.record().id() });"),
      'index.ts': "export * from './user.schema';\n",
    });

    expect(Object.keys(out.texts)).toEqual(['user.cerial']);
    expect(out.texts['user.cerial']).toContain('model User {');
  });

  row('schema-import-alias', async () => {
    const out = await expandToCerial({
      'barrel.ts': `export { model } from '${SCHEMA_MODULE}';\n`,
      'alias.schema.ts': [
        `import * as s from '${SCHEMA_MODULE}';`,
        `import { f as fields, model as build } from '${SCHEMA_MODULE}';`,
        "import { model as viaBarrel } from './barrel';",
        "export const ByNamespace = s.model('ByNamespace', { id: s.f.record().id() });",
        "export const ByAlias = build('ByAlias', { id: fields.record().id(), name: fields.string() });",
        "export const ByBarrel = viaBarrel('ByBarrel', { id: fields.record().id() });",
        '',
      ].join('\n'),
    });

    expect(modelNames(out.ast)).toEqual(['ByAlias', 'ByBarrel', 'ByNamespace']);
    expect(allText(out)).not.toContain(EXPANDED);
  });

  row('reference-form', async () => {
    const out = await expandToCerial({
      'author.schema.ts': authorModule,
      'post.schema.ts': mod(
        [
          "import { Author } from './author.schema';",
          "export const ByThunk = model('ByThunk', { id: f.record().id(), writer: f.relation(() => Author) });",
          "export const ByHandle = model('ByHandle', { id: f.record().id(), writer: f.relation(Author) });",
          "export const ByName = model('ByName', { id: f.record().id(), writer: f.relation('Author') });",
        ].join('\n'),
      ),
    });

    for (const name of ['ByThunk', 'ByHandle', 'ByName']) {
      const model = out.ast.models.find((m) => m.name === name)!;
      const relation = model.fields.find((x) => x.type === 'relation')!;
      expect(relation.decorators.find((d) => d.type === 'model')?.value, name).toBe('Author');
    }
    expect(out.texts['post.cerial']!.match(/@model\(Author\)/g)).toHaveLength(3);
  });

  row('pick-omit-extends', async () => {
    const out = await expandToCerial({
      'parent.schema.ts': mod(
        "export const Parent = model('Parent', { id: f.record().id(), a: f.string(), b: f.string() }, { abstract: true });",
      ),
      'child.schema.ts': mod(
        [
          "import { Parent } from './parent.schema';",
          "export const Picked = model('Picked', { c: f.string() }, { extends: Parent.pick('id', 'a') });",
          "export const Omitted = model('Omitted', { c: f.string() }, { extends: Parent.omit('a') });",
        ].join('\n'),
      ),
    });

    expect(out.texts['child.cerial']).toContain('model Picked extends Parent[id, a]');
    expect(out.texts['child.cerial']).toContain('model Omitted extends Parent[!a]');
    expect(out.ast.models.find((m) => m.name === 'Picked')!.extends).toBeDefined();
  });

  row('define-schema-registration', async () => {
    const out = await expandToCerial({
      'a.schema.ts': mod("export const A = model('A', { id: f.record().id() });"),
      'b.schema.ts': mod("export const B = model('B', { id: f.record().id() });"),
      'schema.ts': mod("import { A } from './a.schema';\nexport default defineSchema({ models: [A] });"),
    });

    expect(Object.keys(out.texts).sort()).toEqual(['a.cerial', 'b.cerial']);
    expect(modelNames(out.ast)).toEqual(['A', 'B']);
    expect(out.result.lines.join('\n')).toContain('list the .cerial entry in the config instead of defineSchema');
  });

  row('non-schema-code', async () => {
    const source = mod(
      [
        "export const VERSION = '1';",
        'export function helper(): number { return 1; }',
        "console.log('side effect');",
        "export const User = model('User', { id: f.record().id() });",
      ].join('\n'),
    );
    await project({ 'user.schema.ts': source });
    const before = await readFile(join(root, 'user.schema.ts'), 'utf8');

    const out = await expandToCerial({});

    expect(before).toBe(source);
    expect(await readFile(join(root, 'user.schema.ts'), 'utf8')).toBe(source);
    expect(out.texts['user.cerial']).toBe('model User {\n  id Record @id\n}\n');
    expect(allText(out)).not.toMatch(/VERSION|helper|console/);
    expect(out.result.lines.join('\n')).toContain('TypeScript modules were left in place');
    expect(out.result.lines.join('\n')).toMatch(
      /Other exports and code in these modules are not converted: .*user\.schema\.ts/,
    );
    const usage = await renderUsage(convertCommand);
    expect(usage).toContain('other exports, helpers and code in a module are not');
    expect(usage).toContain('binding -> declaration');
  });

  it('non-schema-code: a module holding only declarations is not named', async () => {
    const out = await expandToCerial({
      'user.schema.ts': mod("export const User = model('User', { id: f.record().id() });"),
    });

    expect(out.result.lines.join('\n')).not.toContain('not converted');
  });

  row('string-with-both-quotes', async () => {
    const value = `it's "x"`;
    const out = await expandToCerial({
      'quote.schema.ts': mod(
        `export const Q = model('Q', { id: f.record().id(), s: f.string().default(${JSON.stringify(value)}) });`,
      ),
    });

    const field = out.ast.models[0]!.fields.find((x) => x.name === 's')!;
    expect(field.decorators.find((d) => d.type === 'default')!.value).toBe(value);
    expect(out.texts['quote.cerial']).toContain(`@default(${'"'}it's "x"${'"'})`);
    expect(out.texts['quote.cerial']).not.toContain(EXPANDED);
  });
});

describe('rows that refuse, --to cerial', () => {
  const clock = mod("export const Clock = model('Clock', { id: f.record().id(), at: f.int().default(Date.now()) });");

  /** The refusal names the row, the module and the construct, and `--force` does not change it. */
  async function refusesTwice(files: Record<string, string>, id: string, ...needles: string[]): Promise<string> {
    await project(files);
    const message = await refused(() => toCerial());
    expect(message).toContain(id);
    for (const needle of needles) expect(message).toContain(needle);
    expect(await refused(() => toCerial({ force: true }))).toContain(id);
    expect(await readdir(root).then((names) => names.filter((n) => n.endsWith('.cerial')))).toEqual([]);

    return message;
  }

  row('npm-field-set', async () => {
    await mkdir(join(root, 'node_modules/fieldkit'), { recursive: true });
    await project({
      'node_modules/fieldkit/package.json': '{"name":"fieldkit","type":"module","main":"index.js"}\n',
      'node_modules/fieldkit/index.js': `import { f } from '${SCHEMA_MODULE}';\nexport const stamps = { stamp: f.string() };\n`,
      'doc.schema.ts': mod(
        "import { stamps } from 'fieldkit';\nexport const Doc = model('Doc', { id: f.record().id(), ...stamps });",
      ),
    });

    const message = await refused(() => toCerial());

    expect(message).toContain('npm-field-set');
    expect(message).toContain('doc.schema.ts');
    expect(message).toContain('--partial');
  });

  row('conditional-structure', async () => {
    const message = await refusesTwice(
      {
        'maybe.schema.ts': mod(
          "const big = process.env.CERIAL_LOSSY_BRANCH === '1';\nexport const Maybe = model('Maybe', { id: f.record().id(), extra: big ? f.string() : f.int() });",
        ),
      },
      'conditional-structure',
      'maybe.schema.ts',
    );

    expect(message).toContain('1 construct(s)');
  });

  row('computed-value', async () => {
    const message = await refusesTwice(
      {
        'clock.schema.ts': clock,
        'config.schema.ts': mod(
          "const CONFIG = { x: Math.random() };\nexport const Conf = model('Conf', { id: f.record().id(), n: f.float().default(CONFIG.x) });",
        ),
        'user.schema.ts': mod("export const User = model('User', { id: f.record().id() });"),
      },
      'computed-value',
      'clock.schema.ts',
      "in 'Clock'",
      'config.schema.ts',
      "in 'Conf'",
    );

    expect(message).not.toContain('user.schema.ts');
  });

  row('module-fails-to-load', async () => {
    await project({
      'user.schema.ts': mod("export const User = model('User', { id: f.record().id() });"),
      'boom.schema.ts': "throw new Error('boom from the module');\n",
    });

    const message = await refused(() => toCerial());

    expect(message).toContain('boom.schema.ts');
    expect(message).toContain('boom from the module');
  });

  row('reassigned-export', async () => {
    const message = await refusesTwice(
      {
        'late.schema.ts': mod(
          "export let Late = model('Late', { id: f.record().id() });\nLate = model('Late', { id: f.record().id() });",
        ),
      },
      'reassigned-export',
      'late.schema.ts',
    );

    expect(message).toContain('Late');
  });

  row('unexported-declaration', async () => {
    await project({
      'post.schema.ts': mod(
        [
          "const Base = model('Base', { id: f.record().id() }, { abstract: true });",
          "export const Post = model('Post', { name: f.string() }, { extends: Base });",
        ].join('\n'),
      ),
    });

    const message = await refused(() => toCerial());

    expect(message).toContain('Post');
    expect(message).toContain('extends "Base"');
    expect(message).toContain('no model with that name exists');
  });

  /** One unexported declaration of each kind, reached from an exported model through each reference form. */
  const dangling: ReadonlyArray<{ kind: string; target: string; holder: string; body: string[] }> = [
    {
      kind: 'relation',
      target: 'Author',
      holder: 'Post',
      body: [
        "const Author = model('Author', { id: f.record().id() });",
        "export const Post = model('Post', { id: f.record().id(), author: f.relation(() => Author) });",
      ],
    },
    {
      kind: 'object',
      target: 'Address',
      holder: 'Person',
      body: [
        "const Address = object('Address', { city: f.string() });",
        "export const Person = model('Person', { id: f.record().id(), home: f.object(Address) });",
      ],
    },
    {
      kind: 'literal',
      target: 'Mode',
      holder: 'Switch',
      body: [
        "const Mode = literal('Mode', [variant.string('a'), variant.string('b')]);",
        "export const Switch = model('Switch', { id: f.record().id(), mode: f.literal(Mode) });",
      ],
    },
    {
      kind: 'enum',
      target: 'Role',
      holder: 'Member',
      body: [
        "const Role = enum_('Role', ['ADMIN', 'USER']);",
        "export const Member = model('Member', { id: f.record().id(), role: f.enum(Role) });",
      ],
    },
    {
      kind: 'tuple',
      target: 'Pair',
      holder: 'Spot',
      body: [
        "const Pair = tuple('Pair', [e.int(), e.int()]);",
        "export const Spot = model('Spot', { id: f.record().id(), at: f.tuple(Pair) });",
      ],
    },
    {
      kind: 'object inside an object',
      target: 'Inner',
      holder: 'Outer',
      body: [
        "const Inner = object('Inner', { a: f.int() });",
        "export const Outer = object('Outer', { inner: f.object(Inner) });",
        "export const Holder = model('Holder', { id: f.record().id(), outer: f.object(Outer) });",
      ],
    },
  ];

  for (const { kind, target, holder, body } of dangling) {
    it(`unexported-declaration: a ${kind} reference to it is refused, naming the holder, target and module`, async () => {
      await project({ 'ref.schema.ts': mod(body.join('\n')) });

      const message = await refused(() => toCerial());
      expect(message).toContain('ref.schema.ts');
      expect(message).toContain(holder);
      expect(message).toMatch(new RegExp(`["']${target}["']`));
      expect(await refused(() => toCerial({ force: true }))).toContain(target);
    });
  }

  it('unexported-declaration: the same references to exported declarations convert', async () => {
    const out = await expandToCerial({
      'ref.schema.ts': mod(
        [
          "export const Author = model('Author', { id: f.record().id() });",
          "export const Address = object('Address', { city: f.string() });",
          "export const Post = model('Post', { id: f.record().id(), author: f.relation(() => Author), home: f.object(Address) });",
        ].join('\n'),
      ),
    });

    expect(modelNames(out.ast)).toEqual(['Author', 'Post']);
  });

  row('duplicate-declaration-name', async () => {
    await project({
      'a.schema.ts': mod("export const A = model('Twin', { id: f.record().id() });"),
      'b.schema.ts': mod("export const B = model('Twin', { id: f.record().id() });"),
    });
    const message = await refused(() => toCerial());
    expect(message).toContain('Duplicate model name: Twin');
    expect(await refused(() => toCerial({ force: true }))).toContain('Duplicate model name: Twin');

    const second = await realpath(await mkdtemp(join(tmpdir(), 'cerial-lossy-dup-')));
    try {
      await writeFile(join(second, 'a.cerial'), await fixture('duplicate-a.cerial'));
      await writeFile(join(second, 'b.cerial'), await fixture('duplicate-b.cerial'));
      const before = await snapshot(second);

      const error = await runConvert({ to: 'ts', schema: second, schemaImport: SCHEMA_MODULE, force: true }).then(
        () => undefined,
        (e: unknown) => e as Error,
      );

      expect(error).toBeInstanceOf(CerialGenerationError);
      expect(error!.message).toContain('Duplicate model name: Twin');
      expect(await snapshot(second)).toEqual(before);
    } finally {
      await rm(second, { recursive: true, force: true });
    }
  });

  row('non-identifier-name', async () => {
    await project({ 'thing.schema.ts': mod("export const Thing = model('a b', { id: f.record().id() });") });

    const message = await refused(() => toCerial());

    expect(message).toContain('thing.schema.ts');
    expect(message).toContain('a b');
  });

  row('non-identifier-id-type', async () => {
    const message = await refusesTwice(
      {
        'thing.schema.ts': mod(
          "export const Thing = model('Thing', { id: f.record('a b' as unknown as 'string').id() });",
        ),
      },
      'non-identifier-id-type',
      'thing.schema.ts',
      "model 'Thing.id'",
    );

    expect(message).toContain('"a b"');
  });

  row('reserved-keyword-name', async () => {
    const message = await refusesTwice(
      {
        'select.schema.ts': mod("export const Sel = model('select', { id: f.record().id() });"),
        'field.schema.ts': mod("export const Thing = model('Thing', { id: f.record().id(), value: f.string() });"),
      },
      'reserved-keyword-name',
      "model 'select'",
      "model 'Thing.value'",
    );

    expect(message).toContain('2 construct(s)');
  });

  row('unprintable-default-string', async () => {
    const message = await refusesTwice(
      {
        'close.schema.ts': mod(
          "export const Close = model('Close', { id: f.record().id(), s: f.string().default('a ) b') });",
        ),
        'slashes.schema.ts': mod(
          "export const Slashes = model('Slashes', { id: f.record().id(), s: f.string().default('a // b') });",
        ),
      },
      'unprintable-default-string',
      "model 'Close.s'",
      "model 'Slashes.s'",
    );

    expect(message).toContain('2 construct(s)');
  });

  row('unprintable-variant-string', async () => {
    const message = await refusesTwice(
      {
        'comma.schema.ts': mod("export const Comma = literal('Comma', [variant.string('a, b'), variant.string('c')]);"),
      },
      'unprintable-variant-string',
      "literal 'Comma'",
    );

    expect(message).toContain('"a, b"');
  });

  row('ast-mismatch', async () => {
    // A variant the printer writes in a form the parser reads as something else, which no check lists
    await project({ 'big.schema.ts': mod("export const Big = literal('Big', [variant.int(1e21)]);") });

    const message = await refused(() => toCerial());

    expect(message).toContain('nothing was converted');
    expect(message).toContain('literal Big');
    expect(await readdir(root)).toEqual(['big.schema.ts']);

    // The opposite direction: a builder that rebuilds a different schema is caught by name before anything is written
    await rm(join(root, 'big.schema.ts'));
    await project({
      'user.cerial': 'model User {\n  id Record @id\n  name String\n}\n',
      'shim.ts': `import { model as real } from '${SCHEMA_MODULE}';\nexport * from '${SCHEMA_MODULE}';\nexport const model = (name: string, ...rest: unknown[]) => (real as (...a: unknown[]) => unknown)(name + 'Renamed', ...rest);\n`,
    });

    const back = await refused(() => toTs({ schemaImport: join(root, 'shim.ts'), schema: join(root, 'user.cerial') }));

    expect(back).toContain('do not rebuild the source schema');
    expect(back).toContain('User');
  });
});

describe('rows both directions share', () => {
  row('layout-not-preserved', async () => {
    await project({ 'user.cerial': await fixture('layout.cerial') });
    const source = await readFile(join(root, 'user.cerial'), 'utf8');

    await toTs();

    const typescript = await readFile(join(root, 'user.schema.ts'), 'utf8');
    expect(typescript).toContain("export const User = model('User'");
    expect(typescript).not.toContain(source);
    expect(await readFile(join(root, 'user.cerial'), 'utf8')).toBe(source);

    await rm(join(root, 'user.cerial'));
    await rm(join(root, 'user.schema.ts'));
    const back = await expandToCerial({
      'odd.schema.ts': mod(
        "export   const   Odd   =   model( 'Odd',\n\n\n { id:f.record().id(),\n\n   name   :   f.string() } );",
      ),
    });
    expect(back.texts['odd.cerial']).toBe('model Odd {\n  id   Record @id\n  name String\n}\n');
    expect(modelNames(back.ast)).toEqual(['Odd']);
  });

  row('cerial-comments', async () => {
    await project({ 'user.cerial': await fixture('comments.cerial') });

    await toTs();

    const text = await readFile(join(root, 'user.schema.ts'), 'utf8');
    for (const comment of ['header', 'about User', 'about the model', 'open', 'about name', 'trailing name', 'footer'])
      expect(text).toContain(`// ${comment}`);
    expect(text).not.toContain('#');
    expect(text).not.toContain('/*');
    expect(text).not.toMatch(new RegExp(`${EXPANDED}`));
  });
});

describe('rows that refuse or expand, --to ts', () => {
  row('invalid-source', async () => {
    await project({ 'bad.cerial': await fixture('invalid.cerial') });

    const message = await refused(() => toTs());

    expect(message).toContain('Nothing was written');
    expect(message).toContain('bad.cerial:');
    await project({ 'bad.cerial': 'object Child extends Missing {\n  c Int\n}\n' });
    expect(await refused(() => toTs())).toContain('Missing');
  });

  row('unknown-construct', async () => {
    await project({ 'holder.cerial': await fixture('unknown-construct.cerial') });

    const message = await refused(() => toTs());

    expect(message).toContain('object Holder');
    expect(message).toContain("field 'owner'");
    expect(message).toContain('cannot hold a relation');
  });

  row('declared-foreign-key-to-ts', async () => {
    await project({ 'post.cerial': await fixture('declared-key.cerial') });

    await toTs();

    const text = await readFile(join(root, 'post.schema.ts'), 'utf8');
    expect(text).toContain("owner: f.relation('User').field('ownerRef')");
    expect(text).toContain('ownerRef: f.record()');
    expect(text).not.toContain(EXPANDED);
  });

  row('extends-parent-after-child', async () => {
    await project({ 'child-first.cerial': await extendsFixture('child-first.cerial') });

    const result = await toTs();

    const text = await readFile(join(root, 'child-first.schema.ts'), 'utf8');
    expect(text.indexOf('export const Base')).toBeGreaterThan(-1);
    expect(text.indexOf('export const Base')).toBeLessThan(text.indexOf('export const Child'));
    expect(result.written).toEqual([join(root, 'child-first.schema.ts')]);
  });

  row('extends-cross-file-cycle', async () => {
    await project({
      'a.cerial': await extendsFixture('cycle/a.cerial'),
      'b.cerial': await extendsFixture('cycle/b.cerial'),
    });

    const message = await refused(() => toTs());

    expect(message).toContain('extends-cross-file-cycle');
    expect(message).toContain('Child');
    expect(message).toContain('Other');
  });

  row('extends-thunk-back-edge', async () => {
    await project({
      'a.cerial': await extendsFixture('back-edge/a.cerial'),
      'b.cerial': await extendsFixture('back-edge/b.cerial'),
    });

    await toTs();

    const text = await readFile(join(root, 'b.schema.ts'), 'utf8');
    expect(text).toContain("'Marker'");
    expect(text).not.toContain('() => Marker');
    expect(text).not.toContain(EXPANDED);
  });

  row('alternating-directives', async () => {
    await project({ 'item.cerial': await fixture('alternating.cerial') });

    const result = await toTs();

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Item');
    const text = await readFile(join(root, 'item.schema.ts'), 'utf8');
    expect(text.indexOf('first')).toBeLessThan(text.indexOf('third'));
    expect(text.indexOf('third')).toBeLessThan(text.indexOf('second'));
    expect(text).not.toContain(EXPANDED);
  });

  row('reserved-word-binding', async () => {
    await project({ 'reserved.cerial': await fixture('reserved.cerial') });

    await toTs();

    const text = await readFile(join(root, 'reserved.schema.ts'), 'utf8');
    expect(text).toContain("const _object = model('object', {");
    expect(text).toContain('export { _object as object };');
    expect(text).toContain("const _f = model('f', {");
    expect(text).toContain('export { _f as f };');
  });

  row('proto-field-key', async () => {
    await project({ 'doc.cerial': await fixture('proto.cerial') });

    // The generated-name rule refuses `__proto__` when the emitted module loads
    expect(await refused(() => toTs())).toContain("'__proto__' is reserved");
  });
});

describe('every row has a test', () => {
  const ids = LOSSY_CASES.map((entry) => entry.id);

  it('has one test per LOSSY_CASES row and none for a row that is gone', () => {
    expect(unproven(ids, proven)).toEqual({ missing: [], stray: [] });
    expect(proven.size).toBe(LOSSY_CASES.length);
  });

  it('fails for a row added without a test', () => {
    expect(unproven([...ids, 'a-new-row'], proven).missing).toEqual(['a-new-row']);
  });

  it('fails for a test whose row was removed', () => {
    expect(unproven(ids.slice(1), proven).stray).toEqual([ids[0]!]);
  });

  it('fails when a row loses its test', () => {
    const without = new Set(proven);
    without.delete('loop-built-model');

    expect(unproven(ids, without).missing).toEqual(['loop-built-model']);
  });
});
