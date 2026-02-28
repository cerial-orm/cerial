/**
 * Tests for block printer (model and object formatting)
 */

import { describe, expect, it } from 'bun:test';
import { attachComments } from '../../../src/formatter/comment-attacher';
import {
  buildTypeWithModifiers,
  extractDecoratorText,
  formatDirective,
  printModel,
  printObject,
} from '../../../src/formatter/printer';
import type { FormatConfig } from '../../../src/formatter/types';
import { FORMAT_DEFAULTS } from '../../../src/formatter/types';
import { parse } from '../../../src/parser/parser';
import { tokenize } from '../../../src/parser/tokenizer';

// Helper to create a resolved config with overrides
function config(overrides?: FormatConfig): Required<FormatConfig> {
  return { ...FORMAT_DEFAULTS, ...overrides };
}

// Helper: parse + tokenize + attach comments + print model
function formatModel(source: string, overrides?: FormatConfig): string {
  const tokens = tokenize(source);
  const { ast } = parse(source);
  const comments = attachComments(tokens, ast);
  const model = ast.models[0]!;

  return printModel(model, comments, config(overrides), source);
}

// Helper: parse + tokenize + attach comments + print object
function formatObject(source: string, overrides?: FormatConfig): string {
  const tokens = tokenize(source);
  const { ast } = parse(source);
  const comments = attachComments(tokens, ast);
  const object = ast.objects[0]!;

  return printObject(object, comments, config(overrides), source);
}

