import { Test } from 'ts-toolbelt';
import type {
  AnyBasic,
  AnyBasicInput,
  AnyBasicCreate,
  AnyBasicWhere,
  AnyBasicSelect,
  AnyWithObject,
  AnyMeta,
  AnyMetaInput,
  AnyDecorated,
  AnyDecoratedCreate,
  AnyDecoratedUpdate,
  AnyDecoratedUnset,
  AnyUnique,
  AnyUniqueCreate,
} from '../generated';
import type { CerialAny, CerialId } from 'cerial';

type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;

// =============================================================================
// AnyBasic Output Type
// =============================================================================

Test.checks([
  Test.check<AnyBasic['data'], CerialAny, Test.Pass>(),
  Test.check<AnyBasic['name'], string, Test.Pass>(),
  Test.check<AnyBasic['id'], CerialId, Test.Pass>(),
  Test.check<AnyBasic['items'], CerialAny[], Test.Pass>(),
]);

// =============================================================================
// AnyBasic Input Type
// =============================================================================

Test.checks([
  Test.check<AnyBasicInput['data'], CerialAny, Test.Pass>(),
  Test.check<AnyBasicInput['items'], CerialAny[], Test.Pass>(),
]);

// =============================================================================
// AnyBasicCreate — items optional (defaults to []), id optional
// =============================================================================

Test.checks([
  Test.check<HasKey<AnyBasicCreate, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyBasicCreate, 'data'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyBasicCreate, 'items'>, 1, Test.Pass>(),
]);

// =============================================================================
// AnyBasicWhere — has full operators on Any field
// =============================================================================

Test.checks([
  Test.check<HasKey<AnyBasicWhere, 'data'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyBasicWhere, 'name'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyBasicWhere, 'AND'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyBasicWhere, 'OR'>, 1, Test.Pass>(),
]);

// =============================================================================
// AnyBasicSelect — boolean fields
// =============================================================================

const _select: AnyBasicSelect = { data: true };

// =============================================================================
// AnyMeta (object) — data is CerialAny
// =============================================================================

Test.checks([Test.check<AnyMeta['data'], CerialAny, Test.Pass>(), Test.check<AnyMeta['label'], string, Test.Pass>()]);

Test.checks([
  Test.check<AnyMetaInput['data'], CerialAny, Test.Pass>(),
  Test.check<AnyMetaInput['label'], string, Test.Pass>(),
]);

// =============================================================================
// AnyWithObject — meta is AnyMeta
// =============================================================================

Test.checks([
  Test.check<AnyWithObject['meta'], AnyMeta, Test.Pass>(),
  Test.check<AnyWithObject['name'], string, Test.Pass>(),
]);

// =============================================================================
// AnyDecorated Output Type
// =============================================================================

Test.checks([
  Test.check<AnyDecorated['defData'], CerialAny, Test.Pass>(),
  Test.check<AnyDecorated['readonlyData'], CerialAny, Test.Pass>(),
  Test.check<AnyDecorated['indexedData'], CerialAny, Test.Pass>(),
  Test.check<AnyDecorated['sortedItems'], CerialAny[], Test.Pass>(),
  Test.check<AnyDecorated['distinctItems'], CerialAny[], Test.Pass>(),
]);

// =============================================================================
// AnyDecoratedCreate — @default and @defaultAlways fields are optional
// =============================================================================

Test.checks([
  Test.check<HasKey<AnyDecoratedCreate, 'defData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedCreate, 'alwaysData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedCreate, 'readonlyData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedCreate, 'indexedData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedCreate, 'sortedItems'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedCreate, 'distinctItems'>, 1, Test.Pass>(),
]);

// =============================================================================
// AnyDecoratedUpdate — @readonly excluded
// =============================================================================

Test.checks([
  Test.check<HasKey<AnyDecoratedUpdate, 'readonlyData'>, 0, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedUpdate, 'defData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedUpdate, 'indexedData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedUpdate, 'sortedItems'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedUpdate, 'distinctItems'>, 1, Test.Pass>(),
]);

// =============================================================================
// AnyDecoratedUnset — only @defaultAlways field is unsettable
// =============================================================================

Test.checks([
  Test.check<HasKey<AnyDecoratedUnset, 'alwaysData'>, 1, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedUnset, 'defData'>, 0, Test.Pass>(),
  Test.check<HasKey<AnyDecoratedUnset, 'readonlyData'>, 0, Test.Pass>(),
]);

// =============================================================================
// AnyUnique — output and create types
// =============================================================================

Test.checks([
  Test.check<AnyUnique['uniqueData'], CerialAny, Test.Pass>(),
  Test.check<HasKey<AnyUniqueCreate, 'uniqueData'>, 1, Test.Pass>(),
]);
