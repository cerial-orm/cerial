/**
 * Unit tests for the import condition checkers, registry builder and constants in import-helpers.ts
 */

import { describe, expect, test } from 'bun:test';
import {
  CERIAL_ANY_IMPORT,
  CERIAL_BYTES_IMPORT,
  CERIAL_DECIMAL_IMPORT,
  CERIAL_DURATION_IMPORT,
  CERIAL_GEOMETRY_IMPORT,
  CERIAL_ID_IMPORT,
  CERIAL_SET_IMPORT,
  CERIAL_UUID_IMPORT,
  NONE_IMPORT,
  TS_TOOLBELT_IMPORT,
  UNIQUE_TYPES_IMPORT,
  createRegistryFromModels,
  hasRelations,
  modelHasAnyFields,
  modelHasBytesFields,
  modelHasDecimalFields,
  modelHasDurationFields,
  modelHasGeometryFields,
  modelHasSetFields,
  modelHasUuidFields,
  needsCerialNone,
  objectHasAnyFields,
  objectHasBytesFields,
  objectHasDecimalFields,
  objectHasDurationFields,
  objectHasGeometryFields,
  objectHasUuidFields,
  tupleHasAnyElements,
  tupleHasBytesElements,
  tupleHasDecimalElements,
  tupleHasDurationElements,
  tupleHasGeometryElements,
  tupleHasUuidElements,
} from '../../../../src/generators/client/import-helpers';
import type {
  FieldMetadata,
  ModelMetadata,
  ObjectMetadata,
  ObjectRegistry,
  TupleMetadata,
} from '../../../../src/types';
import { element, field, model, object, objectField, relationField, tuple } from '../fixtures';

type FieldType = FieldMetadata['type'];

interface Family {
  readonly type: FieldType;
  readonly model: (m: ModelMetadata) => boolean;
  readonly object: (o: ObjectMetadata, r?: ObjectRegistry, v?: Set<string>) => boolean;
  readonly tuple: (t: TupleMetadata) => boolean;
}

const families: Family[] = [
  { type: 'uuid', model: modelHasUuidFields, object: objectHasUuidFields, tuple: tupleHasUuidElements },
  { type: 'duration', model: modelHasDurationFields, object: objectHasDurationFields, tuple: tupleHasDurationElements },
  { type: 'decimal', model: modelHasDecimalFields, object: objectHasDecimalFields, tuple: tupleHasDecimalElements },
  { type: 'bytes', model: modelHasBytesFields, object: objectHasBytesFields, tuple: tupleHasBytesElements },
  { type: 'geometry', model: modelHasGeometryFields, object: objectHasGeometryFields, tuple: tupleHasGeometryElements },
  { type: 'any', model: modelHasAnyFields, object: objectHasAnyFields, tuple: tupleHasAnyElements },
];

describe.each(families)('type-presence checkers for $type', (f) => {
  test('model: true when a field has the type, false otherwise', () => {
    expect(f.model(model('M', [field({ name: 'x', type: f.type })]))).toBe(true);
    expect(f.model(model('M', [field({ name: 'x', type: 'string' })]))).toBe(false);
    expect(f.model(model('M', []))).toBe(false);
  });

  test('tuple: true when an element has the type, false otherwise', () => {
    expect(f.tuple(tuple('T', [element(0, 'string'), element(1, f.type)]))).toBe(true);
    expect(f.tuple(tuple('T', [element(0, 'string')]))).toBe(false);
  });

  test('object: direct field is found without a registry', () => {
    expect(f.object(object('O', [field({ name: 'x', type: f.type })]))).toBe(true);
    expect(f.object(object('O', [field({ name: 'x', type: 'string' })]))).toBe(false);
  });

  test('object: nested object is found only when a registry is supplied', () => {
    const outer = object('Outer', [objectField('inner', 'Inner')]);
    const registry: ObjectRegistry = { Inner: object('Inner', [field({ name: 'x', type: f.type })]) };

    expect(f.object(outer, registry)).toBe(true);
    expect(f.object(outer)).toBe(false);
  });

  test('object: finds the type two levels down', () => {
    const registry: ObjectRegistry = {
      Mid: object('Mid', [objectField('leaf', 'Leaf')]),
      Leaf: object('Leaf', [field({ name: 'x', type: f.type })]),
    };

    expect(f.object(object('Top', [objectField('mid', 'Mid')]), registry)).toBe(true);
  });

  test('object: a nested name missing from the registry is treated as absent', () => {
    expect(f.object(object('Top', [objectField('ghost', 'Ghost')]), {})).toBe(false);
  });

  test('object: a nested object field without objectInfo is skipped', () => {
    expect(f.object(object('Top', [field({ name: 'bare', type: 'object' })]), {})).toBe(false);
  });

  test('object: a cycle terminates and reports false when no field has the type', () => {
    const registry: ObjectRegistry = {
      A: object('A', [objectField('b', 'B')]),
      B: object('B', [objectField('a', 'A')]),
    };

    expect(f.object(registry.A!, registry)).toBe(false);
  });

  test('object: an already-visited object is not descended into', () => {
    const registry: ObjectRegistry = { Inner: object('Inner', [field({ name: 'x', type: f.type })]) };

    expect(f.object(object('Top', [objectField('inner', 'Inner')]), registry, new Set(['Inner']))).toBe(false);
  });
});

describe('modelHasSetFields', () => {
  test('true only when some field has isSet', () => {
    expect(modelHasSetFields(model('M', [field({ name: 'tags', isArray: true, isSet: true })]))).toBe(true);
    expect(modelHasSetFields(model('M', [field({ name: 'tags', isArray: true })]))).toBe(false);
  });
});

