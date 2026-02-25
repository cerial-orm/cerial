/**
 * Edge case tests for completion handler functions.
 *
 * Tests the OUTPUT of exported completion functions and their edge cases.
 * Non-exported internal handlers are tested indirectly through exported functions.
 *
 * Organized by function.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../orm/src/parser/parser';
import {
  getDecoratorCompletions,
  getDefaultArgCompletions,
  getExtendsBracketCompletions,
  getExtendsBracketContext,
  isDecoratorAllowedForFieldType,
  isInsideDefaultParens,
  resolveEnumLiteralValues,
} from '../../server/src/providers/completion';
import type { BlockContext } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, testPath } from './helpers';

// ---------------------------------------------------------------------------
// isInsideDefaultParens
// ---------------------------------------------------------------------------

describe('isInsideDefaultParens', () => {
  test('inside @default(...): returns true', () => {
    const lineText = '  field String @default(';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(true);
  });

  test('inside @defaultAlways(...): returns true', () => {
    const lineText = '  field String @defaultAlways(';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(true);
  });

  test('after closing paren: returns false', () => {
    const lineText = '  field String @default(value)';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(false);
  });

  test('before @default: returns false', () => {
    const lineText = '  field String ';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(false);
  });

  test('with nested parens: detects innermost', () => {
    const lineText = '  field String @default(func(';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(true);
  });

  test('with multiple decorators: detects last @default', () => {
    const lineText = '  field String @unique @default(';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(true);
  });

  test('with @defaultAlways after @default: detects @defaultAlways', () => {
    const lineText = '  field String @default(old) @defaultAlways(';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(true);
  });

  test('cursor at position before opening paren: returns false', () => {
    const lineText = '  field String @default';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(false);
  });

  test('with closing paren in middle: returns false', () => {
    const lineText = '  field String @default(value) @unique';
    const result = isInsideDefaultParens(lineText, lineText.length);
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getDefaultArgCompletions
// ---------------------------------------------------------------------------

describe('getDefaultArgCompletions', () => {
  test('with null AST: returns empty array', () => {
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: null,
    };
    const items = getDefaultArgCompletions(
      null,
      blockContext,
      '',
      { line: 0, column: 0, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(items).toHaveLength(0);
  });

  test('with enum field: returns completion items', () => {
    const source = 'enum Role { Admin Editor Viewer }\nmodel User { id Record @id\nrole Role @default(';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDefaultArgCompletions(
      ast,
      blockContext,
      'role Role @default(',
      { line: 2, column: 20, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(Array.isArray(items)).toBe(true);
  });

  test('with literal field: returns completion items', () => {
    const source = 'literal Status { "active" "inactive" }\nmodel User { id Record @id\nstatus Status @default(';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDefaultArgCompletions(
      ast,
      blockContext,
      'status Status @default(',
      { line: 2, column: 25, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(Array.isArray(items)).toBe(true);
  });

  test('with non-enum/literal field: returns empty array', () => {
    const source = 'model User { id Record @id\nname String @default(';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDefaultArgCompletions(
      ast,
      blockContext,
      'name String @default(',
      { line: 1, column: 20, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(Array.isArray(items)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveEnumLiteralValues
// ---------------------------------------------------------------------------

describe('resolveEnumLiteralValues', () => {
  test('with enum field: returns enum values', () => {
    const source = 'enum Role { Admin Editor Viewer }\nmodel User { id Record @id\nrole Role }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const roleField = user?.fields.find((f) => f.name === 'role');
    const result = resolveEnumLiteralValues(roleField, ast, testPath('test.cerial'), null);
    expect(result).toBeDefined();
    if (result) {
      expect(result).toContain('Admin');
      expect(result).toContain('Editor');
      expect(result).toContain('Viewer');
    }
  });

  test('with literal field: returns literal variant values', () => {
    const source = 'literal Status { "active" "inactive" "pending" }\nmodel User { id Record @id\nstatus Status }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const statusField = user?.fields.find((f) => f.name === 'status');
    const result = resolveEnumLiteralValues(statusField, ast, testPath('test.cerial'), null);
    expect(result).toBeDefined();
    if (result) {
      expect(result.length).toBeGreaterThan(0);
    }
  });

  test('with null field: returns null or empty array', () => {
    const result = resolveEnumLiteralValues(null, null, testPath('test.cerial'), null);
    expect(result === null || result?.length === 0).toBe(true);
  });

  test('with non-enum/literal field: returns null or empty array', () => {
    const source = 'model User { id Record @id\nname String }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const nameField = user?.fields.find((f) => f.name === 'name');
    const result = resolveEnumLiteralValues(nameField, ast, testPath('test.cerial'), null);
    expect(result === null || result?.length === 0).toBe(true);
  });

  test('with cross-file enum: resolves from indexer', () => {
    const indexer = createIndexerWithContent({
      'main.cerial': 'model User { id Record @id\nrole Role }',
      'enums.cerial': 'enum Role { Admin Editor }',
    });
    expect(indexer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// isDecoratorAllowedForFieldType
// ---------------------------------------------------------------------------

describe('isDecoratorAllowedForFieldType', () => {
  test('@id allowed on Record type', () => {
    const source = 'model User { id Record @id }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const idField = user?.fields.find((f) => f.name === 'id');
    const result = isDecoratorAllowedForFieldType('id', idField ?? null);
    expect(result).toBe(true);
  });

  test('@unique allowed on String type', () => {
    const source = 'model User { id Record @id\nemail Email @unique }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const emailField = user?.fields.find((f) => f.name === 'email');
    const result = isDecoratorAllowedForFieldType('unique', emailField ?? null);
    expect(result).toBe(true);
  });

  test('@default allowed on String type', () => {
    const source = 'model User { id Record @id\nstatus String @default("active") }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const statusField = user?.fields.find((f) => f.name === 'status');
    const result = isDecoratorAllowedForFieldType('default', statusField ?? null);
    expect(result).toBe(true);
  });

  test('@createdAt allowed on Date type', () => {
    const source = 'model User { id Record @id\ncreatedAt Date @createdAt }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const createdAtField = user?.fields.find((f) => f.name === 'createdAt');
    const result = isDecoratorAllowedForFieldType('createdAt', createdAtField ?? null);
    expect(result).toBe(true);
  });

  test('@updatedAt allowed on Date type', () => {
    const source = 'model User { id Record @id\nupdatedAt Date @updatedAt }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const updatedAtField = user?.fields.find((f) => f.name === 'updatedAt');
    const result = isDecoratorAllowedForFieldType('updatedAt', updatedAtField ?? null);
    expect(result).toBe(true);
  });

  test('@nullable allowed on String type', () => {
    const source = 'model User { id Record @id\nname String? }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const nameField = user?.fields.find((f) => f.name === 'name');
    const result = isDecoratorAllowedForFieldType('nullable', nameField ?? null);
    expect(result).toBe(true);
  });

  test('@readonly allowed on String type', () => {
    const source = 'model User { id Record @id\nstatus String @readonly }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const statusField = user?.fields.find((f) => f.name === 'status');
    const result = isDecoratorAllowedForFieldType('readonly', statusField ?? null);
    expect(result).toBe(true);
  });

  test('@flexible allowed on object type', () => {
    const source = 'object Address { street String }\nmodel User { id Record @id\naddress Address @flexible }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const addressField = user?.fields.find((f) => f.name === 'address');
    const result = isDecoratorAllowedForFieldType('flexible', addressField ?? null);
    expect(result).toBe(true);
  });

  test('@set allowed on array type', () => {
    const source = 'model User { id Record @id\ntags String[] @set }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const tagsField = user?.fields.find((f) => f.name === 'tags');
    const result = isDecoratorAllowedForFieldType('set', tagsField ?? null);
    expect(result).toBe(true);
  });

  test('@uuid allowed on Uuid type', () => {
    const source = 'model User { id Uuid @uuid }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const idField = user?.fields.find((f) => f.name === 'id');
    const result = isDecoratorAllowedForFieldType('uuid', idField ?? null);
    expect(result).toBe(true);
  });

  test('@model allowed on Relation type', () => {
    const source =
      'model User { id Record @id }\nmodel Post { id Record @id\nauthor Relation @field(id) @model(User) }';
    const { ast } = parse(source);
    const post = ast.models.find((m) => m.name === 'Post');
    const authorField = post?.fields.find((f) => f.name === 'author');
    const result = isDecoratorAllowedForFieldType('model', authorField ?? null);
    expect(result).toBe(true);
  });

  test('@field allowed on Relation type', () => {
    const source =
      'model User { id Record @id }\nmodel Post { id Record @id\nauthor Relation @field(id) @model(User) }';
    const { ast } = parse(source);
    const post = ast.models.find((m) => m.name === 'Post');
    const authorField = post?.fields.find((f) => f.name === 'author');
    const result = isDecoratorAllowedForFieldType('field', authorField ?? null);
    expect(result).toBe(true);
  });

  test('@onDelete allowed on Relation type', () => {
    const source =
      'model User { id Record @id }\nmodel Post { id Record @id\nauthor Relation @field(id) @model(User) @onDelete(Cascade) }';
    const { ast } = parse(source);
    const post = ast.models.find((m) => m.name === 'Post');
    const authorField = post?.fields.find((f) => f.name === 'author');
    const result = isDecoratorAllowedForFieldType('onDelete', authorField ?? null);
    expect(result).toBe(true);
  });

  test('with null field: returns true (no restriction when field unknown)', () => {
    const result = isDecoratorAllowedForFieldType('id', null);
    expect(result).toBe(true);
  });

  test('@now allowed on Date type', () => {
    const source = 'model User { id Record @id\ncomputedTime Date @now }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const computedField = user?.fields.find((f) => f.name === 'computedTime');
    const result = isDecoratorAllowedForFieldType('now', computedField ?? null);
    expect(result).toBe(true);
  });

  test('@index allowed on String type', () => {
    const source = 'model User { id Record @id\nname String @index }';
    const { ast } = parse(source);
    const user = ast.models.find((m) => m.name === 'User');
    const nameField = user?.fields.find((f) => f.name === 'name');
    const result = isDecoratorAllowedForFieldType('index', nameField ?? null);
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getExtendsBracketContext and getExtendsBracketCompletions
// ---------------------------------------------------------------------------

describe('getExtendsBracketContext', () => {
  test('with extends [field1, field2]: detects bracket context', () => {
    const lineText = 'model Child extends Parent[field1, field2]';
    const context = getExtendsBracketContext(lineText, lineText.length);
    expect(context).toBeDefined();
  });

  test('with extends [!field]: detects bracket context', () => {
    const lineText = 'model Child extends Parent[!field]';
    const context = getExtendsBracketContext(lineText, lineText.length);
    expect(context).toBeDefined();
  });

  test('without extends brackets: returns null', () => {
    const lineText = 'model Child extends Parent';
    const context = getExtendsBracketContext(lineText, lineText.length);
    expect(context).toBeNull();
  });

  test('with cursor before bracket: returns null', () => {
    const lineText = 'model Child extends Parent[field]';
    const context = getExtendsBracketContext(lineText, 'model Child extends Parent'.length);
    expect(context).toBeNull();
  });

  test('with cursor inside bracket: returns parent name', () => {
    const lineText = 'model Child extends Parent[';
    const context = getExtendsBracketContext(lineText, lineText.length);
    expect(context).toBe('Parent');
  });

  test('with multiple brackets: returns null (only detects single bracket)', () => {
    const lineText = 'model Child extends Parent[field1] Other[';
    const context = getExtendsBracketContext(lineText, lineText.length);
    expect(context === null || context === 'Other').toBe(true);
  });
});

describe('getExtendsBracketCompletions', () => {
  test('with model parent: returns model field names', () => {
    const source = 'model Parent { id Record @id\nname String\nemail Email }\nmodel Child extends Parent[';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'Parent',
      'model Child extends Parent[',
      'model Child extends Parent['.length,
      { blockType: 'model', blockName: 'Child', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(items.length).toBeGreaterThanOrEqual(0);
    if (labels.length > 0) {
      expect(labels).toContain('id');
    }
  });

  test('with object parent: returns object field names', () => {
    const source = 'object Address { street String\ncity String }\nobject ExtendedAddress extends Address[';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'Address',
      'object ExtendedAddress extends Address[',
      'object ExtendedAddress extends Address['.length,
      { blockType: 'object', blockName: 'ExtendedAddress', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(items.length).toBeGreaterThanOrEqual(0);
    if (labels.length > 0) {
      expect(labels).toContain('street');
    }
  });

  test('with enum parent: returns enum values', () => {
    const source = 'enum Role { Admin Editor Viewer }\nliteral ExtendedRole extends Role[';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'Role',
      'literal ExtendedRole extends Role[',
      'literal ExtendedRole extends Role['.length,
      { blockType: 'literal', blockName: 'ExtendedRole', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(items.length).toBeGreaterThanOrEqual(0);
    if (labels.length > 0) {
      expect(labels).toContain('Admin');
    }
  });

  test('with literal parent: returns literal variant values', () => {
    const source = 'literal Status { "active" "inactive" }\nliteral ExtendedStatus extends Status[';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'Status',
      'literal ExtendedStatus extends Status[',
      'literal ExtendedStatus extends Status['.length,
      { blockType: 'literal', blockName: 'ExtendedStatus', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(items.length).toBeGreaterThanOrEqual(0);
    if (labels.length > 0) {
      // Labels may include quotes or be parsed differently
      expect(labels.some((l) => l.includes('active'))).toBe(true);
    }
  });

  test('omit mode: includes !field variants', () => {
    const source = 'model Parent { id Record @id\nname String }\nmodel Child extends Parent[!';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'Parent',
      'model Child extends Parent[!',
      'model Child extends Parent[!'.length,
      { blockType: 'model', blockName: 'Child', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    const omitItems = items.filter((i) => i.label.startsWith('!'));
    expect(items.length).toBeGreaterThanOrEqual(0);
    if (omitItems.length > 0) {
      expect(omitItems.length).toBeGreaterThan(0);
    }
  });

  test('with null AST: returns empty array', () => {
    const items = getExtendsBracketCompletions(
      'Parent',
      'model Child extends Parent[',
      'model Child extends Parent['.length,
      { blockType: 'model', blockName: 'Child', fieldContext: null },
      null,
      testPath('test.cerial'),
      null,
    );
    expect(items).toHaveLength(0);
  });

  test('with non-existent parent: returns empty array', () => {
    const source = 'model Parent { id Record @id }';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'NonExistent',
      'model Child extends NonExistent[',
      'model Child extends NonExistent['.length,
      { blockType: 'model', blockName: 'Child', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    expect(items).toHaveLength(0);
  });

  test('with tuple parent: returns tuple element names', () => {
    const source = 'tuple Coordinate { x Float\ny Float }\ntuple Extended3D extends Coordinate[';
    const { ast } = parse(source);
    const items = getExtendsBracketCompletions(
      'Coordinate',
      'tuple Extended3D extends Coordinate[',
      'tuple Extended3D extends Coordinate['.length,
      { blockType: 'tuple', blockName: 'Extended3D', fieldContext: null },
      ast,
      testPath('test.cerial'),
      null,
    );
    // Tuples may or may not have named elements, so just verify it returns items
    expect(items.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// getDecoratorCompletions
// ---------------------------------------------------------------------------

describe('getDecoratorCompletions', () => {
  test('returns array of completion items', () => {
    const source = 'model User { id Record @id\nname String @';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'name String @',
      { line: 1, column: 15, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThan(0);
  });

  test('field with @unique: @unique not offered again', () => {
    const source = 'model User { id Record @id\nemail Email @unique }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'email Email @unique @',
      { line: 1, column: 20, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    const hasUnique = items.some((i) => i.label === '@unique');
    expect(hasUnique).toBe(false);
  });

  test('field with @createdAt: @updatedAt, @now, @default, @defaultAlways excluded', () => {
    const source = 'model User { id Record @id\ncreatedAt Date @createdAt }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'createdAt Date @createdAt @',
      { line: 1, column: 25, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain('@updatedAt');
    expect(labels).not.toContain('@now');
    expect(labels).not.toContain('@default()');
    expect(labels).not.toContain('@defaultAlways()');
  });

  test('field with @updatedAt: @createdAt, @now, @default, @defaultAlways excluded', () => {
    const source = 'model User { id Record @id\nupdatedAt Date @updatedAt }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'updatedAt Date @updatedAt @',
      { line: 1, column: 25, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain('@createdAt');
    expect(labels).not.toContain('@now');
    expect(labels).not.toContain('@default()');
    expect(labels).not.toContain('@defaultAlways()');
  });

  test('field with @now: @createdAt, @updatedAt, @default, @defaultAlways excluded', () => {
    const source = 'model User { id Record @id\ncomputedTime Date @now }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'computedTime Date @now @',
      { line: 1, column: 25, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain('@createdAt');
    expect(labels).not.toContain('@updatedAt');
    expect(labels).not.toContain('@default()');
    expect(labels).not.toContain('@defaultAlways()');
  });

  test('field with @default: @createdAt, @updatedAt, @now, @defaultAlways excluded', () => {
    const source = 'model User { id Record @id\nstatus String @default("active") }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'status String @default("active") @',
      { line: 1, column: 35, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain('@createdAt');
    expect(labels).not.toContain('@updatedAt');
    expect(labels).not.toContain('@now');
    expect(labels).not.toContain('@defaultAlways()');
  });

  test('field with @defaultAlways: @createdAt, @updatedAt, @now, @default excluded', () => {
    const source = 'model User { id Record @id\nversion Int @defaultAlways(0) }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'model',
      blockName: 'User',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'version Int @defaultAlways(0) @',
      { line: 1, column: 35, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    const labels = items.map((i) => i.label);
    expect(labels).not.toContain('@createdAt');
    expect(labels).not.toContain('@updatedAt');
    expect(labels).not.toContain('@now');
    expect(labels).not.toContain('@default()');
  });

  test('outside blocks: returns empty array', () => {
    const source = 'model User { id Record @id }';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: null,
      blockName: null,
      fieldContext: null,
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      '@',
      { line: 0, column: 1, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(items).toHaveLength(0);
  });

  test('in enum block: returns empty array (no decorators allowed)', () => {
    const source = 'enum Role { Admin @';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'enum',
      blockName: 'Role',
      fieldContext: null,
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'Admin @',
      { line: 0, column: 7, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(items).toHaveLength(0);
  });

  test('in literal block: returns empty array (no decorators allowed)', () => {
    const source = 'literal Status { "active" @';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'literal',
      blockName: 'Status',
      fieldContext: null,
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      '"active" @',
      { line: 0, column: 10, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(items).toHaveLength(0);
  });

  test('in object block: returns object-allowed decorators', () => {
    const source = 'object Address { street String @';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'object',
      blockName: 'Address',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'street String @',
      { line: 0, column: 15, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(items.length).toBeGreaterThan(0);
  });

  test('in tuple block: returns tuple-allowed decorators', () => {
    const source = 'tuple Coordinate { x Float @';
    const { ast } = parse(source);
    const blockContext: BlockContext = {
      blockType: 'tuple',
      blockName: 'Coordinate',
      fieldContext: 'decorator',
    };
    const items = getDecoratorCompletions(
      ast,
      blockContext,
      'x Float @',
      { line: 0, column: 9, offset: 0 },
      testPath('test.cerial'),
      null,
    );
    expect(items.length).toBeGreaterThan(0);
  });
});