describe('printModel', () => {
  describe('basic alignment', () => {
    it('should format simple model with 3 fields aligned (collapse mode)', () => {
      const src = ['model User {', '  id Record @id', '  email Email @unique', '  name String', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toBe(
        ['model User {', '  id    Record @id', '  email Email  @unique', '  name  String', '}'].join('\n'),
      );
    });

    it('should handle single field model', () => {
      const src = 'model Simple {\n  id Record @id\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toBe(['model Simple {', '  id Record @id', '}'].join('\n'));
    });

    it('should handle empty model', () => {
      const src = 'model Empty {\n}';
      const result = formatModel(src);
      expect(result).toBe('model Empty {\n}');
    });
  });

  describe('fieldGroupBlankLines: single', () => {
    it('should preserve blank lines where they exist in source', () => {
      const src = ['model User {', '  id Record @id', '', '  email Email @unique', '  name String', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'single', alignmentScope: 'block' });
      expect(result).toBe(
        ['model User {', '  id    Record @id', '', '  email Email  @unique', '  name  String', '}'].join('\n'),
      );
    });
    it('should not add blank line where source has none', () => {
      const src = 'model M {\n  a Int\n  b String\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'single', alignmentScope: 'block' });
      // single mode only preserves existing blank lines — source has none
      expect(result).not.toContain('\n\n');
    });
  });

  describe('fieldGroupBlankLines: collapse', () => {
    it('should remove all blank lines between fields', () => {
      const src = ['model User {', '  id Record @id', '', '  email Email @unique', '', '  name String', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse', alignmentScope: 'block' });
      expect(result).toBe(
        ['model User {', '  id    Record @id', '  email Email  @unique', '  name  String', '}'].join('\n'),
      );
    });
  });

  describe('fieldGroupBlankLines: honor', () => {
    it('should preserve blank lines where they exist in source', () => {
      const src = ['model User {', '  id Record @id', '', '  email Email @unique', '  name String', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'honor', alignmentScope: 'block' });
      expect(result).toBe(
        ['model User {', '  id    Record @id', '', '  email Email  @unique', '  name  String', '}'].join('\n'),
      );
    });

    it('should not insert blank lines where source has none', () => {
      const src = ['model User {', '  id Record @id', '  email Email @unique', '  name String', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'honor', alignmentScope: 'block' });
      expect(result).not.toContain('\n\n');
    });

    it('should handle multiple blank line groups', () => {
      const src = [
        'model User {',
        '  id Record @id',
        '  email Email @unique',
        '',
        '  createdAt Date @createdAt',
        '  updatedAt Date @updatedAt',
        '}',
      ].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'honor', alignmentScope: 'block' });
      expect(result).toBe(
        [
          'model User {',
          '  id        Record @id',
          '  email     Email  @unique',
          '',
          '  createdAt Date   @createdAt',
          '  updatedAt Date   @updatedAt',
          '}',
        ].join('\n'),
      );
    });
  });

  describe('blankLineBeforeDirectives: always', () => {
    it('should add blank line before first directive', () => {
      const src = [
        'model Staff {',
        '  firstName String',
        '  lastName String',
        '  @@unique(staffName, [firstName, lastName])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
      });
      expect(result).toBe(
        [
          'model Staff {',
          '  firstName String',
          '  lastName  String',
          '',
          '  @@unique(staffName, [firstName, lastName])',
          '}',
        ].join('\n'),
      );
    });

    it('should not add blank line if no fields before directive', () => {
      // Edge case: model with only a directive (unlikely but defensive)
      // This can't actually happen since directives reference fields,
      // but test that no extra blank line is inserted at the top of the block
      const src = ['model Staff {', '  firstName String', '  @@unique(staffName, [firstName])', '}'].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
      });
      const lines = result.split('\n');
      // Should have blank line between last field and directive
      expect(lines[2]).toBe('');
      expect(lines[3]).toBe('  @@unique(staffName, [firstName])');
    });
  });

  describe('blankLineBeforeDirectives: honor', () => {
    it('should preserve blank line before directives from source', () => {
      const src = [
        'model Staff {',
        '  firstName String',
        '  lastName String',
        '',
        '  @@unique(staffName, [firstName, lastName])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'honor',
      });
      expect(result).toContain('\n\n  @@unique');
    });

    it('should not add blank line when source has none', () => {
      const src = [
        'model Staff {',
        '  firstName String',
        '  lastName String',
        '  @@unique(staffName, [firstName, lastName])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'honor',
      });
      // No blank line before directive
      expect(result).not.toContain('\n\n  @@unique');
    });
  });

  describe('composite directives', () => {
    it('should format @@unique directive', () => {
      const src = [
        'model Staff {',
        '  firstName String',
        '  lastName String',
        '  @@unique(staffFullName, [firstName, lastName])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
      });
      expect(result).toContain('@@unique(staffFullName, [firstName, lastName])');
    });

    it('should format @@index directive', () => {
      const src = [
        'model Staff {',
        '  department String',
        '  firstName String',
        '  @@index(staffDeptName, [department, firstName])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
      });
      expect(result).toContain('@@index(staffDeptName, [department, firstName])');
    });

    it('should format multiple directives', () => {
      const src = [
        'model Staff {',
        '  firstName String',
        '  lastName String',
        '  department String',
        '  @@unique(staffFullName, [firstName, lastName])',
        '  @@index(staffDeptName, [department, firstName])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
      });
      expect(result).toContain('@@unique(staffFullName, [firstName, lastName])');
      expect(result).toContain('@@index(staffDeptName, [department, firstName])');
    });

    it('should format directives with dot notation fields', () => {
      const src = [
        'model Warehouse {',
        '  name String',
        '  @@unique(cityZip, [location.city, location.zip])',
        '}',
      ].join('\n');

      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
      });
      expect(result).toContain('@@unique(cityZip, [location.city, location.zip])');
    });
  });

  describe('comments', () => {
    it('should preserve leading comments on model', () => {
      const src = '# User model\nmodel User {\n  id Record @id\n}';

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toStartWith('# User model\nmodel User {');
    });

    it('should preserve trailing comment on model opening', () => {
      const src = 'model User { # main model\n  id Record @id\n}';

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('model User { # main model');
    });

    it('should preserve leading comments on fields', () => {
      const src = [
        'model User {',
        '  # Primary key',
        '  id Record @id',
        '  # User email',
        '  email Email @unique',
        '}',
      ].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('  # Primary key\n  id');
      expect(result).toContain('  # User email\n  email');
    });

    it('should preserve trailing comments on fields', () => {
      const src = ['model User {', '  id Record @id # pk', '  name String', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@id # pk');
    });

    it('should preserve multiple leading comments', () => {
      const src = ['# Line 1', '# Line 2', 'model User {', '  id Record @id', '}'].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toStartWith('# Line 1\n# Line 2\nmodel User {');
    });
  });

  describe('decorator reordering', () => {
    it('should reorder @nullable before @id to @id before @nullable', () => {
      const src = 'model User {\n  id Record @nullable @id\n}';

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      // @id should come before @nullable in canonical order
      expect(result).toContain('@id @nullable');
    });

    it('should reorder @model before @field to @field before @model', () => {
      const src = 'model Post {\n  authorId Record\n  author Relation @model(User) @field(authorId)\n}';

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@field(authorId) @model(User)');
    });

    it('should preserve already-correct order', () => {
      const src = 'model User {\n  id Record @id @unique\n}';

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@id @unique');
    });
  });

  describe('indentation', () => {
    it('should use 2-space indent by default', () => {
      const src = 'model User {\n  id Record @id\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      const fieldLine = result.split('\n')[1]!;
      expect(fieldLine).toStartWith('  '); // 2 spaces
      expect(fieldLine).not.toStartWith('    '); // not 4
    });

    it('should use 4-space indent when configured', () => {
      const src = 'model User {\n  id Record @id\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse', indentSize: 4 });
      const fieldLine = result.split('\n')[1]!;
      expect(fieldLine).toStartWith('    '); // 4 spaces
    });

    it('should use tab indent when configured', () => {
      const src = 'model User {\n  id Record @id\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse', indentSize: 'tab' });
      const fieldLine = result.split('\n')[1]!;
      expect(fieldLine).toStartWith('\t');
    });

    it('should indent leading field comments with same indent', () => {
      const src = 'model User {\n  # key\n  id Record @id\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse', indentSize: 4 });
      expect(result).toContain('    # key\n    id');
    });

    it('should indent directives with same indent', () => {
      const src = ['model Staff {', '  firstName String', '  @@unique(staffName, [firstName])', '}'].join('\n');
      const result = formatModel(src, {
        fieldGroupBlankLines: 'collapse',
        blankLineBeforeDirectives: 'always',
        indentSize: 4,
      });
      expect(result).toContain('    @@unique(staffName, [firstName])');
    });
  });

  describe('complex field types', () => {
    it('should format Record(int) typed id', () => {
      const src = 'model User {\n  id Record(int) @id\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('Record(int)');
    });

    it('should format Record(string, int) union typed id', () => {
      const src = 'model User {\n  id Record(string, int) @id\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('Record(string, int)');
    });

    it('should format optional field with ?', () => {
      const src = 'model User {\n  name String?\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('String?');
    });

    it('should format array field with []', () => {
      const src = 'model User {\n  tags String[]\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('String[]');
    });

    it('should format Relation type', () => {
      const src = 'model Post {\n  authorId Record\n  author Relation @field(authorId) @model(User)\n}';
      const { ast } = parse(src);
      const relationField = ast.models[0]!.fields[1]!;

      expect(buildTypeWithModifiers(relationField)).toBe('Relation');
    });

    it('should format Relation[] array type', () => {
      const src = 'model User {\n  posts Relation[] @model(Post)\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('Relation[]');
    });

    it('should format object-typed field by name', () => {
      const src = 'object Address {\n  city String\n}\nmodel User {\n  addr Address\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('Address');
    });

    it('should format optional object field', () => {
      const src = 'object Address {\n  city String\n}\nmodel User {\n  addr Address?\n}';
      const { ast } = parse(src);
      const field = ast.models[0]!.fields[0]!;

      expect(buildTypeWithModifiers(field)).toBe('Address?');
    });

    it('should format all basic types capitalized', () => {
      const types: Array<[string, string]> = [
        ['String', 'String'],
        ['Email', 'Email'],
        ['Int', 'Int'],
        ['Date', 'Date'],
        ['Bool', 'Bool'],
        ['Float', 'Float'],
        ['Uuid', 'Uuid'],
        ['Duration', 'Duration'],
        ['Decimal', 'Decimal'],
        ['Bytes', 'Bytes'],
        ['Geometry', 'Geometry'],
        ['Any', 'Any'],
        ['Number', 'Number'],
      ];

      for (const [input, expected] of types) {
        const src = `model M {\n  f ${input}\n}`;
        const { ast } = parse(src);
        const field = ast.models[0]!.fields[0]!;
        expect(buildTypeWithModifiers(field)).toBe(expected);
      }
    });

    it('should format complex types in full model output', () => {
      const src = [
        'model Post {',
        '  id Record(int) @id',
        '  title String',
        '  content String?',
        '  tags String[]',
        '  authorId Record',
        '  author Relation @field(authorId) @model(User)',
        '  comments Relation[] @model(Comment)',
        '}',
      ].join('\n');

      const result = formatModel(src, { fieldGroupBlankLines: 'collapse', alignmentScope: 'block' });
      expect(result).toContain('Record(int)');
      expect(result).toContain('String?');
      expect(result).toContain('String[]');
      expect(result).toContain('Relation ');
      expect(result).toContain('Relation[]');
    });
  });

  describe('decorator value preservation', () => {
    it('should preserve @default with single-quoted string', () => {
      const src = "model User {\n  role String @default('admin')\n}";
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain("@default('admin')");
    });

    it('should preserve @default with double-quoted string', () => {
      const src = 'model User {\n  role String @default("admin")\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@default("admin")');
    });

    it('should preserve @default with number', () => {
      const src = 'model User {\n  age Int @default(18)\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@default(18)');
    });

    it('should preserve @default with boolean', () => {
      const src = 'model User {\n  active Bool @default(true)\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@default(true)');
    });

    it('should preserve @default with null', () => {
      const src = 'model User {\n  name String? @nullable @default(null)\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@default(null)');
    });

    it('should preserve @field and @model references', () => {
      const src = 'model Post {\n  authorId Record\n  author Relation @field(authorId) @model(User)\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@field(authorId)');
      expect(result).toContain('@model(User)');
    });

    it('should preserve @onDelete action', () => {
      const src =
        'model Post {\n  authorId Record?\n  author Relation? @field(authorId) @model(User) @onDelete(Cascade)\n}';
      const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
      expect(result).toContain('@onDelete(Cascade)');
    });
  });

  describe('alignment scope interaction', () => {
    it('should use group scope alignment with single blank lines', () => {
      const src = [
        'model User {',
        '  id Record @id',
        '  email Email @unique',
        '',
        '  createdAt Date @createdAt',
        '  updatedAt Date @updatedAt',
        '}',
      ].join('\n');

      // group scope (default) + honor blank lines
      const result = formatModel(src, { fieldGroupBlankLines: 'honor', alignmentScope: 'group' });
      const lines = result.split('\n');

      // Group 1: id, email — aligned within group
      // Group 2: createdAt, updatedAt — aligned within group
      // Both groups have different max widths
      expect(lines[1]).toContain('id');
      expect(lines[2]).toContain('email');
      // Blank line separator
      expect(lines[3]).toBe('');
      expect(lines[4]).toContain('createdAt');
      expect(lines[5]).toContain('updatedAt');
    });
  });
});