describe('hasRelations', () => {
  test('true for a relation field with relationInfo', () => {
    expect(hasRelations(model('M', [relationField('p', 'P')]))).toBe(true);
  });

  test('false for a relation field without relationInfo and for plain models', () => {
    expect(hasRelations(model('M', [field({ name: 'p', type: 'relation' })]))).toBe(false);
    expect(hasRelations(model('M', [field({ name: 'n' })]))).toBe(false);
  });
});

describe('needsCerialNone', () => {
  const needs = (f: FieldMetadata): boolean => needsCerialNone(model('M', [f]));

  test('true for an optional scalar', () => {
    expect(needs(field({ name: 'x', isRequired: false }))).toBe(true);
  });

  test('true for an optional object field', () => {
    expect(needs(objectField('x', 'O', { isRequired: false }))).toBe(true);
  });

  test('false for a required scalar', () => {
    expect(needs(field({ name: 'x' }))).toBe(false);
  });

  test('false for a required nullable scalar (null is handled by | null)', () => {
    expect(needs(field({ name: 'x', isNullable: true }))).toBe(false);
  });

  test('true for an optional nullable scalar', () => {
    expect(needs(field({ name: 'x', isNullable: true, isRequired: false }))).toBe(true);
  });

  test.each([
    ['id', { isId: true }],
    ['readonly', { isReadonly: true }],
    ['array', { isArray: true }],
    ['@now', { timestampDecorator: 'now' as const }],
    ['relation', { type: 'relation' as const }],
  ])('false for an optional %s field', (_label, extra) => {
    expect(needs(field({ name: 'x', isRequired: false, ...extra }))).toBe(false);
  });

  test('@createdAt on an optional field still needs it', () => {
    expect(needs(field({ name: 'x', isRequired: false, timestampDecorator: 'createdAt' }))).toBe(true);
  });

  test('one qualifying field among skipped ones is enough', () => {
    const m = model('M', [
      field({ name: 'id', isId: true, isRequired: false }),
      field({ name: 'x', isRequired: false }),
    ]);

    expect(needsCerialNone(m)).toBe(true);
  });

  test('false for a model with no fields', () => {
    expect(needsCerialNone(model('M', []))).toBe(false);
  });
});

describe('createRegistryFromModels', () => {
  test('indexes models by name', () => {
    const a = model('A', []);
    const b = model('B', []);

    expect(createRegistryFromModels([a, b])).toEqual({ A: a, B: b });
  });

  test('a later model with the same name replaces the earlier one', () => {
    const first = model('A', [field({ name: 'x' })]);
    const second = model('A', []);

    expect(createRegistryFromModels([first, second]).A).toBe(second);
  });

  test('empty input gives an empty registry', () => {
    expect(createRegistryFromModels([])).toEqual({});
  });
});

describe('import constants', () => {
  test('TS_TOOLBELT_IMPORT', () => {
    expect(TS_TOOLBELT_IMPORT).toBe(`import type { Object as O, Any as A } from 'ts-toolbelt';`);
  });

  test('CERIAL_ID_IMPORT', () => {
    expect(CERIAL_ID_IMPORT).toBe(`import { CerialId } from 'cerial';\nimport type { RecordIdInput } from 'cerial';`);
  });

  test('value/input pair imports', () => {
    expect(CERIAL_UUID_IMPORT).toBe(
      `import { CerialUuid } from 'cerial';\nimport type { CerialUuidInput } from 'cerial';`,
    );
    expect(CERIAL_DURATION_IMPORT).toBe(
      `import { CerialDuration } from 'cerial';\nimport type { CerialDurationInput } from 'cerial';`,
    );
    expect(CERIAL_DECIMAL_IMPORT).toBe(
      `import { CerialDecimal } from 'cerial';\nimport type { CerialDecimalInput } from 'cerial';`,
    );
    expect(CERIAL_BYTES_IMPORT).toBe(
      `import { CerialBytes } from 'cerial';\nimport type { CerialBytesInput } from 'cerial';`,
    );
  });

  test('CERIAL_GEOMETRY_IMPORT imports every geometry class and its input type', () => {
    expect(CERIAL_GEOMETRY_IMPORT).toBe(
      `import { CerialGeometry, CerialPoint, CerialLineString, CerialPolygon, CerialMultiPoint, CerialMultiLineString, CerialMultiPolygon, CerialGeometryCollection } from 'cerial';\nimport type { CerialGeometryInput, CerialPointInput, CerialLineStringInput, CerialPolygonInput, CerialMultiPointInput, CerialMultiLineStringInput, CerialMultiPolygonInput, CerialGeometryCollectionInput } from 'cerial';`,
    );
  });

  test('type-only imports for CerialAny, CerialSet and CerialNone', () => {
    expect(CERIAL_ANY_IMPORT).toBe(`import type { CerialAny } from 'cerial';`);
    expect(CERIAL_SET_IMPORT).toBe(`import type { CerialSet } from 'cerial';`);
    expect(NONE_IMPORT).toBe(`import type { CerialNone } from 'cerial';`);
  });

  test('UNIQUE_TYPES_IMPORT', () => {
    expect(UNIQUE_TYPES_IMPORT).toBe(
      `import type { DeleteUniqueReturn, DeleteUniqueReturnType, UpdateUniqueReturn, UpdateUniqueReturnType, UpsertReturn, UpsertReturnType, UpsertArrayReturnType, ResolveFieldSelect, SafeUnset, SelectArg, DataArg, IncludeArg } from '..';\nimport type { CerialQueryPromise } from '..';\nimport type { CerialTransaction, ModelMetadata } from 'cerial';`,
    );
  });
});
