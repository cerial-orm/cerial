import { Test } from 'ts-toolbelt';
import type {
  NumberBasic,
  NumberBasicCreate,
  NumberBasicInput,
  NumberBasicOrderBy,
  NumberBasicSelect,
  NumberBasicUpdate,
  NumberBasicWhere,
  NumberCoord,
  NumberCoordInput,
  NumberDecorated,
  NumberDecoratedCreate,
  NumberInfoCreateInput,
  NumberWithObjectCreate,
  NumberWithTupleCreate,
} from '../generated';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// NumberBasic Output Type
// =============================================================================

Test.checks([
  Test.check<NumberBasic['price'], number, Test.Pass>(),
  Test.check<NumberBasic['scores'], number[], Test.Pass>(),
]);

// Optional Number → number | undefined
const _optRating: NumberBasic['rating'] = undefined;

// Nullable Number → number | null (required nullable field)
const _nullWeight: NumberBasic['weight'] = null;

// =============================================================================
// NumberBasic Input Type
// =============================================================================

Test.checks([
  Test.check<NumberBasicInput['price'], number, Test.Pass>(),
  Test.check<NumberBasicInput['scores'], number[], Test.Pass>(),
]);

// =============================================================================
// NumberBasicCreate — scores optional (defaults to []), optional/nullable fields optional
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberBasicCreate, 'price'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicCreate, 'scores'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicCreate, 'rating'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicCreate, 'weight'>, 1, Test.Pass>(),
]);

// Can create without optional fields (weight is required nullable)
const _minCreate: NumberBasicCreate = { name: 'test', price: 19.99, weight: null };

// =============================================================================
// NumberBasicUpdate — all fields optional via Partial
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberBasicUpdate, 'price'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicUpdate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicUpdate, 'scores'>, 1, Test.Pass>(),
]);

// =============================================================================
// NumberBasicWhere — Number fields have comparison operators
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberBasicWhere, 'price'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicWhere, 'rating'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicWhere, 'weight'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicWhere, 'scores'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicWhere, 'OR'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberBasicWhere, 'NOT'>, 1, Test.Pass>(),
]);

// =============================================================================
// NumberBasicOrderBy
// =============================================================================

Test.checks([
  Test.check<Extends<{ price: 'asc' | 'desc' }, NumberBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ name: 'asc' | 'desc' }, NumberBasicOrderBy>, 1, Test.Pass>(),
]);

// =============================================================================
// NumberBasicSelect
// =============================================================================

Test.checks([Test.check<Extends<{ price: true }, NumberBasicSelect>, 1, Test.Pass>()]);

// =============================================================================
// NumberDecorated — @default/@defaultAlways fields optional in Create
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberDecoratedCreate, 'score'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberDecoratedCreate, 'multiplier'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberDecoratedCreate, 'name'>, 1, Test.Pass>(),
]);

// Can create without @default/@defaultAlways fields
const _minDecCreate: NumberDecoratedCreate = { name: 'test' };

// =============================================================================
// NumberDecorated Output — decorator fields present
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberDecorated, 'score'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberDecorated, 'multiplier'>, 1, Test.Pass>(),
]);

// =============================================================================
// NumberInfo Object — views required, downloads optional, rating has @default
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberInfoCreateInput, 'views'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberInfoCreateInput, 'downloads'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberInfoCreateInput, 'rating'>, 1, Test.Pass>(),
]);

// views is required, downloads and rating are optional
const _minObjCreate: NumberInfoCreateInput = { views: 100 };

// =============================================================================
// NumberCoord Tuple — output is [number, number, number | null]
// =============================================================================

Test.checks([Test.check<NumberCoord, [number, number, number | null], Test.Pass>()]);

// Input accepts array form or object form
const _tupleArr: NumberCoordInput = [10.5, 20.5, 30.5];
const _tupleObj: NumberCoordInput = { 0: 10.5, 1: 20.5 };

// =============================================================================
// NumberWithObject — stats required, optStats optional
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberWithObjectCreate, 'stats'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberWithObjectCreate, 'optStats'>, 1, Test.Pass>(),
]);

// stats is required, optStats is optional
const _minObjModel: NumberWithObjectCreate = {
  name: 'test',
  stats: { views: 100 },
};

// =============================================================================
// NumberWithTuple — coord required, optCoord optional
// =============================================================================

Test.checks([
  Test.check<HasKey<NumberWithTupleCreate, 'coord'>, 1, Test.Pass>(),
  Test.check<HasKey<NumberWithTupleCreate, 'optCoord'>, 1, Test.Pass>(),
]);

// coord is required, optCoord is optional
const _minTupleModel: NumberWithTupleCreate = {
  name: 'test',
  coord: [1, 2, 3],
};
