/**
 * Unit tests for {Model}Unset and {Tuple}Unset type generation
 */

import { describe, expect, test } from 'bun:test';
import { generateUnsetType } from '../../../src/generators/types/derived-generator';
import {
  generateTupleUnsetType,
  tupleHasUnsetableElements,
} from '../../../src/generators/types/tuples/unset-generator';
import type {
  FieldMetadata,
  ModelMetadata,
  TupleElementMetadata,
  TupleFieldMetadata,
  TupleMetadata,
} from '../../../src/types';

function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function mdl(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

function elem(overrides: Partial<TupleElementMetadata> & { index: number; type: string }): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  } as TupleElementMetadata;
}

function tupleInfo(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

function tupleMeta(name: string, elements: TupleElementMetadata[]): TupleMetadata {
  return { name, elements };
}

// ============================================================================
// Model Unset Type
// ============================================================================

describe('generateUnsetType', () => {
  test('empty for model with only required primitives', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'name', type: 'string' }),
      field({ name: 'email', type: 'email' }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('UserUnset = {');
    expect(result).not.toContain('name');
    expect(result).not.toContain('email');
    expect(result).not.toContain('id');
  });

  test('includes optional primitive fields as true', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'bio', type: 'string', isRequired: false }),
      field({ name: 'age', type: 'int', isRequired: false }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('bio?: true;');
    expect(result).toContain('age?: true;');
  });

  test('skips id field', () => {
    const m = mdl('User', [field({ name: 'id', type: 'record', isId: true, isRequired: false })]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('id');
  });

  test('skips relation fields', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({
        name: 'posts',
        type: 'relation',
        isRequired: false,
        relationInfo: { targetModel: 'Post', targetTable: 'post', isReverse: true },
      }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('posts');
  });

  test('skips readonly fields', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'code', type: 'string', isRequired: false, isReadonly: true }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('code');
  });

  test('skips @now (computed) fields', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'now', type: 'date', timestampDecorator: 'now', isRequired: false }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('now');
  });

  test('optional array field produces true', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'tags', type: 'string', isArray: true, isRequired: false }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('tags?: true;');
  });

  test('required array field is skipped', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'tags', type: 'string', isArray: true }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('tags');
  });

  // --- Object fields ---

  test('optional object with optional children produces true | { ... }', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: false,
        objectInfo: {
          objectName: 'Address',
          fields: [field({ name: 'city', type: 'string' }), field({ name: 'zip', type: 'string', isRequired: false })],
        },
      }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('address?: true |');
    expect(result).toContain('zip?: true;');
  });

  test('optional object without optional children produces only true', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: false,
        objectInfo: {
          objectName: 'Address',
          fields: [field({ name: 'city', type: 'string' }), field({ name: 'state', type: 'string' })],
        },
      }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('address?: true;');
    expect(result).not.toContain('city');
  });

  test('required object with optional children produces { ... } only (no true)', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: true,
        objectInfo: {
          objectName: 'Address',
          fields: [field({ name: 'city', type: 'string' }), field({ name: 'zip', type: 'string', isRequired: false })],
        },
      }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('address?:');
    expect(result).toContain('zip?: true;');
    expect(result).not.toMatch(/address\?: true[;|]/);
  });

  test('required object without optional children is skipped', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: true,
        objectInfo: {
          objectName: 'Address',
          fields: [field({ name: 'city', type: 'string' })],
        },
      }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('address');
  });

  // --- Tuple fields ---

  test('optional tuple with optional elements produces true | TupleUnset', () => {
    const info = tupleInfo('Coordinate', [
      elem({ index: 0, type: 'float', name: 'lat' }),
      elem({ index: 1, type: 'float', name: 'lng' }),
      elem({ index: 2, type: 'float', name: 'altitude', isOptional: true }),
    ]);
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'position', type: 'tuple', isRequired: false, tupleInfo: info }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('position?: true | CoordinateUnset;');
  });

  test('optional tuple without optional elements produces only true', () => {
    const info = tupleInfo('Point', [
      elem({ index: 0, type: 'float', name: 'x' }),
      elem({ index: 1, type: 'float', name: 'y' }),
    ]);
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'point', type: 'tuple', isRequired: false, tupleInfo: info }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('point?: true;');
  });

  test('required tuple with optional elements produces TupleUnset only', () => {
    const info = tupleInfo('Coordinate', [
      elem({ index: 0, type: 'float', name: 'lat' }),
      elem({ index: 1, type: 'float', name: 'lng' }),
      elem({ index: 2, type: 'float', name: 'altitude', isOptional: true }),
    ]);
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'coords', type: 'tuple', isRequired: true, tupleInfo: info }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('coords?: CoordinateUnset;');
    expect(result).not.toMatch(/coords\?: true/);
  });

  test('required tuple without optional elements is skipped', () => {
    const info = tupleInfo('Point', [
      elem({ index: 0, type: 'float', name: 'x' }),
      elem({ index: 1, type: 'float', name: 'y' }),
    ]);
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'point', type: 'tuple', isRequired: true, tupleInfo: info }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('point');
  });
  // --- Edge cases ---

  test('optional nullable field produces true', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'bio', type: 'string', isRequired: false, isNullable: true }),
    ]);
    const result = generateUnsetType(m);

    expect(result).toContain('bio?: true;');
  });

  test('required nullable field is skipped (cannot be unset)', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'deletedAt', type: 'date', isRequired: true, isNullable: true }),
    ]);
    const result = generateUnsetType(m);

    expect(result).not.toContain('deletedAt');
  });

  test('mixed model with object, tuple, primitive, relation, and array', () => {
    const info = tupleInfo('Coord', [
      elem({ index: 0, type: 'float', name: 'lat' }),
      elem({ index: 1, type: 'float', name: 'lng', isOptional: true }),
    ]);
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({ name: 'name', type: 'string' }),
      field({ name: 'bio', type: 'string', isRequired: false }),
      field({ name: 'tags', type: 'string', isArray: true }),
      field({
        name: 'address',
        type: 'object',
        isRequired: false,
        objectInfo: {
          objectName: 'Address',
          fields: [field({ name: 'zip', type: 'string', isRequired: false })],
        },
      }),
      field({ name: 'location', type: 'tuple', isRequired: false, tupleInfo: info }),
      field({
        name: 'posts',
        type: 'relation',
        isRequired: false,
        relationInfo: { targetModel: 'Post', targetTable: 'post', isReverse: true },
      }),
    ]);
    const result = generateUnsetType(m);

    // Optional primitive — included
    expect(result).toContain('bio?: true;');
    // Required primitive — excluded
    expect(result).not.toMatch(/\bname\b/);
    // Required array — excluded
    expect(result).not.toMatch(/\btags\b/);
    // Optional object with optional children — true | { ... }
    expect(result).toContain('address?: true |');
    expect(result).toContain('zip?: true;');
    // Optional tuple with optional elements — true | TupleUnset
    expect(result).toContain('location?: true | CoordUnset;');
    // Relation — excluded
    expect(result).not.toMatch(/\bposts\b/);
  });

  test('3-level deep nested object only includes optional sub-fields', () => {
    const m = mdl('User', [
      field({ name: 'id', type: 'record', isId: true }),
      field({
        name: 'profile',
        type: 'object',
        isRequired: true,
        objectInfo: {
          objectName: 'Profile',
          fields: [
            field({
              name: 'settings',
              type: 'object',
              isRequired: true,
              objectInfo: {
                objectName: 'Settings',
                fields: [
                  field({ name: 'theme', type: 'string' }),
                  field({ name: 'language', type: 'string', isRequired: false }),
                ],
              },
            }),
          ],
        },
      }),
    ]);
    const result = generateUnsetType(m);

    // Required parent, required child, optional grandchild
    expect(result).toContain('profile?:');
    expect(result).toContain('settings?:');
    expect(result).toContain('language?: true;');
    // Required grandchild — excluded
    expect(result).not.toContain('theme');
  });
});

