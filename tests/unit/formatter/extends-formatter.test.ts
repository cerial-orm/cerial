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
      src: 'abstract model Base {\n  id  Record  @id\n}\n',
    },
    {
      name: 'model extends',
      src: 'model User extends Base {\n  email  Email  @unique\n}\n',
    },
    {
      name: 'model extends with pick',
      src: 'model User extends Base[id, name] {\n  email  Email  @unique\n}\n',
    },
    {
      name: 'model extends with omit',
      src: 'model User extends Base[!updatedAt] {\n  email  Email  @unique\n}\n',
    },
    {
      name: 'abstract model extends with pick',
      src: 'abstract model Admin extends User[id, email] {\n  role  String\n}\n',
    },
    {
      name: 'object extends',
      src: 'object Address extends BaseAddress {\n  zip  String\n}\n',
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
      src: ['model Priv {', '  id    Record  @id      !!private', '  name  String', '}', ''].join('\n'),
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