describe('printObject', () => {
  it('should format object block with object keyword', () => {
    const src = ['object Address {', '  street String', '  city String', '  zip String', '}'].join('\n');

    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });
    expect(result).toBe(['object Address {', '  street String', '  city   String', '  zip    String', '}'].join('\n'));
  });

  it('should format object with decorators', () => {
    const src = ['object Address {', '  street String', '  city String @default("NYC")', '}'].join('\n');

    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });
    expect(result).toContain('object Address {');
    expect(result).toContain('@default("NYC")');
  });

  it('should preserve comments on object blocks', () => {
    const src = ['# Address type', 'object Address {', '  city String', '}'].join('\n');

    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });
    expect(result).toStartWith('# Address type\nobject Address {');
  });

  it('should not include directives for objects', () => {
    // Objects don't have composite directives — printObject passes undefined
    const src = ['object Address {', '  street String', '  city String', '}'].join('\n');

    const result = formatObject(src, { fieldGroupBlankLines: 'collapse' });
    expect(result).not.toContain('@@');
  });

  it('should respect indent config for objects', () => {
    const src = 'object Coord {\n  x Float\n  y Float\n}';
    const result = formatObject(src, { fieldGroupBlankLines: 'collapse', indentSize: 'tab' });
    expect(result).toContain('\tx Float');
  });
});

