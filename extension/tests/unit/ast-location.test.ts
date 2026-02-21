import { describe, expect, test } from 'bun:test';
import {
  findFieldByName,
  findNodeAtPosition,
  findTypeDefinition,
  getBlockContext,
  getWordRangeAtPosition,
  isInsideBlock,
} from '../../server/src/utils/ast-location';
import { parseFixture } from './helpers';

describe('findNodeAtPosition', () => {
  const ast = parseFixture('simple-model.cerial');

  test('returns model node when position is on model header', () => {
    // "model User {" is on line 3 (1-indexed)
    const node = findNodeAtPosition(ast, { line: 3, column: 6, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('model');
    expect(node!.name).toBe('User');
  });

  test('returns field node when position is on a field line', () => {
    // "  email Email @unique" is line 5 (1-indexed)
    const node = findNodeAtPosition(ast, { line: 5, column: 2, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('field');
    expect(node!.name).toBe('email');
  });

  test('returns decorator node when position is on a decorator', () => {
    // "@unique" on field line 5, column is in decorator range
    const node = findNodeAtPosition(ast, { line: 5, column: 16, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('decorator');
    expect(node!.name).toBe('unique');
    expect(node!.parent).toBeDefined();
    expect(node!.parent!.kind).toBe('field');
  });

  test('returns null for position outside all blocks', () => {
    // Line 1 is a comment, outside any block
    const node = findNodeAtPosition(ast, { line: 1, column: 0, offset: 0 });

    expect(node).toBeNull();
  });

  test('returns null for empty AST', () => {
    const emptyAST = { models: [], objects: [], tuples: [], literals: [], enums: [], source: '' };
    const node = findNodeAtPosition(emptyAST, { line: 1, column: 0, offset: 0 });

    expect(node).toBeNull();
  });

  test('finds object block in complex types', () => {
    const complexAST = parseFixture('complex-types.cerial');
    // "object Address {" is on line 3
    const node = findNodeAtPosition(complexAST, { line: 3, column: 7, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('object');
    expect(node!.name).toBe('Address');
  });

  test('finds enum block', () => {
    const complexAST = parseFixture('complex-types.cerial');
    // "enum Status { ACTIVE, INACTIVE, PENDING, ARCHIVED }" is on line 32 (single-line, range end column is 0)
    const node = findNodeAtPosition(complexAST, { line: 32, column: 0, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('enum');
    expect(node!.name).toBe('Status');
  });

  test('finds literal block', () => {
    const complexAST = parseFixture('complex-types.cerial');
    // "literal Severity { 1, 2, 3, 4, 5 }" is on line 36 (single-line, range end column is 0)
    const node = findNodeAtPosition(complexAST, { line: 36, column: 0, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('literal');
    expect(node!.name).toBe('Severity');
  });

  test('finds tuple block', () => {
    const complexAST = parseFixture('complex-types.cerial');
    // "tuple Point3D {" is on line 15
    const node = findNodeAtPosition(complexAST, { line: 15, column: 6, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.kind).toBe('tuple');
    expect(node!.name).toBe('Point3D');
  });

  test('field parent references containing block', () => {
    const node = findNodeAtPosition(ast, { line: 5, column: 2, offset: 0 });

    expect(node).not.toBeNull();
    expect(node!.parent).toBeDefined();
    expect(node!.parent!.kind).toBe('model');
    expect(node!.parent!.name).toBe('User');
  });
});

describe('findFieldByName', () => {
  const ast = parseFixture('simple-model.cerial');

  test('finds field in model', () => {
    const field = findFieldByName(ast, 'User', 'email');

    expect(field).not.toBeNull();
    expect(field!.name).toBe('email');
    expect(field!.type).toBe('email');
  });

  test('finds optional field', () => {
    const field = findFieldByName(ast, 'User', 'age');

    expect(field).not.toBeNull();
    expect(field!.isOptional).toBe(true);
  });

  test('returns null for missing field', () => {
    const field = findFieldByName(ast, 'User', 'nonexistent');

    expect(field).toBeNull();
  });

  test('returns null for missing block', () => {
    const field = findFieldByName(ast, 'NonExistentModel', 'email');

    expect(field).toBeNull();
  });

  test('finds field in object', () => {
    const complexAST = parseFixture('complex-types.cerial');
    const field = findFieldByName(complexAST, 'Address', 'street');

    expect(field).not.toBeNull();
    expect(field!.name).toBe('street');
    expect(field!.type).toBe('string');
  });

  test('does not find fields in wrong block', () => {
    const field = findFieldByName(ast, 'Article', 'email');

    expect(field).toBeNull();
  });
});

describe('findTypeDefinition', () => {
  const ast = parseFixture('complex-types.cerial');

  test('finds model definition', () => {
    const result = findTypeDefinition(ast, 'Profile');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('model');
  });

  test('finds object definition', () => {
    const result = findTypeDefinition(ast, 'Address');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('object');
    expect(result!.range.start.line).toBeGreaterThan(0);
  });

  test('finds tuple definition', () => {
    const result = findTypeDefinition(ast, 'Point3D');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('tuple');
  });

  test('finds enum definition', () => {
    const result = findTypeDefinition(ast, 'Status');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('enum');
  });

  test('finds literal definition', () => {
    const result = findTypeDefinition(ast, 'Severity');

    expect(result).not.toBeNull();
    expect(result!.kind).toBe('literal');
  });

  test('returns null for missing type', () => {
    const result = findTypeDefinition(ast, 'NonExistent');

    expect(result).toBeNull();
  });

  test('returns null for primitive type name', () => {
    const result = findTypeDefinition(ast, 'String');

    expect(result).toBeNull();
  });
});

describe('getWordRangeAtPosition', () => {
  test('extracts word at cursor', () => {
    const source = 'model User {';
    const result = getWordRangeAtPosition(source, 6); // 'U' in 'User'

    expect(result).not.toBeNull();
    expect(result!.word).toBe('User');
    expect(result!.start).toBe(6);
    expect(result!.end).toBe(10);
  });

  test('extracts keyword', () => {
    const source = 'model User {';
    const result = getWordRangeAtPosition(source, 0); // 'm' in 'model'

    expect(result).not.toBeNull();
    expect(result!.word).toBe('model');
  });

  test('returns null on whitespace', () => {
    const source = 'model User {';
    const result = getWordRangeAtPosition(source, 5); // space between 'model' and 'User'

    expect(result).toBeNull();
  });

  test('returns null on punctuation', () => {
    const source = 'model User {';
    const result = getWordRangeAtPosition(source, 11); // '{'

    expect(result).toBeNull();
  });

  test('returns null for out of bounds offset', () => {
    const source = 'model User {';

    expect(getWordRangeAtPosition(source, -1)).toBeNull();
    expect(getWordRangeAtPosition(source, 100)).toBeNull();
  });

  test('includes @ in decorator words', () => {
    const source = '  name String @unique';
    const result = getWordRangeAtPosition(source, 14); // '@' in '@unique'

    expect(result).not.toBeNull();
    expect(result!.word).toBe('@unique');
  });

  test('includes ! in private marker', () => {
    const source = '  id Record @id !!private';
    const result = getWordRangeAtPosition(source, 16); // '!' in '!!private'

    expect(result).not.toBeNull();
    expect(result!.word).toBe('!!private');
  });

  test('extracts word at start of line', () => {
    const source = 'name String';
    const result = getWordRangeAtPosition(source, 0);

    expect(result).not.toBeNull();
    expect(result!.word).toBe('name');
    expect(result!.start).toBe(0);
  });

  test('extracts word at end of line', () => {
    const source = 'name String';
    const result = getWordRangeAtPosition(source, 5); // 'S' in 'String'

    expect(result).not.toBeNull();
    expect(result!.word).toBe('String');
    expect(result!.end).toBe(11);
  });
});

describe('isInsideBlock', () => {
  const ast = parseFixture('simple-model.cerial');

  test('returns true inside model body', () => {
    // Line 5 is inside the User model
    const result = isInsideBlock(ast, { line: 5, column: 2, offset: 0 });

    expect(result).toBe(true);
  });

  test('returns false outside blocks', () => {
    // Line 1 is a comment outside any block
    const result = isInsideBlock(ast, { line: 1, column: 0, offset: 0 });

    expect(result).toBe(false);
  });

  test('returns true on block start line', () => {
    // Line 3 is "model User {" — the opening of the block
    const result = isInsideBlock(ast, { line: 3, column: 0, offset: 0 });

    expect(result).toBe(true);
  });

  test('returns false on line between blocks', () => {
    // Line 16 is blank between User and Article
    const result = isInsideBlock(ast, { line: 16, column: 0, offset: 0 });

    expect(result).toBe(false);
  });
});

describe('getBlockContext', () => {
  const ast = parseFixture('simple-model.cerial');

  test('outside blocks returns null context', () => {
    const ctx = getBlockContext(ast, { line: 1, column: 0, offset: 0 });

    expect(ctx.blockType).toBeNull();
    expect(ctx.blockName).toBeNull();
    expect(ctx.fieldContext).toBeNull();
  });

  test('inside model returns model context', () => {
    // Inside User model but not on a specific field
    const ctx = getBlockContext(ast, { line: 3, column: 0, offset: 0 });

    expect(ctx.blockType).toBe('model');
    expect(ctx.blockName).toBe('User');
  });

  test('on field type position returns type fieldContext', () => {
    // "  email Email @unique" — column in 'Email' range
    const node = findNodeAtPosition(ast, { line: 5, column: 8, offset: 0 });

    expect(node).not.toBeNull();
    // On the 'Email' part of the field line
    const ctx = getBlockContext(ast, { line: 5, column: 8, offset: 0 });

    expect(ctx.fieldContext).toBe('type');
  });

  test('on field name position returns name fieldContext', () => {
    // "  email Email @unique" — column at start of field name
    const ctx = getBlockContext(ast, { line: 5, column: 2, offset: 0 });

    expect(ctx.fieldContext).toBe('name');
    expect(ctx.blockType).toBe('model');
    expect(ctx.blockName).toBe('User');
  });

  test('on decorator returns decorator fieldContext', () => {
    // "  email Email @unique" — column on @unique
    const ctx = getBlockContext(ast, { line: 5, column: 16, offset: 0 });

    expect(ctx.fieldContext).toBe('decorator');
  });

  test('inside object returns object context', () => {
    const complexAST = parseFixture('complex-types.cerial');
    const ctx = getBlockContext(complexAST, { line: 4, column: 2, offset: 0 });

    expect(ctx.blockType).toBe('object');
    expect(ctx.blockName).toBe('Address');
  });
});
