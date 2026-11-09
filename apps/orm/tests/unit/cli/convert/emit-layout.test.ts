import { afterAll, describe, expect, test } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { emitModel } from '../../../../src/cli/convert/emit-ts/declaration';
import { emitTypescript } from '../../../../src/cli/convert/emit-ts';
import { arrayOf, objectOf, printCall, printImport, PRINT_WIDTH } from '../../../../src/cli/convert/emit-ts/layout';
import { runPassThree } from '../../../../src/cli/passes/pass-three';
import { parse } from '../../../../src/parser/parser';
import { findSchemaFiles, SCHEMAS_DIR } from '../../../generators/parity-corpus';

const REPO = resolve(import.meta.dir, '../../../../../..');
const OXFMT = join(REPO, 'node_modules/.bin/oxfmt');
const FIXTURE = resolve(import.meta.dir, '../../../e2e/schemas-ts/features/extends-relations.schema.ts');
const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-emit-layout-'));
  dirs.push(dir);
  copyFileSync(join(REPO, '.oxfmtrc.json'), join(dir, '.oxfmtrc.json'));

  return dir;
}

/** The files `oxfmt --check` rejects, run with the repo's options. */
function rejected(files: Readonly<Record<string, string>>): string[] {
  const dir = scratch();
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, 'src', name)), { recursive: true });
    writeFileSync(join(dir, 'src', name), text);
  }
  const run = Bun.spawnSync([OXFMT, '--check', '-c', join(dir, '.oxfmtrc.json'), 'src'], { cwd: dir });
  // oxfmt colours file names when CI is set, so strip escape codes before matching
  const lines = Bun.stripANSI(`${run.stdout}`).split('\n');

  return Object.keys(files).filter((name) => lines.some((line) => line.startsWith(`src/${name} `)));
}

/** `export const A = model('A', { a: <value> });` made exactly `width` columns wide. */
function modelOfWidth(width: number): string {
  const value = 'v'.repeat(width - "export const A = model('A', { a:  });".length);

  return `export const A = ${printCall('export const A = '.length, 'model', ["'A'", objectOf([{ key: 'a', value }])])};\n`;
}

function parsedModel(source: string) {
  const { ast, errors } = parse(source);
  expect(errors).toEqual([]);

  return ast.models[0]!;
}

describe('the print width', () => {
  test('a declaration of exactly 120 columns stays on one line', () => {
    const text = modelOfWidth(PRINT_WIDTH);

    expect(text.trimEnd().length).toBe(PRINT_WIDTH);
    expect(text.trimEnd().split('\n')).toHaveLength(1);
    expect(rejected({ 'a.ts': text })).toEqual([]);
  });

  test('one of 121 columns opens its last argument', () => {
    const text = modelOfWidth(PRINT_WIDTH + 1);

    expect(text.trimEnd().split('\n')).toEqual([
      "export const A = model('A', {",
      `  a: ${'v'.repeat(PRINT_WIDTH + 1 - "export const A = model('A', { a:  });".length)},`,
      '});',
    ]);
    expect(rejected({ 'a.ts': text })).toEqual([]);
  });

  test('a call whose last two arguments are objects puts every argument on its own line', () => {
    const value = 'v'.repeat(80);
    const text = `export const A = ${printCall('export const A = '.length, 'model', [
      "'A'",
      objectOf([{ key: 'a', value }], true),
      objectOf([{ key: 'extends', value: 'Base' }]),
    ])};\n`;

    expect(text).toBe(`export const A = model(\n  'A',\n  {\n    a: ${value},\n  },\n  { extends: Base },\n);\n`);
    expect(rejected({ 'a.ts': text })).toEqual([]);
  });

  test('an array opens in place, one item per line, when it does not fit', () => {
    const items = Array.from({ length: 6 }, (_, i) => `'${String(i).repeat(20)}'`);
    const text = `export const A = ${printCall('export const A = '.length, 'enumeration', ["'A'", arrayOf(items)])};\n`;

    expect(text.split('\n')[0]).toBe("export const A = enumeration('A', [");
    expect(text).toContain(`  ${items[0]},\n`);
    expect(rejected({ 'a.ts': text })).toEqual([]);
  });

  test('an array of two objects with several keys is always opened', () => {
    const index = arrayOf([
      objectOf([
        { key: 'name', value: "'a'" },
        { key: 'fields', value: arrayOf(["'x'"]) },
      ]),
      objectOf([
        { key: 'name', value: "'b'" },
        { key: 'fields', value: arrayOf(["'y'"]) },
      ]),
    ]);
    const text = `export const A = ${printCall('export const A = '.length, 'model', [
      "'A'",
      objectOf([{ key: 'a', value: 'f.string()' }], true),
      objectOf([{ key: 'index', value: index }]),
    ])};\n`;

    expect(text).toContain(
      "    index: [\n      { name: 'a', fields: ['x'] },\n      { name: 'b', fields: ['y'] },\n    ],\n",
    );
    expect(rejected({ 'a.ts': text })).toEqual([]);
  });
});

