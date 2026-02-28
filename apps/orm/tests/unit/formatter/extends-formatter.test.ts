/**
 * Tests for extends/abstract/!!private formatter support.
 *
 * Tests the formatter's ability to:
 * - Print abstract model headers
 * - Print extends clauses (model, object, enum, literal, tuple)
 * - Print extends with pick/omit bracket syntax
 * - Align !!private as a 4th column
 * - Handle !!private on tuple elements in inline printer
 * - Preserve idempotency for all new syntax
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'path';
import type { AlignedField } from '../../../src/formatter/aligner';
import { alignFields } from '../../../src/formatter/aligner';
import { attachComments } from '../../../src/formatter/comment-attacher';
import { formatCerialSource } from '../../../src/formatter/formatter';
import { printEnum, printLiteral, printTuple } from '../../../src/formatter/inline-printer';
import { printModel, printObject } from '../../../src/formatter/printer';
import type { FormatConfig } from '../../../src/formatter/types';
import { FORMAT_DEFAULTS } from '../../../src/formatter/types';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function config(overrides?: FormatConfig): Required<FormatConfig> {
  return { ...FORMAT_DEFAULTS, ...overrides };
}

function formatModel(source: string, overrides?: FormatConfig): string {
  const tokens = tokenize(source);
  const { ast } = parse(source);
  const comments = attachComments(tokens, ast);
  const model = ast.models[0]!;

  return printModel(model, comments, config(overrides), source);
}

function formatObject(source: string, overrides?: FormatConfig): string {
  const tokens = tokenize(source);
  const { ast } = parse(source);
  const comments = attachComments(tokens, ast);
  const object = ast.objects[0]!;

  return printObject(object, comments, config(overrides), source);
}

function parseEnumNode(src: string) {
  const { ast } = parse(src);
  const tokens = tokenize(src);
  const comments = attachComments(tokens, ast);

  return { node: ast.enums[0]!, comments, source: src };
}

function parseLiteralNode(src: string) {
  const { ast } = parse(src);
  const tokens = tokenize(src);
  const comments = attachComments(tokens, ast);

  return { node: ast.literals[0]!, comments, source: src };
}

function parseTupleNode(src: string) {
  const { ast } = parse(src);
  const tokens = tokenize(src);
  const comments = attachComments(tokens, ast);

  return { node: ast.tuples[0]!, comments, source: src };
}

function field(
  name: string,
  typeWithModifiers: string,
  decoratorString = '',
  hasBlankLineAfter = false,
  trailingComment?: string,
  privateMarker?: string,
): AlignedField {
  return { name, typeWithModifiers, decoratorString, hasBlankLineAfter, trailingComment, privateMarker };
}

// ---------------------------------------------------------------------------
// 1. Abstract model header
// ---------------------------------------------------------------------------

describe('abstract model header', () => {
  it('should format abstract model keyword', () => {
    const src = ['abstract model Base {', '  id Record @id', '  name String', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('abstract model Base {');
  });

  it('should format non-abstract model without abstract keyword', () => {
    const src = ['model User {', '  id Record @id', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('model User {');
    expect(result).not.toContain('abstract');
  });

  it('should preserve trailing comment on abstract model', () => {
    const src = 'abstract model Base { # base model\n  id Record @id\n}';
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toContain('abstract model Base { # base model');
  });

  it('should preserve leading comments on abstract model', () => {
    const src = '# Base model\nabstract model Base {\n  id Record @id\n}';
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('# Base model\nabstract model Base {');
  });
});

// ---------------------------------------------------------------------------
// 2. Model extends header
// ---------------------------------------------------------------------------

describe('model extends header', () => {
  it('should format model extends clause', () => {
    const src = ['model User extends Base {', '  email Email @unique', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('model User extends Base {');
  });

  it('should format model extends with pick', () => {
    const src = ['model User extends Base[id, name] {', '  email Email @unique', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('model User extends Base[id, name] {');
  });

  it('should format model extends with omit (re-adds ! prefix)', () => {
    const src = ['model User extends Base[!updatedAt] {', '  email Email @unique', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('model User extends Base[!updatedAt] {');
  });

  it('should format model extends with multiple omit fields', () => {
    const src = ['model Slim extends Base[!createdAt, !updatedAt] {', '  email Email', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('model Slim extends Base[!createdAt, !updatedAt] {');
  });

  it('should format abstract model with extends and pick', () => {
    const src = ['abstract model Admin extends User[id, email] {', '  role String', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('abstract model Admin extends User[id, email] {');
  });

  it('should preserve trailing comment after extends clause', () => {
    const src = 'model User extends Base { # inherits\n  email Email\n}';
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toContain('model User extends Base { # inherits');
  });

  it('should preserve trailing comment after extends with pick', () => {
    const src = 'model User extends Base[id] { # only id\n  email Email\n}';
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toContain('model User extends Base[id] { # only id');
  });
});

// ---------------------------------------------------------------------------
// 3. Object extends header
// ---------------------------------------------------------------------------

describe('object extends header', () => {
  it('should format object extends clause', () => {
    const src = ['object Address extends BaseAddress {', '  zip String', '}'].join('\n');
    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('object Address extends BaseAddress {');
  });

  it('should format object extends with pick', () => {
    const src = ['object Simple extends Full[city, state] {', '  note String', '}'].join('\n');
    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('object Simple extends Full[city, state] {');
  });

  it('should format object extends with omit', () => {
    const src = ['object Minimal extends Full[!notes] {', '  tag String', '}'].join('\n');
    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('object Minimal extends Full[!notes] {');
  });
});

// ---------------------------------------------------------------------------
// 4. Enum extends header (inline printer)
// ---------------------------------------------------------------------------

describe('enum extends header', () => {
  it('should format enum extends single-line', () => {
    const src = 'enum Extended extends Base { Extra, More }';
    const { node, comments, source } = parseEnumNode(src);
    const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('enum Extended extends Base { Extra, More }');
  });

  it('should format enum extends multi-line', () => {
    const src = 'enum Extended extends Base {\n  Extra,\n  More\n}';
    const { node, comments, source } = parseEnumNode(src);
    const result = printEnum(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: false }), source);

    expect(result).toBe('enum Extended extends Base {\n  Extra,\n  More\n}');
  });

  it('should format enum extends with pick', () => {
    const src = 'enum Core extends Base[Admin, User] { Guest }';
    const { node, comments, source } = parseEnumNode(src);
    const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('enum Core extends Base[Admin, User] { Guest }');
  });

  it('should format enum extends with omit', () => {
    const src = 'enum NonAdmin extends Base[!Admin] { Guest }';
    const { node, comments, source } = parseEnumNode(src);
    const result = printEnum(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('enum NonAdmin extends Base[!Admin] { Guest }');
  });
});

// ---------------------------------------------------------------------------
// 5. Literal extends header (inline printer)
// ---------------------------------------------------------------------------

describe('literal extends header', () => {
  it('should format literal extends single-line', () => {
    const src = "literal Extended extends Base { 'extra', 'more' }";
    const { node, comments, source } = parseLiteralNode(src);
    const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe("literal Extended extends Base { 'extra', 'more' }");
  });

  it('should format literal extends multi-line', () => {
    const src = "literal Extended extends Base {\n  'extra',\n  'more'\n}";
    const { node, comments, source } = parseLiteralNode(src);
    const result = printLiteral(
      node,
      comments,
      config({ inlineConstructStyle: 'multi', trailingComma: false }),
      source,
    );

    expect(result).toBe("literal Extended extends Base {\n  'extra',\n  'more'\n}");
  });

  it('should format literal extends with pick', () => {
    const src = "literal High extends Priority['high', 'critical'] { 'urgent' }";
    const { node, comments, source } = parseLiteralNode(src);
    const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe("literal High extends Priority['high', 'critical'] { 'urgent' }");
  });

  it('should format literal extends with omit', () => {
    const src = "literal NoLow extends Priority[!'low'] { 'urgent' }";
    const { node, comments, source } = parseLiteralNode(src);
    const result = printLiteral(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe("literal NoLow extends Priority[!'low'] { 'urgent' }");
  });
});

// ---------------------------------------------------------------------------
// 6. Tuple extends header (inline printer)
// ---------------------------------------------------------------------------

describe('tuple extends header', () => {
  it('should format tuple extends single-line', () => {
    const src = 'tuple Triple extends Pair { z Float }';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('tuple Triple extends Pair { z Float }');
  });

  it('should format tuple extends multi-line', () => {
    const src = 'tuple Triple extends Pair {\n  z Float\n}';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: false }), source);

    expect(result).toBe('tuple Triple extends Pair {\n  z Float\n}');
  });

  it('should format tuple extends with pick', () => {
    const src = 'tuple FirstTwo extends Triple[0, 1] { Bool }';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('tuple FirstTwo extends Triple[0, 1] { Bool }');
  });

  it('should format tuple extends with omit', () => {
    const src = 'tuple NoSecond extends Triple[!1] { Bool }';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('tuple NoSecond extends Triple[!1] { Bool }');
  });
});

// ---------------------------------------------------------------------------
// 7. !!private on model/object fields (4th alignment column)
// ---------------------------------------------------------------------------

describe('!!private field alignment', () => {
  it('should format !!private as 4th column on model fields', () => {
    const src = ['model Priv {', '  id Record @id !!private', '  name String', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    // 4th column: decorator padded, then !!private
    expect(result).toContain('!!private');
    // name field should NOT have !!private
    const lines = result.split('\n');
    const nameLine = lines.find((l) => l.includes('name'))!;
    expect(nameLine).not.toContain('!!private');
  });

  it('should align !!private across fields with varying decorator lengths', () => {
    const src = [
      'model Test {',
      '  id Record @id !!private',
      '  createdAt Date @createdAt !!private',
      '  updatedAt Date @updatedAt',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result.split('\n');

    // Both private lines should have !!private aligned at same column
    const idLine = lines.find((l) => l.includes('id') && l.includes('Record'))!;
    const createdLine = lines.find((l) => l.includes('createdAt'))!;

    const idPrivateIdx = idLine.indexOf('!!private');
    const createdPrivateIdx = createdLine.indexOf('!!private');
    expect(idPrivateIdx).toBe(createdPrivateIdx);
  });

  it('should not add 4th column when no fields have !!private', () => {
    const src = ['model NoPriv {', '  id Record @id', '  name String', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).not.toContain('!!private');
    // No extra trailing spaces from decorator padding
    const lines = result.split('\n');
    for (const line of lines) {
      expect(line).toBe(line.trimEnd());
    }
  });

  it('should handle !!private on fields without decorators', () => {
    const src = [
      'model Mixed {',
      '  id Record @id !!private',
      '  name String !!private',
      '  email Email @unique',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result.split('\n');

    // Both private fields should have !!private at same column
    const idLine = lines.find((l) => l.includes('id') && l.includes('Record'))!;
    const nameLine = lines.find((l) => l.includes('name'))!;
    expect(idLine).toContain('!!private');
    expect(nameLine).toContain('!!private');

    const idPrivateIdx = idLine.indexOf('!!private');
    const namePrivateIdx = nameLine.indexOf('!!private');
    expect(idPrivateIdx).toBe(namePrivateIdx);
  });

  it('should handle !!private on object fields', () => {
    const src = ['object Addr {', '  street String !!private', '  city String', '}'].join('\n');
    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toContain('!!private');
    const lines = result.split('\n');
    const cityLine = lines.find((l) => l.includes('city'))!;
    expect(cityLine).not.toContain('!!private');
  });
});

// ---------------------------------------------------------------------------
// 8. !!private on tuple elements (inline printer)
// ---------------------------------------------------------------------------

describe('!!private on tuple elements', () => {
  it('should format !!private on tuple element single-line', () => {
    const src = 'tuple Priv {\n  x Float !!private,\n  y Float\n}';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('tuple Priv { x Float !!private, y Float }');
  });

  it('should format !!private on tuple element multi-line', () => {
    const src = 'tuple Priv {\n  x Float !!private,\n  y Float\n}';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'multi', trailingComma: false }), source);

    expect(result).toBe('tuple Priv {\n  x Float !!private,\n  y Float\n}');
  });

  it('should format !!private with decorators on tuple element', () => {
    const src = 'tuple Dec {\n  x Float @default(1.5) !!private,\n  y Float\n}';
    const { node, comments, source } = parseTupleNode(src);
    const result = printTuple(node, comments, config({ inlineConstructStyle: 'single' }), source);

    expect(result).toBe('tuple Dec { x Float @default(1.5) !!private, y Float }');
  });
});

// ---------------------------------------------------------------------------
// 9. Aligner: !!private 4th column
// ---------------------------------------------------------------------------

describe('aligner !!private support', () => {
  it('should pad decorator column when any field has !!private', () => {
    const fields = [
      field('id', 'Record', '@id', false, undefined, '!!private'),
      field('name', 'String', '', false),
      field('email', 'Email', '@unique', false),
    ];
    const result = alignFields(fields, config({ decoratorAlignment: 'aligned' }), '  ');

    // id line should have padded @id then !!private
    expect(result[0]).toContain('!!private');
    // name line should NOT have !!private
    expect(result[1]).not.toContain('!!private');
    // email line should NOT have !!private
    expect(result[2]).not.toContain('!!private');
  });

  it('should align !!private at same column across fields', () => {
    const fields = [
      field('id', 'Record', '@id', false, undefined, '!!private'),
      field('createdAt', 'Date', '@createdAt', false, undefined, '!!private'),
      field('updatedAt', 'Date', '@updatedAt', false),
    ];
    const result = alignFields(fields, config({ decoratorAlignment: 'aligned' }), '  ');

    const idPrivateIdx = result[0]!.indexOf('!!private');
    const createdPrivateIdx = result[1]!.indexOf('!!private');
    expect(idPrivateIdx).toBeGreaterThan(0);
    expect(idPrivateIdx).toBe(createdPrivateIdx);
  });

  it('should not add extra padding when no field has !!private', () => {
    const fields = [field('id', 'Record', '@id', false), field('name', 'String', '', false)];
    const result = alignFields(fields, config({ decoratorAlignment: 'aligned' }), '  ');

    // No trailing whitespace or !!private
    for (const line of result) {
      expect(line).toBe(line.trimEnd());
      expect(line).not.toContain('!!private');
    }
  });

  it('should handle !!private with compact decorator alignment', () => {
    const fields = [field('id', 'Record', '@id', false, undefined, '!!private'), field('name', 'String', '', false)];
    const result = alignFields(fields, config({ decoratorAlignment: 'compact' }), '  ');

    expect(result[0]).toContain('!!private');
    expect(result[1]).not.toContain('!!private');
  });

  it('should handle !!private on field without decorators', () => {
    const fields = [
      field('id', 'Record', '@id', false, undefined, '!!private'),
      field('secret', 'String', '', false, undefined, '!!private'),
    ];
    const result = alignFields(fields, config({ decoratorAlignment: 'aligned' }), '  ');

    // Both should have !!private at same column
    const idIdx = result[0]!.indexOf('!!private');
    const secretIdx = result[1]!.indexOf('!!private');
    expect(idIdx).toBe(secretIdx);
  });

  it('should respect group scope for !!private alignment', () => {
    const fields = [
      field('id', 'Record', '@id', false, undefined, '!!private'),
      field('name', 'String', '', true), // blank line after → group boundary
      field('secret', 'String', '', false, undefined, '!!private'),
    ];
    const result = alignFields(fields, config({ decoratorAlignment: 'aligned', alignmentScope: 'group' }), '  ');

    // Group 1: id (with !!private)
    expect(result[0]).toContain('!!private');
    // Group 2: secret (with !!private)
    expect(result[2]).toContain('!!private');
  });
});

// ---------------------------------------------------------------------------
// 10. Combined: abstract + extends + !!private
// ---------------------------------------------------------------------------

describe('combined abstract + extends + !!private', () => {
  it('should format abstract model with extends and private fields', () => {
    const src = [
      'abstract model SecureBase extends Entity {',
      '  id Record @id !!private',
      '  secret String !!private',
      '  name String',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('abstract model SecureBase extends Entity {');
    expect(result).toContain('!!private');
    const lines = result.split('\n');
    const nameLine = lines.find((l) => l.includes('name') && l.includes('String'))!;
    expect(nameLine).not.toContain('!!private');
  });

  it('should format abstract model with extends pick and private fields', () => {
    const src = ['abstract model Minimal extends Base[id, name] {', '  id Record @id !!private', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('abstract model Minimal extends Base[id, name] {');
    expect(result).toContain('!!private');
  });
});

// ---------------------------------------------------------------------------
// 11. Idempotency for new syntax
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  const idempotentCases = [
    {
      name: 'abstract model',
      src: 'abstract model Base {\n  id Record @id\n}\n',
    },
    {
      name: 'model extends',
      src: 'model User extends Base {\n  email Email @unique\n}\n',
    },
    {
      name: 'model extends with pick',
      src: 'model User extends Base[id, name] {\n  email Email @unique\n}\n',
    },
    {
      name: 'model extends with omit',
      src: 'model User extends Base[!updatedAt] {\n  email Email @unique\n}\n',
    },
    {
      name: 'abstract model extends with pick',
      src: 'abstract model Admin extends User[id, email] {\n  role String\n}\n',
    },
    {
      name: 'object extends',
      src: 'object Address extends BaseAddress {\n  zip String\n}\n',
    },
    {
      name: 'enum extends single-line',
      src: 'enum Extended extends Base { Extra, More }\n',
    },
    {
      name: 'enum extends multi-line',
      src: 'enum Extended extends Base {\n  Extra,\n  More\n}\n',
    },
    {
      name: 'literal extends single-line',
      src: "literal High extends Priority { 'urgent' }\n",
    },
    {
      name: 'tuple extends single-line',
      src: 'tuple Triple extends Pair { z Float }\n',
    },
    {
      name: '!!private on model fields',
      src: ['model Priv {', '  id   Record @id     !!private', '  name String', '}', ''].join('\n'),
    },
    {
      name: '!!private on tuple element single-line',
      src: 'tuple Priv { x Float !!private, y Float }\n',
    },
  ];

  for (const { name, src } of idempotentCases) {
    it(`format(format(x)) === format(x) for ${name}`, () => {
      const first = formatCerialSource(src);
      expect(first.error).toBeUndefined();

      const second = formatCerialSource(first.formatted!);
      expect(second.error).toBeUndefined();
      expect(second.changed).toBe(false);
      expect(second.formatted).toBe(first.formatted);
    });
  }
});

// ---------------------------------------------------------------------------
// 12. Full integration via formatCerialSource
// ---------------------------------------------------------------------------

describe('full integration', () => {
  it('should format a schema with abstract models and extends', () => {
    const src = [
      'abstract model Entity {',
      '  id Record @id !!private',
      '  createdAt Date @createdAt !!private',
      '  updatedAt Date @updatedAt',
      '}',
      '',
      'model User extends Entity {',
      '  email Email @unique',
      '  name String',
      '}',
    ].join('\n');
    const result = formatCerialSource(src);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('abstract model Entity {');
    expect(result.formatted).toContain('model User extends Entity {');
    expect(result.formatted).toContain('!!private');
  });

  it('should format a schema with enum and literal extends', () => {
    const src = ['enum Base { Admin, User, Guest }', '', 'enum Extended extends Base { SuperAdmin }'].join('\n');
    const result = formatCerialSource(src);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('enum Extended extends Base');
  });

  it('should format extends with no own fields (empty body)', () => {
    const src = 'model Alias extends Full {\n}\n';
    const result = formatCerialSource(src);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model Alias extends Full {');
  });

  it('should handle trailing comment on all extends variations', () => {
    const src = 'model X extends Y { # comment\n  a Int\n}\n';
    const result = formatCerialSource(src);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model X extends Y { # comment');
  });

  it('should handle leading comments before extends model', () => {
    const src = '# A child model\nmodel Child extends Parent {\n  extra String\n}\n';
    const result = formatCerialSource(src);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('# A child model');
    expect(result.formatted).toContain('model Child extends Parent {');
  });
});

// ---------------------------------------------------------------------------
// 13. Fixture idempotency tests
// ---------------------------------------------------------------------------

describe('fixture idempotency', () => {
  const EXTENDS_FIXTURES = [
    'extends-basic.cerial',
    'extends-pick-omit.cerial',
    'extends-private.cerial',
    'extends-abstract.cerial',
    'extends-enum-literal.cerial',
    'extends-tuple.cerial',
    'extends-comments.cerial',
    'extends-complex.cerial',
  ];

  const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

  for (const fixture of EXTENDS_FIXTURES) {
    it(`format(format(x)) === format(x) for ${fixture}`, async () => {
      const src = await Bun.file(join(FIXTURES_DIR, fixture)).text();
      const first = formatCerialSource(src);
      expect(first.error).toBeUndefined();

      const second = formatCerialSource(first.formatted!);
      expect(second.error).toBeUndefined();
      expect(second.changed).toBe(false);
      expect(second.formatted).toBe(first.formatted);
    });
  }

  for (const fixture of EXTENDS_FIXTURES) {
    it(`fixture ${fixture} is already-formatted`, async () => {
      const src = await Bun.file(join(FIXTURES_DIR, fixture)).text();
      const result = formatCerialSource(src);
      expect(result.error).toBeUndefined();
      expect(result.changed).toBe(false);
      expect(result.formatted).toBe(src);
    });
  }

  for (const fixture of EXTENDS_FIXTURES) {
    it(`fixture ${fixture} has no trailing whitespace`, async () => {
      const src = await Bun.file(join(FIXTURES_DIR, fixture)).text();
      const result = formatCerialSource(src);
      expect(result.error).toBeUndefined();

      for (const line of result.formatted!.split('\n')) {
        if (line.length > 0) {
          expect(line).toBe(line.trimEnd());
        }
      }
    });
  }

  for (const fixture of EXTENDS_FIXTURES) {
    it(`fixture ${fixture} ends with single trailing newline`, async () => {
      const src = await Bun.file(join(FIXTURES_DIR, fixture)).text();
      const result = formatCerialSource(src);
      expect(result.error).toBeUndefined();
      expect(result.formatted!.endsWith('\n')).toBe(true);
      expect(result.formatted!.endsWith('\n\n')).toBe(false);
    });
  }

  it('idempotency holds across config variants for extends fixtures', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-complex.cerial')).text();
    const configs: FormatConfig[] = [
      { indentSize: 4 },
      { indentSize: 'tab' },
      { decoratorAlignment: 'compact' },
      { fieldGroupBlankLines: 'collapse' },
      { inlineConstructStyle: 'single' },
      { trailingComma: true },
      { commentStyle: 'hash' },
      { alignmentScope: 'block' },
    ];

    for (const cfg of configs) {
      const first = formatCerialSource(src, cfg);
      expect(first.error).toBeUndefined();

      const second = formatCerialSource(first.formatted!, cfg);
      expect(second.error).toBeUndefined();
      expect(second.changed).toBe(false);
      expect(second.formatted).toBe(first.formatted);
    }
  });
});

// ---------------------------------------------------------------------------
// 14. !!private alignment edge cases
// ---------------------------------------------------------------------------

describe('!!private alignment edge cases', () => {
  it('should align !!private with varying name lengths and decorator lengths', () => {
    const src = [
      'model EdgeCase {',
      '  id Record @id !!private',
      '  verylongfieldname String @unique @readonly !!private',
      '  x Int',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result.split('\n');

    const idLine = lines.find((l) => l.includes('id') && l.includes('Record'))!;
    const longLine = lines.find((l) => l.includes('verylongfieldname'))!;
    expect(idLine).toContain('!!private');
    expect(longLine).toContain('!!private');

    // Both !!private tokens aligned at same column
    expect(idLine.indexOf('!!private')).toBe(longLine.indexOf('!!private'));
  });

  it('should handle all fields having !!private', () => {
    const src = [
      'model AllPrivate {',
      '  id Record @id !!private',
      '  name String !!private',
      '  email Email @unique !!private',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result
      .split('\n')
      .filter((l) => l.trim().startsWith('id') || l.trim().startsWith('name') || l.trim().startsWith('email'));

    // All 3 fields should have !!private at the same column
    const positions = lines.map((l) => l.indexOf('!!private'));
    expect(positions.every((p) => p === positions[0])).toBe(true);
    expect(positions[0]).toBeGreaterThan(0);
  });

  it('should handle only one field with !!private and many without', () => {
    const src = [
      'model SinglePrivate {',
      '  id Record @id !!private',
      '  name String',
      '  email Email @unique',
      '  age Int?',
      '  bio String? @nullable',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result.split('\n');

    const idLine = lines.find((l) => l.trim().startsWith('id'))!;
    expect(idLine).toContain('!!private');
    // Other fields should NOT have !!private
    for (const line of lines.filter(
      (l) => l.trim() && !l.trim().startsWith('id') && !l.includes('{') && !l.includes('}'),
    )) {
      expect(line).not.toContain('!!private');
    }
  });

  it('should respect group boundaries for !!private alignment', () => {
    const src = [
      'model GroupedPrivate {',
      '  id Record @id !!private',
      '  secret String !!private',
      '',
      '  name String',
      '  email Email @unique !!private',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'honor', alignmentScope: 'group' });
    const lines = result.split('\n');

    // Group 1: id + secret — both have !!private, aligned within group
    const idLine = lines.find((l) => l.trim().startsWith('id'))!;
    const secretLine = lines.find((l) => l.trim().startsWith('secret'))!;
    expect(idLine.indexOf('!!private')).toBe(secretLine.indexOf('!!private'));

    // Group 2: name + email — only email has !!private
    const emailLine = lines.find((l) => l.trim().startsWith('email'))!;
    expect(emailLine).toContain('!!private');
  });

  it('should handle !!private with no decorators alongside fields with many decorators', () => {
    const src = [
      'model Mixed {',
      '  secret String !!private',
      '  authorId Record',
      '  author Relation @field(authorId) @model(Mixed) @key(authorKey) !!private',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result.split('\n');

    const secretLine = lines.find((l) => l.trim().startsWith('secret'))!;
    const authorLine = lines.find((l) => l.trim().startsWith('author') && l.includes('Relation'))!;
    expect(secretLine).toContain('!!private');
    expect(authorLine).toContain('!!private');
    expect(secretLine.indexOf('!!private')).toBe(authorLine.indexOf('!!private'));
  });

  it('should handle !!private on extends model fields', () => {
    const src = [
      'model Child extends Parent {',
      '  extra String @unique !!private',
      '  visible Bool @default(true)',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('model Child extends Parent {');
    expect(result).toContain('!!private');
    const lines = result.split('\n');
    const visibleLine = lines.find((l) => l.includes('visible'))!;
    expect(visibleLine).not.toContain('!!private');
  });

  it('should handle !!private on abstract model extends with pick and private', () => {
    const src = ['abstract model Secured extends Base[id] {', '  token String !!private', '  label String', '}'].join(
      '\n',
    );
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    expect(result).toStartWith('abstract model Secured extends Base[id] {');
    expect(result).toContain('!!private');
    const lines = result.split('\n');
    const labelLine = lines.find((l) => l.includes('label'))!;
    expect(labelLine).not.toContain('!!private');
  });
});

// ---------------------------------------------------------------------------
// 15. !!private is NOT reordered with decorators
// ---------------------------------------------------------------------------

describe('!!private ordering', () => {
  it('!!private always appears after decorators, never reordered', () => {
    const src = [
      'model Order {',
      '  id Record @id !!private',
      '  name String @unique @readonly !!private',
      '  email Email @default("a@b.com") !!private',
      '}',
    ].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    const lines = result.split('\n').filter((l) => l.includes('!!private'));

    for (const line of lines) {
      const privateIdx = line.indexOf('!!private');
      const lastDecoratorIdx = line.lastIndexOf('@');
      // !!private must come after all decorators
      if (lastDecoratorIdx >= 0) {
        expect(privateIdx).toBeGreaterThan(lastDecoratorIdx);
      }
    }
  });

  it('!!private is not treated as a decorator for reordering', () => {
    // Decorators get canonical-ordered, but !!private stays at end
    const src = ['model Reorder {', '  name String @nullable @readonly !!private', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    // Canonical order: @readonly before @nullable
    const nameLine = result.split('\n').find((l) => l.includes('name'))!;
    const readonlyIdx = nameLine.indexOf('@readonly');
    const nullableIdx = nameLine.indexOf('@nullable');
    const privateIdx = nameLine.indexOf('!!private');
    expect(readonlyIdx).toBeLessThan(nullableIdx);
    expect(nullableIdx).toBeLessThan(privateIdx);
  });

  it('!!private is preserved on fields without decorators', () => {
    const src = ['model NoDecorators {', '  secret String !!private', '  visible String', '}'].join('\n');
    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });

    const secretLine = result.split('\n').find((l) => l.includes('secret'))!;
    expect(secretLine).toContain('!!private');
    expect(secretLine).not.toContain('@');
  });
});

// ---------------------------------------------------------------------------
// 16. Comment preservation after extends clause
// ---------------------------------------------------------------------------

describe('comment preservation with extends', () => {
  it('preserves trailing comment after model extends clause', () => {
    const src = 'model X extends Y { # important note\n  a Int\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model X extends Y { # important note');
  });

  it('preserves trailing comment after model extends with pick', () => {
    const src = 'model X extends Y[id, name] { # picked fields\n  extra String\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model X extends Y[id, name] { # picked fields');
  });

  it('preserves trailing comment after model extends with omit', () => {
    const src = 'model X extends Y[!secret] { # omitted secret\n  extra String\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model X extends Y[!secret] { # omitted secret');
  });

  it('preserves trailing comment after abstract model extends', () => {
    const src = 'abstract model Base extends Entity { # base type\n  id Record @id\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('abstract model Base extends Entity { # base type');
  });

  it('preserves trailing comment after object extends', () => {
    const src = 'object Addr extends BaseAddr { # shipping\n  zip String\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('object Addr extends BaseAddr { # shipping');
  });

  it('preserves leading comment before extends model', () => {
    const src = '# Extended user\nmodel User extends Entity {\n  email Email\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('# Extended user\nmodel User extends Entity {');
  });

  it('preserves leading comment before extends object', () => {
    const src = '# Full address\nobject Full extends Base {\n  zip String\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('# Full address\nobject Full extends Base {');
  });

  it('preserves both leading and trailing comments on extends', () => {
    const src = '# The child\nmodel Child extends Parent { # inherits\n  extra String\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('# The child\nmodel Child extends Parent { # inherits');
  });

  it('preserves slash-style trailing comment after extends', () => {
    const src = 'model X extends Y { // slash comment\n  a Int\n}\n';
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model X extends Y { // slash comment');
  });

  it('normalizes trailing comment style with commentStyle config', () => {
    const src = 'model X extends Y { // slash comment\n  a Int\n}\n';
    const result = formatCerialSource(src, { commentStyle: 'hash' });
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model X extends Y { # slash comment');
  });
});

// ---------------------------------------------------------------------------
// 17. Fixture content preservation
// ---------------------------------------------------------------------------

describe('fixture content preservation', () => {
  const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

  it('extends-basic preserves all block headers', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-basic.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('abstract model Entity {');
    expect(result.formatted).toContain('model User extends Entity {');
    expect(result.formatted).toContain('object BaseAddress {');
    expect(result.formatted).toContain('object ShippingAddress extends BaseAddress {');
    expect(result.formatted).toContain('model Order extends Entity {');
  });

  it('extends-pick-omit preserves pick and omit syntax', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-pick-omit.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('extends Timestamps[id, createdAt]');
    expect(result.formatted).toContain('extends Timestamps[!updatedAt]');
    expect(result.formatted).toContain('extends Timestamps[!createdAt, !updatedAt]');
    expect(result.formatted).toContain('extends FullProfile[bio, avatar]');
    expect(result.formatted).toContain('extends FullProfile[!website]');
  });

  it('extends-private preserves !!private markers', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-private.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    const privateCount = (result.formatted!.match(/!!private/g) || []).length;
    expect(privateCount).toBeGreaterThanOrEqual(7);
  });

  it('extends-abstract preserves abstract keyword chain', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-abstract.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('abstract model Base {');
    expect(result.formatted).toContain('abstract model Timestamped extends Base {');
    expect(result.formatted).toContain('model Document extends Timestamped {');
    expect(result.formatted).toContain('model Article extends Timestamped {');
  });

  it('extends-enum-literal preserves all enum/literal extends variants', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-enum-literal.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('enum ExtendedRole extends BaseRole');
    expect(result.formatted).toContain('enum CoreOnly extends BaseRole[Admin, Viewer]');
    expect(result.formatted).toContain('enum NoAdmin extends BaseRole[!Admin]');
    expect(result.formatted).toContain('literal ExtendedPriority extends BasePriority');
    expect(result.formatted).toContain("literal HighOnly extends BasePriority['high']");
    expect(result.formatted).toContain("literal NoLow extends BasePriority[!'low']");
  });

  it('extends-tuple preserves tuple extends variants', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-tuple.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('tuple Triple extends Pair');
    expect(result.formatted).toContain('tuple Named extends Pair');
    expect(result.formatted).toContain('tuple WithPick extends Pair[0]');
    expect(result.formatted).toContain('tuple WithOmit extends Pair[!1]');
    expect(result.formatted).toContain('!!private');
  });

  it('extends-comments preserves all comments', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-comments.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('# Base entity for all models');
    expect(result.formatted).toContain('# core type');
    expect(result.formatted).toContain('# User extends Entity');
    expect(result.formatted).toContain('# user model');
    expect(result.formatted).toContain('# Extended roles');
    expect(result.formatted).toContain('# High priority only');
    expect(result.formatted).toContain('# 3D point');
  });

  it('extends-complex preserves all construct types', async () => {
    const src = await Bun.file(join(FIXTURES_DIR, 'extends-complex.cerial')).text();
    const result = formatCerialSource(src);
    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('enum BaseRole');
    expect(result.formatted).toContain('enum ExtRole extends BaseRole');
    expect(result.formatted).toContain('literal BasePriority');
    expect(result.formatted).toContain('literal ExtPriority extends BasePriority');
    expect(result.formatted).toContain('tuple Pair');
    expect(result.formatted).toContain('tuple Triple extends Pair');
    expect(result.formatted).toContain('object BaseAddress');
    expect(result.formatted).toContain('object FullAddress extends BaseAddress');
    expect(result.formatted).toContain('abstract model Entity');
    expect(result.formatted).toContain('model User extends Entity');
    expect(result.formatted).toContain('model Admin extends Entity[id, createdAt]');
    expect(result.formatted).toContain('model Readonly extends Entity[!updatedAt]');
  });
});