describe('extractDecoratorText', () => {
  it('should extract simple decorator from source', () => {
    const src = 'model User {\n  id Record @id\n}';
    const { ast } = parse(src);
    const decorator = ast.models[0]!.fields[0]!.decorators[0]!;
    const sourceLines = src.split('\n');

    expect(extractDecoratorText(decorator, sourceLines)).toBe('@id');
  });

  it('should extract decorator with value from source', () => {
    const src = "model User {\n  name String @default('test')\n}";
    const { ast } = parse(src);
    const decorator = ast.models[0]!.fields[0]!.decorators[0]!;
    const sourceLines = src.split('\n');

    expect(extractDecoratorText(decorator, sourceLines)).toBe("@default('test')");
  });

  it('should not confuse @uuid with @uuid4', () => {
    const src = 'model User {\n  token Uuid @uuid\n}';
    const { ast } = parse(src);
    const decorator = ast.models[0]!.fields[0]!.decorators[0]!;
    const sourceLines = src.split('\n');

    expect(extractDecoratorText(decorator, sourceLines)).toBe('@uuid');
  });
});

describe('buildTypeWithModifiers', () => {
  it('should capitalize simple types', () => {
    const src = 'model M {\n  f String\n}';
    const { ast } = parse(src);

    expect(buildTypeWithModifiers(ast.models[0]!.fields[0]!)).toBe('String');
  });

  it('should handle Record(int)', () => {
    const src = 'model M {\n  id Record(int) @id\n}';
    const { ast } = parse(src);

    expect(buildTypeWithModifiers(ast.models[0]!.fields[0]!)).toBe('Record(int)');
  });

  it('should append ? for optional', () => {
    const src = 'model M {\n  f Int?\n}';
    const { ast } = parse(src);

    expect(buildTypeWithModifiers(ast.models[0]!.fields[0]!)).toBe('Int?');
  });

  it('should append [] for array', () => {
    const src = 'model M {\n  f Int[]\n}';
    const { ast } = parse(src);

    expect(buildTypeWithModifiers(ast.models[0]!.fields[0]!)).toBe('Int[]');
  });
});

