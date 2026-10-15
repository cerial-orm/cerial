/**
 * Unit Tests: Tuple Element Defaults on Create
 *
 * A fixed-length tuple literal refuses NONE in a position, so a tuple element's
 * @createdAt / @updatedAt is written into the array literal as time::now(). That is
 * query text, so a create carrying one switches from CONTENT to SET syntax.
 */

import { describe, expect, test } from 'bun:test';
import { buildCreateQuery } from '../../../src/query/builders/insert-builder';
import { transformData } from '../../../src/query/transformers/data-transformer';
import type { FieldMetadata, ModelMetadata, TupleElementMetadata, TupleFieldMetadata } from '../../../src/types';

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

function elem(
  overrides: Partial<TupleElementMetadata> & { index: number; type: TupleElementMetadata['type'] },
): TupleElementMetadata {
  return {
    isOptional: false,
    ...overrides,
  };
}

function tupleInfo(tupleName: string, elements: TupleElementMetadata[]): TupleFieldMetadata {
  return { tupleName, elements };
}

// [label, born @createdAt, touched @updatedAt, hits @defaultAlways(7), tag @default('x')]
const stampInfo = tupleInfo('Stamped', [
  elem({ index: 0, type: 'string', name: 'label' }),
  elem({ index: 1, type: 'date', name: 'born', timestampDecorator: 'createdAt' }),
  elem({ index: 2, type: 'date', name: 'touched', timestampDecorator: 'updatedAt' }),
  elem({ index: 3, type: 'int', name: 'hits', defaultAlwaysValue: 7 }),
  elem({ index: 4, type: 'string', name: 'tag', defaultValue: 'x' }),
]);

const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

const stampModel: ModelMetadata = {
  name: 'Stamped',
  tableName: 'stamped',
  fields: [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'name', type: 'string', isRequired: true }),
    field({ name: 'stamp', type: 'tuple', isRequired: true, tupleInfo: stampInfo }),
  ],
};

const plainModel: ModelMetadata = {
  name: 'Plain',
  tableName: 'plain',
  fields: [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
  ],
};

describe('Tuple Element Defaults — create', () => {
  test('should write time::now() into the array literal for an omitted timestamp position', () => {
    const data = transformData({ name: 'Alice', stamp: ['a'] }, stampModel);
    const result = buildCreateQuery(stampModel, data);

    expect(result.text).toContain(
      'stamp = [$stamp_0_create_1, time::now(), time::now(), $stamp_3_create_2, $stamp_4_create_3]',
    );
    expect(result.vars.stamp_0_create_1).toBe('a');
    expect(result.vars.stamp_3_create_2).toBe(7);
    expect(result.vars.stamp_4_create_3).toBe('x');
  });

  test('should bind every supplied position and emit no expression', () => {
    const born = new Date('2020-01-01T00:00:00Z');
    const touched = new Date('2021-01-01T00:00:00Z');
    const data = transformData({ name: 'Alice', stamp: ['a', born, touched, 99, 'own'] }, stampModel);
    const result = buildCreateQuery(stampModel, data);

    expect(result.text).toContain('CONTENT');
    expect(result.text).not.toContain('time::now()');
    expect(Object.values(result.vars)[0]).toMatchObject({ stamp: ['a', born, touched, 99, 'own'] });
  });

  test('should keep CONTENT syntax for a model with no decorated tuple element', () => {
    const data = transformData({ location: [1.5, 2.5] }, plainModel);
    const result = buildCreateQuery(plainModel, data);

    expect(result.text).toContain('CONTENT');
    expect(result.text).not.toContain('SET');
  });

  test('should keep the caller out of the expression position', () => {
    // The only text that is not a bound parameter is the module's own time::now()
    const data = transformData({ name: 'time::now()', stamp: ["');DROP"] }, stampModel);
    const result = buildCreateQuery(stampModel, data);

    expect(result.text).toContain('name = $name_create_0');
    expect(result.vars.name_create_0).toBe('time::now()');
    expect(result.vars.stamp_0_create_1).toBe("');DROP");
    expect(result.text).not.toContain("');DROP");
  });
});
