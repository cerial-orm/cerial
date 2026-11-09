/**
 * Unit Tests: tuple and literal member validation
 *
 * SurrealDB 4.0 converts a whole float to an int in an int member, an int to a float in a float
 * member, and refuses a fractional float in an int member, a wrong member type and an undeclared
 * key in an inline object. The validator agrees before the query is sent. JS cannot tell 1.0 from
 * 1, so a whole number is always accepted.
 */

import { describe, expect, test } from 'bun:test';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';
import type {
  FieldMetadata,
  ModelMetadata,
  ObjectFieldMetadata,
  TupleElementMetadata,
  TupleFieldMetadata,
} from '../../../src/types';

const el = (o: Partial<TupleElementMetadata> & Pick<TupleElementMetadata, 'index' | 'type'>): TupleElementMetadata => ({
  isOptional: false,
  ...o,
});
const sub = (o: Partial<FieldMetadata> & Pick<FieldMetadata, 'name' | 'type'>): FieldMetadata => ({
  isId: false,
  isUnique: false,
  isRequired: true,
  ...o,
});

const place: ObjectFieldMetadata = {
  objectName: 'Place',
  fields: [sub({ name: 'street', type: 'string' }), sub({ name: 'floor', type: 'int' })],
};
const profile: ObjectFieldMetadata = {
  objectName: 'Profile',
  fields: [
    sub({ name: 'bio', type: 'string' }),
    sub({
      name: 'meta',
      type: 'object',
      isFlexible: true,
      objectInfo: { objectName: 'Meta', fields: [sub({ name: 'label', type: 'string' })] },
    }),
  ],
};
const pair: TupleFieldMetadata = {
  tupleName: 'Pair',
  elements: [el({ index: 0, type: 'int' }), el({ index: 1, type: 'float' })],
};
const located: TupleFieldMetadata = {
  tupleName: 'Located',
  elements: [el({ index: 0, type: 'string' }), el({ index: 1, type: 'object', objectInfo: place })],
};
const profiled: TupleFieldMetadata = {
  tupleName: 'Profiled',
  elements: [el({ index: 0, type: 'string' }), el({ index: 1, type: 'object', objectInfo: profile })],
};

const model: ModelMetadata = {
  name: 'Item',
  tableName: 'item',
  fields: [
    sub({ name: 'id', type: 'record', isId: true, isRequired: false }),
    sub({ name: 'pair', type: 'tuple', tupleInfo: pair }),
    sub({ name: 'located', type: 'tuple', tupleInfo: located, isRequired: false }),
    sub({ name: 'profiled', type: 'tuple', tupleInfo: profiled, isRequired: false }),
    sub({ name: 'pairs', type: 'tuple', tupleInfo: pair, isArray: true, isRequired: false }),
    sub({
      name: 'nullPair',
      type: 'tuple',
      isRequired: false,
      tupleInfo: {
        tupleName: 'NullPair',
        elements: [el({ index: 0, type: 'string' }), el({ index: 1, type: 'float', isNullable: true })],
      },
    }),
    sub({
      name: 'shape',
      type: 'literal',
      isRequired: false,
      literalInfo: {
        literalName: 'Shape',
        isEnum: false,
        variants: [
          { kind: 'string', value: 'none' },
          { kind: 'objectRef', objectName: 'Place', objectInfo: place },
          { kind: 'tupleRef', tupleName: 'Pair', tupleInfo: pair },
        ],
      },
    }),
  ],
};

const base = { pair: [1, 2] };
const errors = (data: Record<string, unknown>): string[] =>
  validateCreateData({ ...base, ...data }, model).errors.map((e) => e.message);