describe('formatDirective', () => {
  it('should format unique directive', () => {
    const result = formatDirective({
      kind: 'unique',
      name: 'emailUnique',
      fields: ['email'],
      range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } },
    });
    expect(result).toBe('@@unique(emailUnique, [email])');
  });

  it('should format index directive with multiple fields', () => {
    const result = formatDirective({
      kind: 'index',
      name: 'nameDate',
      fields: ['name', 'createdAt'],
      range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } },
    });
    expect(result).toBe('@@index(nameDate, [name, createdAt])');
  });

  it('should format directive with dot-notation fields', () => {
    const result = formatDirective({
      kind: 'unique',
      name: 'cityZip',
      fields: ['location.city', 'location.zip'],
      range: { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } },
    });
    expect(result).toBe('@@unique(cityZip, [location.city, location.zip])');
  });
});

describe('compact decorator alignment', () => {
  it('should produce compact output without column-aligned decorators', () => {
    const src = ['model User {', '  id Record @id', '  email Email @unique', '  name String', '}'].join('\n');

    const result = formatModel(src, {
      fieldGroupBlankLines: 'collapse',
      decoratorAlignment: 'compact',
    });
    // In compact mode, type is NOT padded before decorators
    expect(result).toBe(
      ['model User {', '  id    Record @id', '  email Email @unique', '  name  String', '}'].join('\n'),
    );
  });
});

describe('full integration', () => {
  it('should format a realistic model with all features', () => {
    const src = [
      '# The user model',
      'model User {',
      '  id Record @id',
      '  email Email @unique',
      '  name String',
      '',
      '  createdAt Date @createdAt',
      '  updatedAt Date @updatedAt',
      '',
      '  @@unique(emailIdx, [email])',
      '}',
    ].join('\n');

    const result = formatModel(src, {
      fieldGroupBlankLines: 'honor',
      blankLineBeforeDirectives: 'always',
      alignmentScope: 'block',
    });

    expect(result).toContain('# The user model');
    expect(result).toStartWith('# The user model\nmodel User {');
    expect(result).toContain('@@unique(emailIdx, [email])');
    expect(result).toEndWith('}');
    // Should have blank line before directive
    expect(result).toContain('\n\n  @@unique');
  });

  it('should handle model with comments on directives', () => {
    const src = [
      'model Staff {',
      '  firstName String',
      '  lastName String',
      '  # Ensure unique full name',
      '  @@unique(staffFullName, [firstName, lastName])',
      '}',
    ].join('\n');

    const result = formatModel(src, {
      fieldGroupBlankLines: 'collapse',
      blankLineBeforeDirectives: 'always',
    });
    expect(result).toContain('# Ensure unique full name');
    expect(result).toContain('@@unique(staffFullName, [firstName, lastName])');
  });

  it('should handle model with slash comments', () => {
    const src = ['// User model', 'model User {', '  id Record @id', '  name String // user name', '}'].join('\n');

    const result = formatModel(src, { fieldGroupBlankLines: 'collapse' });
    expect(result).toContain('// User model');
    expect(result).toContain('// user name');
  });
});