describe('fixtures', () => {
  test('the committed builder schema is already in the layout', () => {
    expect(rejected({ 'fixture.ts': readFileSync(FIXTURE, 'utf8') })).toEqual([]);
  });

  test('changing the layout of a declaration fails the check', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const collapsed =
      "export const ExtRelOwner = model('ExtRelOwner', { name: f.string() }, { abstract: true, extends: ExtRelBase });";
    expect(text).toContain(collapsed);

    expect(rejected({ 'fixture.ts': text.replace(collapsed, collapsed.replace('{ name', '{\n  name')) })).toEqual([
      'fixture.ts',
    ]);
    expect(rejected({ 'fixture.ts': text.replace(collapsed, collapsed.replace(' }, {', ' },\n{')) })).toEqual([
      'fixture.ts',
    ]);
  });
});

describe('comments', () => {
  const comments = {
    above: ['// about A'],
    fieldAbove: new Map([['a', ['// above a']]]),
    fieldAfter: new Map([['a', ['// after a', '// more']]]),
  };

  test('a declaration holding a comment is not collapsed, and the comments keep their places', () => {
    const node = parsedModel('model A {\n  id Record @id\n  a String\n}\n');
    const { text } = emitModel(node, { comments });

    expect(text).toBe(
      [
        '// about A',
        "export const A = model('A', {",
        '  id: f.record().id(),',
        '  // above a',
        '  a: f.string(), // after a',
        '  // more',
        '});',
      ].join('\n'),
    );
    expect(rejected({ 'a.ts': `import { f, model } from 'x';\n\n${text}\n` })).toEqual([]);
  });

  test('without the comments the same declaration is one line', () => {
    const node = parsedModel('model A {\n  id Record @id\n  a String\n}\n');

    expect(emitModel(node).text).toBe("export const A = model('A', { id: f.record().id(), a: f.string() });");
  });

  test('a comment on a field that is not written goes above the declaration', () => {
    const node = parsedModel('model A {\n  id Record @id\n}\n');
    const { text } = emitModel(node, {
      comments: { above: [], fieldAbove: new Map([['gone', ['// kept']]]), fieldAfter: new Map() },
    });

    expect(text.split('\n')[0]).toBe('// kept');
  });
});

describe('imports', () => {
  const NAMES = ['enum as enumeration', 'f', 'literal', 'model', 'object', 'tuple'];

  test('an import at the width stays on one line', () => {
    const width = `import { ${NAMES.join(', ')} } from '';`.length;
    const specifier = `'${'x'.repeat(PRINT_WIDTH - width)}'`;
    const line = printImport(NAMES, specifier);

    expect(line.length).toBe(PRINT_WIDTH);
    expect(line).not.toContain('\n');
    expect(rejected({ 'at-width.ts': `${line}\n` })).toEqual([]);
  });

  test('an import one over the width wraps as the formatter does', () => {
    const width = `import { ${NAMES.join(', ')} } from '';`.length;
    const wrapped = printImport(NAMES, `'${'x'.repeat(PRINT_WIDTH - width + 1)}'`);

    expect(wrapped.split('\n')).toHaveLength(NAMES.length + 2);
    expect(rejected({ 'over-width.ts': `${wrapped}\n` })).toEqual([]);
  });
});

describe('the whole corpus', () => {
  function emitCorpus(): Record<string, string> {
    const dir = '/emitted';
    const files = findSchemaFiles(SCHEMAS_DIR);
    expect(files.length).toBeGreaterThan(0);
    const sources = files.map((file) => ({
      path: join(dir, relative(SCHEMAS_DIR, file)),
      content: readFileSync(file, 'utf8'),
    }));
    const { ast, errors } = runPassThree(sources);
    expect(errors).toEqual([]);
    const result = emitTypescript(ast, { schemaImport: 'cerial/schema' });
    expect(result.refusals).toEqual([]);

    return Object.fromEntries(result.modules.map((module) => [relative(dir, module.path), module.text]));
  }

  test('every emitted module is in the formatter layout, and emitting again changes nothing', () => {
    const first = emitCorpus();

    expect(Object.keys(first).length).toBe(findSchemaFiles(SCHEMAS_DIR).length);
    expect(rejected(first)).toEqual([]);
    expect(emitCorpus()).toEqual(first);
  });
});
