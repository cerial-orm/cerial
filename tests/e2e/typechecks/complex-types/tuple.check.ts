/**
 * Type checks for generated tuple types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  Coordinate,
  CoordinateInput,
  CoordinateWhere,
  Entry,
  EntryInput,
  EntryWhere,
  Inner,
  Located,
  Outer,
  OuterInput,
  TupleBasic,
  TupleBasicCreate,
  TupleBasicInput,
  TupleBasicOrderBy,
  TupleBasicSelect,
  TupleBasicUpdate,
  TupleBasicWhere,
  TupleHolder,
  TupleHolderOrderBy,
  TupleHolderWhere,
  TupleNested,
  TupleNestedInput,
  TupleObjInTuple,
} from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Tuple Output Types (always arrays)
// =============================================================================

Test.checks([
  // Coordinate = [number, number]
  Test.check<Coordinate, [number, number], Test.Pass>(),

  // Entry = [string, number, boolean]
  Test.check<Entry, [string, number, boolean], Test.Pass>(),

  // Inner = [number, number]
  Test.check<Inner, [number, number], Test.Pass>(),
]);

// Outer = [string, Inner] = [string, [number, number]]
Test.checks([Test.check<Outer, [string, [number, number]], Test.Pass>()]);

// =============================================================================
// Tuple Input Types (union of array | object form)
// =============================================================================

// CoordinateInput accepts array form
Test.checks([Test.check<Extends<[number, number], CoordinateInput>, 1, Test.Pass>()]);

// CoordinateInput accepts object form with named keys
Test.checks([Test.check<Extends<{ lat: number; lng: number }, CoordinateInput>, 1, Test.Pass>()]);

// CoordinateInput accepts object form with index keys
Test.checks([Test.check<Extends<{ '0': number; '1': number }, CoordinateInput>, 1, Test.Pass>()]);

// EntryInput accepts array form
Test.checks([Test.check<Extends<[string, number, boolean], EntryInput>, 1, Test.Pass>()]);

// EntryInput accepts object form with named + index keys
Test.checks([Test.check<Extends<{ name: string; '1': number; '2': boolean }, EntryInput>, 1, Test.Pass>()]);

// =============================================================================
// Tuple Where Types
// =============================================================================

// CoordinateWhere supports named keys
Test.checks([
  Test.check<'lat' extends keyof CoordinateWhere ? 1 : 0, 1, Test.Pass>(),
  Test.check<'lng' extends keyof CoordinateWhere ? 1 : 0, 1, Test.Pass>(),
]);

// CoordinateWhere supports numeric index keys
Test.checks([
  Test.check<0 extends keyof CoordinateWhere ? 1 : 0, 1, Test.Pass>(),
  Test.check<1 extends keyof CoordinateWhere ? 1 : 0, 1, Test.Pass>(),
]);

// EntryWhere supports named key for element 0
Test.checks([Test.check<'name' extends keyof EntryWhere ? 1 : 0, 1, Test.Pass>()]);

// EntryWhere accepts values by index in filter objects
Test.checks([
  // Verify named key 'name' exists for element 0
  Test.check<'name' extends keyof EntryWhere ? 1 : 0, 1, Test.Pass>(),
]);

// =============================================================================
// Model Types with Tuples
// =============================================================================

// TupleBasic output types
Test.checks([
  Test.check<TupleBasic['id'], CerialId<string>, Test.Pass>(),
  Test.check<TupleBasic['name'], string, Test.Pass>(),
  Test.check<TupleBasic['location'], Coordinate, Test.Pass>(),
  Test.check<TupleBasic['history'], Coordinate[], Test.Pass>(),
]);

// TupleBasic optional fields
Test.checks([
  Test.check<TupleBasic['backup'], Coordinate | undefined, Test.Pass>(),
  Test.check<TupleBasic['entry'], Entry | undefined, Test.Pass>(),
]);

// TupleBasicInput uses input types
Test.checks([
  Test.check<TupleBasicInput['location'], CoordinateInput, Test.Pass>(),
  Test.check<TupleBasicInput['history'], CoordinateInput[], Test.Pass>(),
]);

// TupleBasicWhere uses where types
Test.checks([Test.check<TupleBasicWhere['location'], CoordinateWhere | undefined, Test.Pass>()]);

// TupleBasicWhere history uses array quantifiers
Test.checks([
  Test.check<
    TupleBasicWhere['history'],
    { some?: CoordinateWhere; every?: CoordinateWhere; none?: CoordinateWhere } | undefined,
    Test.Pass
  >(),
]);

// =============================================================================
// OrderBy excludes tuple fields
// =============================================================================

Test.checks([
  Test.check<'name' extends keyof TupleBasicOrderBy ? 1 : 0, 1, Test.Pass>(),
  Test.check<'id' extends keyof TupleBasicOrderBy ? 1 : 0, 1, Test.Pass>(),
  // Tuple fields should NOT be in OrderBy
  Test.check<'location' extends keyof TupleBasicOrderBy ? 1 : 0, 0, Test.Pass>(),
  Test.check<'backup' extends keyof TupleBasicOrderBy ? 1 : 0, 0, Test.Pass>(),
  Test.check<'history' extends keyof TupleBasicOrderBy ? 1 : 0, 0, Test.Pass>(),
  Test.check<'entry' extends keyof TupleBasicOrderBy ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// Select is boolean-only for tuples
// =============================================================================

// TupleBasicSelect should have location, backup, etc. as boolean
Test.checks([
  Test.check<'location' extends keyof TupleBasicSelect ? 1 : 0, 1, Test.Pass>(),
  Test.check<'backup' extends keyof TupleBasicSelect ? 1 : 0, 1, Test.Pass>(),
  Test.check<'history' extends keyof TupleBasicSelect ? 1 : 0, 1, Test.Pass>(),
]);

// =============================================================================
// Nested Tuple Types
// =============================================================================

// TupleNested output
Test.checks([Test.check<TupleNested['payload'], Outer, Test.Pass>()]);

// TupleNested input
Test.checks([Test.check<TupleNestedInput['payload'], OuterInput, Test.Pass>()]);

// =============================================================================
// Object in Tuple
// =============================================================================

// TupleObjInTuple output
Test.checks([Test.check<TupleObjInTuple['place'], Located, Test.Pass>()]);

// =============================================================================
// Tuple in Object
// =============================================================================

Test.checks([
  Test.check<TupleHolder['label'], string, Test.Pass>(),
  Test.check<TupleHolder['coord'], Coordinate, Test.Pass>(),
  Test.check<TupleHolder['optCoord'], Coordinate | undefined, Test.Pass>(),
]);

// TupleHolderWhere supports coord where
Test.checks([Test.check<TupleHolderWhere['coord'], CoordinateWhere | undefined, Test.Pass>()]);

// TupleHolderOrderBy excludes tuple fields
Test.checks([
  Test.check<'label' extends keyof TupleHolderOrderBy ? 1 : 0, 1, Test.Pass>(),
  Test.check<'coord' extends keyof TupleHolderOrderBy ? 1 : 0, 0, Test.Pass>(),
  Test.check<'optCoord' extends keyof TupleHolderOrderBy ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// Update Type for Tuples
// =============================================================================

// TupleBasicUpdate: single tuple is full replace
Test.checks([Test.check<Extends<{ location: CoordinateInput }, TupleBasicUpdate>, 1, Test.Pass>()]);

// TupleBasicUpdate: array tuple supports push/set
Test.checks([
  Test.check<Extends<{ history: { push: CoordinateInput } }, TupleBasicUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ history: { set: CoordinateInput[] } }, TupleBasicUpdate>, 1, Test.Pass>(),
]);

// =============================================================================
// Create Type for Tuples
// =============================================================================

// Required tuple is required in create
Test.checks([Test.check<Extends<{ name: string; location: CoordinateInput }, TupleBasicCreate>, 1, Test.Pass>()]);
