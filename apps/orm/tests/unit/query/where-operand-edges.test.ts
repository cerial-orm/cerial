/**
 * Unit Tests: edges of the where operand path
 *
 * - a tuple in object form or an object bound whole is held to every position and required sub-field,
 *   on create and in a filter, because the database refuses a short one and nothing else would
 * - a Record inside an object is compared as create stores it
 */

import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { transformData } from '../../../src/query/transformers';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';
import { validateWhere } from '../../../src/query/validators';
import type { ModelMetadata, WhereClause } from '../../../src/types';
import { CerialId } from '../../../src/utils/cerial-id';

const schema = `
object Rec {
  ref Record?
  refs Record[]
}

object Arr {
  n Int?
  tags Int[]
}

tuple Duo {
  Int,
  String
}

tuple WithObj {
  Int,
  Arr
}

model Item {
  id Record @id
  rec Rec?
  top Arr?
  arrs Arr[]
  duo Duo?
  duos Duo[]
  withObj WithObj?
  meta Arr @flexible
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(
  models,
  objects,
  createObjectRegistry(objects),
  createTupleRegistry(tuples),
  createLiteralRegistry([]),
);
const registry = createRegistry(models);
inferFKTypes(models, registry);
const item = registry.Item!;

const w = (value: unknown): WhereClause => value as WhereClause;
const createErrors = (data: Record<string, unknown>): string[] =>
  validateCreateData(data, item).errors.map((e) => e.message);
const whereErrors = (where: unknown, model: ModelMetadata = item): string[] =>
  validateWhere(w(where), model, registry).errors.map((e) => e.message);
const compile = (where: unknown, model: ModelMetadata = item) =>
  buildConditions(createCompileContext(), w(where), model, registry);

// Every other required field of Item, so only the field under test can fail
const base = { meta: { tags: [] } };

describe('a tuple in object form or an object bound whole is held to every position and required sub-field', () => {
  test('an object-form tuple missing a position is refused on create, naming the field', () => {
    expect(createErrors({ ...base, duo: { 0: 1 } }).join()).toContain('duo is missing the tuple element at position 1');
    expect(createErrors({ ...base, duo: { 1: 'x' } }).join()).toContain('position 0');
    expect(createErrors({ ...base, duo: {} }).join()).toContain('duo');
  });

  test('a complete object-form tuple is accepted', () => {
    expect(createErrors({ ...base, duo: { 0: 1, 1: 'x' } })).toEqual([]);
  });

  test('an object-form tuple inside an array of tuples is held the same way', () => {
    expect(createErrors({ ...base, duos: [{ 0: 1 }] }).join()).toContain('duos[0] is missing');
    expect(createErrors({ ...base, duos: [{ 0: 1, 1: 'x' }, [2, 'y']] })).toEqual([]);
  });

  test('an object element missing a required array is refused, at the position it sits', () => {
    expect(createErrors({ ...base, withObj: [1, {}] }).join()).toContain('withObj[1].tags is required');
    expect(createErrors({ ...base, withObj: { 0: 1, 1: {} } }).join()).toContain('withObj.1.tags is required');
    expect(createErrors({ ...base, withObj: [1, { n: 2 }] }).join()).toContain('tags');
  });

  test('an object element with its array written is accepted', () => {
    expect(createErrors({ ...base, withObj: [1, { tags: [] }] })).toEqual([]);
    expect(createErrors({ ...base, withObj: { 0: 1, 1: { tags: [1] } } })).toEqual([]);
  });

  test('an element of an array of objects missing a required array is refused', () => {
    expect(createErrors({ ...base, arrs: [{}] }).join()).toContain('arrs[0].tags is required');
    expect(createErrors({ ...base, arrs: [{ tags: [] }, { n: 1 }] }).join()).toContain('arrs[1].tags is required');
    expect(createErrors({ ...base, arrs: [{ tags: [] }, { n: 1, tags: [2] }] })).toEqual([]);
  });

  test('an object field under the model still takes the database default for an array it leaves out', () => {
    expect(createErrors({ ...base, top: {} })).toEqual([]);
  });

  test('a per-element tuple update and a partial object update stay partial', () => {
    expect(validateUpdateData({ duo: { 0: 2 } }, item).errors).toEqual([]);
    expect(validateUpdateData({ top: { n: 1 } }, item).errors).toEqual([]);
  });

  test('a filter comparing a whole tuple is refused the same way', () => {
    for (const where of [
      { duo: [1] },
      { NOT: { duo: [1] } },
      { withObj: [1, {}] },
      { NOT: { withObj: [1, {}] } },
      { duos: [[1]] },
    ])
      expect(whereErrors(where).length).toBeGreaterThan(0);
    expect(whereErrors({ NOT: { withObj: [1, {}] } }).join()).toContain('withObj');
  });

  test('the builder refuses it alone, so no statement is built', () => {
    expect(() => compile({ NOT: { withObj: [1, {}] } })).toThrow(/withObj/);
  });

  test('a filter by element is not held to the other positions', () => {
    expect(whereErrors({ duo: { 0: 1 } })).toEqual([]);
    expect(whereErrors({ withObj: { 1: { n: 1 } } })).toEqual([]);
  });
});

describe('a Record inside an object is compared as create stores it', () => {
  const stored = (value: unknown): unknown =>
    (transformData({ rec: { ref: value } }, item).rec as { ref: unknown }).ref;

  test.each([
    ['a table:id string', 'victim:v'],
    ['a CerialId', CerialId.parse('victim:v')],
    ['a RecordId', new RecordId('victim', 'v')],
  ])('%s is bound as the RecordId create stores', (_name, value) => {
    const bound = Object.values(compile({ rec: { ref: value } }).vars);
    expect(bound).toEqual([stored(value)]);
    expect(bound[0]).toBeInstanceOf(RecordId);
  });

  test('NOT binds the same value, so it excludes the row holding it', () => {
    const bound = Object.values(compile({ NOT: { rec: { ref: 'victim:v' } } }).vars);
    expect(bound).toEqual([stored('victim:v')]);
  });

  test('has and in convert each member of a Record[] in an object', () => {
    expect(Object.values(compile({ rec: { refs: { has: 'victim:v' } } }).vars)).toEqual([new RecordId('victim', 'v')]);
    expect(Object.values(compile({ rec: { refs: { hasAny: ['victim:v', 'victim:w'] } } }).vars)).toEqual([
      [new RecordId('victim', 'v'), new RecordId('victim', 'w')],
    ]);
  });

  test('a value that names no table is refused, naming the field', () => {
    expect(() => compile({ rec: { ref: 'v' } })).toThrow(/rec\.ref/);
    expect(() => compile({ NOT: { rec: { ref: 5 } } })).toThrow(/rec\.ref/);
  });
});
