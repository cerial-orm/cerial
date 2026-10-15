/**
 * Unit Tests: Tuple Update Builder
 *
 * Tests UPDATE SET clause building for tuple fields, including
 * null→NONE conversion, full replace, and array operations.
 */

import { describe, expect, test } from 'bun:test';
import { buildUpdateManyQuery } from '../../../src/query/builders/update-builder';
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

const coordInfo = tupleInfo('Coordinate', [
  elem({ index: 0, type: 'float', name: 'lat' }),
  elem({ index: 1, type: 'float', name: 'lng' }),
]);

const entryInfo = tupleInfo('Entry', [
  elem({ index: 0, type: 'string', name: 'label' }),
  elem({ index: 1, type: 'int' }),
  elem({ index: 2, type: 'bool' }),
]);

const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    field({ name: 'id', type: 'record', isId: true }),
    field({ name: 'name', type: 'string', isRequired: true }),
    field({ name: 'location', type: 'tuple', isRequired: true, tupleInfo: coordInfo }),
    field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordInfo }),
    field({ name: 'history', type: 'tuple', isRequired: true, isArray: true, tupleInfo: coordInfo }),
    field({ name: 'entry', type: 'tuple', isRequired: true, tupleInfo: entryInfo }),
  ],
};

describe('Tuple Update Builder', () => {
  describe('single tuple - full replace', () => {
    test('should set tuple to new array value', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [40.7, -74.0] });

      expect(result.text).toContain('SET');
      expect(result.text).toContain('location =');
      expect(Object.values(result.vars)).toContainEqual([40.7, -74.0]);
    });

    test('should set required tuple to new value without NONE', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [0, 0] });

      expect(result.text).toContain('location =');
      expect(result.text).not.toContain('location = NONE');
    });

    test('should set entry tuple with mixed types', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { entry: ['hello', 42, true] });

      expect(result.text).toContain('entry =');
      expect(Object.values(result.vars)).toContainEqual(['hello', 42, true]);
    });
  });

  describe('optional tuple - null → NONE', () => {
    test('should convert null to NONE for optional tuple', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { backup: null });

      expect(result.text).toContain('backup = NONE');
    });

    test('should set optional tuple to new value when not null', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { backup: [1.0, 2.0] });

      expect(result.text).toContain('backup =');
      expect(result.text).not.toContain('backup = NONE');
    });

    test('should convert null to NONE for non-@nullable required tuple', () => {
      // Without @nullable, null is treated as NONE (field absent) regardless of required status
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: null as any });

      expect(result.text).toContain('location = NONE');
    });
  });

  describe('array of tuples', () => {
    test('should set array of tuples to new value', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'Alice' },
        {
          history: [
            [1, 2],
            [3, 4],
          ],
        },
      );

      expect(result.text).toContain('history =');
    });

    test('should handle push operation on array of tuples', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { history: { push: [10, 20] } });

      expect(result.text).toContain('history +=');
    });

    test('should handle push array operation on array of tuples', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'Alice' },
        {
          history: {
            push: [
              [10, 20],
              [30, 40],
            ],
          },
        },
      );

      expect(result.text).toContain('history +=');
    });

    test('should handle set operation on array of tuples', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'Alice' },
        {
          history: {
            set: [
              [10, 20],
              [30, 40],
            ],
          },
        },
      );

      expect(result.text).toContain('history =');
    });

    test('should handle empty array replacement', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { history: [] });

      expect(result.text).toContain('history =');
    });
  });

  describe('combined updates', () => {
    test('should update tuple alongside primitive fields', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { name: 'Bob', location: [50, 60] });

      expect(result.text).toContain('name =');
      expect(result.text).toContain('location =');
    });

    test('should update multiple tuple fields at once', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [40, -74], backup: [41, -75] });

      expect(result.text).toContain('location =');
      expect(result.text).toContain('backup =');
    });

    test('should update tuple and array of tuples simultaneously', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'Alice' },
        { location: [40, -74], history: { push: [40, -74] } },
      );

      expect(result.text).toContain('location =');
      expect(result.text).toContain('history +=');
    });

    test('should update optional tuple to null while updating other fields', () => {
      const result = buildUpdateManyQuery(
        userModel,
        { name: 'Alice' },
        { name: 'Bob', backup: null, location: [1, 2] },
      );

      expect(result.text).toContain('name =');
      expect(result.text).toContain('backup = NONE');
      expect(result.text).toContain('location =');
    });
  });

  describe('WHERE clause generation', () => {
    test('should generate correct WHERE clause with tuple update', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [40, -74] });

      expect(result.text).toContain('WHERE');
      expect(result.text).toContain('name =');
    });

    test('should include RETURN clause by default', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [40, -74] });

      expect(result.text).toContain('RETURN');
    });
  });

  describe('skip undefined values', () => {
    test('should skip undefined tuple values', () => {
      const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [40, -74], backup: undefined });

      expect(result.text).toContain('location =');
      expect(result.text).not.toContain('backup');
    });
  });
  describe('element decorator defaults', () => {
    // [label, born @createdAt, touched @updatedAt, hits @defaultAlways(7), tag @default('x')]
    const stampInfo = tupleInfo('Stamped', [
      elem({ index: 0, type: 'string', name: 'label' }),
      elem({ index: 1, type: 'date', name: 'born', timestampDecorator: 'createdAt' }),
      elem({ index: 2, type: 'date', name: 'touched', timestampDecorator: 'updatedAt' }),
      elem({ index: 3, type: 'int', name: 'hits', defaultAlwaysValue: 7 }),
      elem({ index: 4, type: 'string', name: 'tag', defaultValue: 'x' }),
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

    describe('per-element object form', () => {
      test('should refresh @updatedAt and @defaultAlways and preserve the rest', () => {
        const data = transformData({ stamp: { label: 'b' } }, stampModel, 'update');
        const result = buildUpdateManyQuery(stampModel, { name: 'Alice' }, data);

        expect(result.text).toContain(
          'stamp = [$stamp_0_set_0, $this.stamp[1], time::now(), $stamp_3_set_1, $this.stamp[4]]',
        );
        expect(result.vars.stamp_0_set_0).toBe('b');
        expect(result.vars.stamp_3_set_1).toBe(7);
      });

      test('should write a supplied @updatedAt value instead of time::now()', () => {
        const touched = new Date('2021-01-01T00:00:00Z');
        const data = transformData({ stamp: { touched } }, stampModel, 'update');
        const result = buildUpdateManyQuery(stampModel, { name: 'Alice' }, data);

        expect(result.text).not.toContain('time::now()');
        expect(Object.values(result.vars)).toContainEqual(touched);
      });

      test('should write a supplied @defaultAlways value instead of the declared default', () => {
        const data = transformData({ stamp: { hits: 99 } }, stampModel, 'update');
        const result = buildUpdateManyQuery(stampModel, { name: 'Alice' }, data);

        expect(Object.values(result.vars)).toContain(99);
        expect(Object.values(result.vars)).not.toContain(7);
      });
    });

    describe('full-replace array form', () => {
      test('should fill every omitted decorated position', () => {
        const data = transformData({ stamp: ['b'] }, stampModel, 'update');
        const result = buildUpdateManyQuery(stampModel, { name: 'Alice' }, data);

        expect(result.text).toContain(
          'stamp = [$stamp_0_set_0, time::now(), time::now(), $stamp_3_set_1, $stamp_4_set_2]',
        );
        expect(result.vars.stamp_0_set_0).toBe('b');
        expect(result.vars.stamp_3_set_1).toBe(7);
        expect(result.vars.stamp_4_set_2).toBe('x');
      });

      test('should bind the whole tuple as one parameter when no position needs an expression', () => {
        const born = new Date('2020-01-01T00:00:00Z');
        const touched = new Date('2021-01-01T00:00:00Z');
        const data = transformData({ stamp: ['b', born, touched, 99, 'own'] }, stampModel, 'update');
        const result = buildUpdateManyQuery(stampModel, { name: 'Alice' }, data);

        expect(result.text).toMatch(/stamp = \$\w+/);
        expect(result.text).not.toContain('time::now()');
        expect(Object.values(result.vars)).toContainEqual(['b', born, touched, 99, 'own']);
      });

      test('should leave an undecorated tuple bound as one parameter', () => {
        const result = buildUpdateManyQuery(userModel, { name: 'Alice' }, { location: [1.5, 2.5] });

        expect(result.text).toMatch(/location = \$\w+/);
        expect(result.text).not.toContain('time::now()');
      });
    });
  });
});