describe('tuple primitive members', () => {
  test('accepts the declared member types', () => {
    expect(errors({})).toEqual([]);
  });

  test('accepts an integral number in a float member and in an int member', () => {
    expect(errors({ pair: [1.0, 2] })).toEqual([]);
    expect(errors({ pair: [3, 4.0] })).toEqual([]);
  });

  test('accepts a fractional number in a float member', () => {
    expect(errors({ pair: [1, 2.5] })).toEqual([]);
  });

  test('refuses a fractional number in an int member', () => {
    expect(errors({ pair: [1.5, 2] })).toEqual(['pair[0] must be of type int']);
  });

  test('refuses a string in a float member and a number in a string member', () => {
    expect(errors({ pair: [1, 'a'] })).toEqual(['pair[1] must be of type float']);
    expect(errors({ located: [5, { street: 's', floor: 1 }] })).toEqual(['located[0] must be of type string']);
  });

  test('refuses a wrong member in object form and in an array of tuples', () => {
    expect(errors({ pair: { '0': 1.5, '1': 2 } })).toEqual(['pair.0 must be of type int']);
    expect(
      errors({
        pairs: [
          [1, 2],
          [1.5, 2],
        ],
      }),
    ).toEqual(['pairs[1][0] must be of type int']);
  });

  test('null is accepted only in a nullable member', () => {
    expect(errors({ nullPair: ['a', null] })).toEqual([]);
    expect(errors({ nullPair: [null, 1] })).toHaveLength(1);
    expect(errors({ pair: [1, null] })).toHaveLength(1);
  });

  test('update refuses the same members and accepts the same values', () => {
    expect(validateUpdateData({ pair: [1.5, 2] }, model).valid).toBe(false);
    expect(validateUpdateData({ pair: [1, 2.5] }, model).valid).toBe(true);
    expect(validateUpdateData({ pair: { '0': 1.5 } }, model).valid).toBe(false);
    expect(validateUpdateData({ pair: { '1': 2.5 } }, model).valid).toBe(true);
  });
});

describe('object members of a tuple', () => {
  test('accepts a declared object element', () => {
    expect(errors({ located: ['a', { street: 's', floor: 2 }] })).toEqual([]);
  });

  test('refuses an undeclared key in a strict object element, in both forms', () => {
    expect(errors({ located: ['a', { street: 's', floor: 2, extra: 1 }] })).toHaveLength(1);
    expect(errors({ located: { '0': 'a', '1': { street: 's', floor: 2, extra: 1 } } })).toHaveLength(1);
    expect(errors({ located: ['a', { street: 's', floor: 2, extra: 1 }] })[0]).toContain('located[1].extra');
  });

  test('refuses a wrong member type inside an object element', () => {
    expect(errors({ located: ['a', { street: 's', floor: 1.5 }] })).toEqual(['located[1].floor must be of type int']);
  });

  test('accepts undeclared keys in a flexible field of an object element and still checks its declared keys', () => {
    expect(errors({ profiled: ['a', { bio: 'b', meta: { label: 'l', anything: 1 } }] })).toEqual([]);
    expect(errors({ profiled: ['a', { bio: 'b', meta: { label: 5, anything: 1 } }] })).toEqual([
      'profiled[1].meta.label must be of type string',
    ]);
  });

  test('refuses an undeclared key beside a flexible field', () => {
    expect(errors({ profiled: ['a', { bio: 'b', meta: { label: 'l' }, extra: 1 }] })).toHaveLength(1);
  });

  test('a strict object outside a tuple refuses undeclared keys on create', () => {
    const plain: ModelMetadata = {
      ...model,
      fields: [sub({ name: 'where', type: 'object', objectInfo: place })],
    };
    const result = validateCreateData({ where: { street: 's', floor: 1, extra: 1 } }, plain);
    expect(result.errors.map((e) => e.field)).toEqual(['where.extra']);
  });
});

describe('literal object and tuple variants', () => {
  test('accepts a string variant, a declared object and a declared tuple', () => {
    expect(errors({ shape: 'none' })).toEqual([]);
    expect(errors({ shape: { street: 's', floor: 1 } })).toEqual([]);
    expect(errors({ shape: [1, 2.5] })).toEqual([]);
  });

  test('refuses an object with an undeclared key or a wrong member type', () => {
    expect(errors({ shape: { street: 's', floor: 1, extra: 1 } })).toHaveLength(1);
    expect(errors({ shape: { street: 's', floor: 1.5 } })).toHaveLength(1);
  });

  test('refuses a tuple with a fractional number in an int member', () => {
    expect(errors({ shape: [1.5, 2] })).toHaveLength(1);
  });
});
