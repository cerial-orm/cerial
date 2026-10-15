/**
 * Exact-equality checks for every `@id` form: the output id type, the create
 * input type, whether the id is optional on create, and the id accepted by
 * `where` and `findUnique`.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Each assertion uses `Test.check`, which fails on a wider or a narrower type.
 */

import type { CerialId, RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type { IsOptional } from '../helpers';
import type {
  FkChildModel,
  FkChildModelCreate,
  IntIdModel,
  IntIdModelCreate,
  IntIdModelFindUniqueWhere,
  IntIdModelUpdate,
  IntIdModelWhere,
  IntUnionIdModel,
  IntUnionIdModelCreate,
  NumberIdModel,
  NumberIdModelCreate,
  ObjectIdModel,
  ObjectIdModelCreate,
  StringIdModel,
  StringIdModelCreate,
  TupleIdModel,
  TupleIdModelCreate,
  UnionIdModel,
  UnionIdModelCreate,
  UuidIdModel,
  UuidIdModelCreate,
} from '../../generated';

const { checks, check } = Test;

// =============================================================================
// Output id type: always a CerialId wrapping the id's value type
// =============================================================================

checks([
  check<FkChildModel['id'], CerialId<string>, Test.Pass>(), // plain `Record @id`
  check<StringIdModel['id'], CerialId<string>, Test.Pass>(),
  check<UuidIdModel['id'], CerialId<string>, Test.Pass>(),
  check<IntIdModel['id'], CerialId<number>, Test.Pass>(),
  check<NumberIdModel['id'], CerialId<number>, Test.Pass>(),
  check<TupleIdModel['id'], CerialId<[number, number]>, Test.Pass>(),
  check<ObjectIdModel['id'], CerialId<{ service: string; timestamp: number }>, Test.Pass>(),
  check<UnionIdModel['id'], CerialId<string | number>, Test.Pass>(), // `Record(string, int)`
  check<IntUnionIdModel['id'], CerialId<number | string>, Test.Pass>(), // `Record(int, uuid)`
]);

// =============================================================================
// Create input id type
// =============================================================================

checks([
  check<NonNullable<FkChildModelCreate['id']>, string, Test.Pass>(),
  check<NonNullable<StringIdModelCreate['id']>, string, Test.Pass>(),
  check<NonNullable<UuidIdModelCreate['id']>, string, Test.Pass>(),
  check<IntIdModelCreate['id'], number, Test.Pass>(),
  check<NumberIdModelCreate['id'], number, Test.Pass>(),
  check<TupleIdModelCreate['id'], [number, number], Test.Pass>(),
  check<ObjectIdModelCreate['id'], { service: string; timestamp: number }, Test.Pass>(),
  check<UnionIdModelCreate['id'], string | number, Test.Pass>(),
  check<IntUnionIdModelCreate['id'], number | string, Test.Pass>(),
]);

// =============================================================================
// Create optionality: only the forms SurrealDB can generate are optional
// =============================================================================

checks([
  check<IsOptional<FkChildModelCreate, 'id'>, 1, Test.Pass>(),
  check<IsOptional<StringIdModelCreate, 'id'>, 1, Test.Pass>(),
  check<IsOptional<UuidIdModelCreate, 'id'>, 1, Test.Pass>(),
  check<IsOptional<IntIdModelCreate, 'id'>, 0, Test.Pass>(),
  check<IsOptional<NumberIdModelCreate, 'id'>, 0, Test.Pass>(),
  check<IsOptional<TupleIdModelCreate, 'id'>, 0, Test.Pass>(),
  check<IsOptional<ObjectIdModelCreate, 'id'>, 0, Test.Pass>(),
  check<IsOptional<UnionIdModelCreate, 'id'>, 0, Test.Pass>(),
  check<IsOptional<IntUnionIdModelCreate, 'id'>, 0, Test.Pass>(),
]);

// =============================================================================
// Where and findUnique accept the id value, a CerialId or a record id
// =============================================================================

checks([
  check<
    NonNullable<IntIdModelWhere['id']> extends infer W ? (RecordIdInput<number> extends W ? 1 : 0) : never,
    1,
    Test.Pass
  >(),
  check<IntIdModelFindUniqueWhere['id'], RecordIdInput<number>, Test.Pass>(),
]);

// =============================================================================
// Update never carries the id
// =============================================================================

checks([check<'id' extends keyof IntIdModelUpdate ? 1 : 0, 0, Test.Pass>()]);

// =============================================================================
// Negative: a wrong id type is rejected
// =============================================================================

// @ts-expect-error - an int id is a number, not a string
export const stringForIntId: IntIdModelCreate = { id: 'a', name: 'x' };

// @ts-expect-error - a tuple id needs both elements
export const shortTupleId: TupleIdModelCreate = { id: [1], city: 'x' };

// @ts-expect-error - an object id needs every key
export const partialObjectId: ObjectIdModelCreate = { id: { service: 'a' }, payload: 1 };

// @ts-expect-error - a union id of string | number rejects a boolean
export const booleanForUnionId: UnionIdModelCreate = { id: true, label: 'x' };

// @ts-expect-error - an int id is required on create
export const missingIntId: IntIdModelCreate = { name: 'x' };