// ============================================================================
// Tuple Unset Type
// ============================================================================

describe('generateTupleUnsetType', () => {
  test('generates both index and name keys for optional elements', () => {
    const t = tupleMeta('Coordinate', [
      elem({ index: 0, type: 'float', name: 'lat' }),
      elem({ index: 1, type: 'float', name: 'lng' }),
      elem({ index: 2, type: 'float', name: 'altitude', isOptional: true }),
    ]);
    const result = generateTupleUnsetType(t);

    expect(result).toContain('2?: true;');
    expect(result).toContain('altitude?: true;');
    expect(result).not.toContain('0?');
    expect(result).not.toContain('lat?');
    expect(result).not.toContain('1?');
    expect(result).not.toContain('lng?');
  });

  test('returns empty string for tuple with no optional elements', () => {
    const t = tupleMeta('Point', [
      elem({ index: 0, type: 'float', name: 'x' }),
      elem({ index: 1, type: 'float', name: 'y' }),
    ]);
    const result = generateTupleUnsetType(t);

    expect(result).toBe('');
  });

  test('optional object element with optional children produces true | { ... }', () => {
    const t = tupleMeta('MetaCoord', [
      elem({ index: 0, type: 'float', name: 'lat' }),
      elem({
        index: 1,
        type: 'object',
        name: 'meta',
        isOptional: true,
        objectInfo: {
          objectName: 'MetaData',
          fields: [field({ name: 'label', type: 'string', isRequired: false })],
        },
      }),
    ]);
    const result = generateTupleUnsetType(t);

    expect(result).toContain('1?: true |');
    expect(result).toContain('meta?: true |');
    expect(result).toContain('label?: true;');
  });

  test('required object element with optional children produces { ... } only', () => {
    const t = tupleMeta('MetaCoord', [
      elem({ index: 0, type: 'float', name: 'lat' }),
      elem({
        index: 1,
        type: 'object',
        name: 'meta',
        isOptional: false,
        objectInfo: {
          objectName: 'MetaData',
          fields: [field({ name: 'label', type: 'string', isRequired: false })],
        },
      }),
    ]);
    const result = generateTupleUnsetType(t);

    // Should have sub-field structure but NOT true
    expect(result).toContain('label?: true;');
    expect(result).not.toMatch(/1\?: true[;|]/);
  });

  test('optional nested tuple element with optional inner elements produces true | TupleUnset', () => {
    const innerInfo = tupleInfo('Inner', [
      elem({ index: 0, type: 'float' }),
      elem({ index: 1, type: 'float', isOptional: true }),
    ]);
    const t = tupleMeta('Outer', [
      elem({ index: 0, type: 'float' }),
      elem({
        index: 1,
        type: 'tuple',
        name: 'inner',
        isOptional: true,
        tupleInfo: innerInfo,
      }),
    ]);
    const result = generateTupleUnsetType(t);

    expect(result).toContain('1?: true | InnerUnset;');
    expect(result).toContain('inner?: true | InnerUnset;');
  });

  test('unnamed elements only get index key', () => {
    const t = tupleMeta('Pair', [
      elem({ index: 0, type: 'float' }),
      elem({ index: 1, type: 'float', isOptional: true }),
    ]);
    const result = generateTupleUnsetType(t);

    expect(result).toContain('1?: true;');
    // No named key since elements have no name
    const lines = result.split('\n').filter((l) => l.includes('?'));
    expect(lines).toHaveLength(1);
  });
});

// ============================================================================
// tupleHasUnsetableElements
// ============================================================================

describe('tupleHasUnsetableElements', () => {
  test('returns true for tuple with optional element', () => {
    const t = tupleMeta('Coord', [
      elem({ index: 0, type: 'float' }),
      elem({ index: 1, type: 'float', isOptional: true }),
    ]);

    expect(tupleHasUnsetableElements(t)).toBe(true);
  });

  test('returns false for tuple with no optional elements', () => {
    const t = tupleMeta('Point', [elem({ index: 0, type: 'float' }), elem({ index: 1, type: 'float' })]);

    expect(tupleHasUnsetableElements(t)).toBe(false);
  });

  test('returns true for required object element with optional children', () => {
    const t = tupleMeta('MetaCoord', [
      elem({ index: 0, type: 'float' }),
      elem({
        index: 1,
        type: 'object',
        isOptional: false,
        objectInfo: {
          objectName: 'Meta',
          fields: [field({ name: 'label', type: 'string', isRequired: false })],
        },
      }),
    ]);

    expect(tupleHasUnsetableElements(t)).toBe(true);
  });
});
