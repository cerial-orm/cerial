/**
 * Type checks for generated TupleUpdate types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialNone } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  CoordinateInput,
  CoordinateUpdate,
  DeepMidObjInput,
  DeepMidTupleInput,
  DeepMidTupleUpdate,
  DeepOuterTupleUpdate,
  LocatedUpdate,
  TupleAddressInput,
  TupleBasicUpdate,
  TupleDeepNestUpdate,
  TupleObjInTupleUpdate,
  WithOptionalUpdate,
} from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Primitive Tuple Update Types
// =============================================================================

// CoordinateUpdate: all elements optional, named + index keys
Test.checks([
  Test.check<0 extends keyof CoordinateUpdate ? 1 : 0, 1, Test.Pass>(),
  Test.check<'lat' extends keyof CoordinateUpdate ? 1 : 0, 1, Test.Pass>(),
  Test.check<1 extends keyof CoordinateUpdate ? 1 : 0, 1, Test.Pass>(),
  Test.check<'lng' extends keyof CoordinateUpdate ? 1 : 0, 1, Test.Pass>(),
]);

// CoordinateUpdate element types are optional numbers
Test.checks([
  Test.check<CoordinateUpdate['0'], number | undefined, Test.Pass>(),
  Test.check<CoordinateUpdate['lat'], number | undefined, Test.Pass>(),
]);

// CoordinateUpdate can be assigned with partial data
Test.checks([
  Test.check<Extends<{ lat: 5 }, CoordinateUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ lng: 10 }, CoordinateUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ lat: 5; lng: 10 }, CoordinateUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ '0': 5 }, CoordinateUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{}, CoordinateUpdate>, 1, Test.Pass>(),
]);

// =============================================================================
// Nullable Element
// =============================================================================

// WithOptionalUpdate: nullable element gets | null union
Test.checks([
  // Element 0 is required string
  Test.check<WithOptionalUpdate['0'], string | undefined, Test.Pass>(),
  Test.check<WithOptionalUpdate['text'], string | undefined, Test.Pass>(),
  // Element 1 is nullable float — gets | null
  Test.check<WithOptionalUpdate['1'], number | null | undefined, Test.Pass>(),
]);

// =============================================================================
// Object Element in Tuple Update
// =============================================================================

// LocatedUpdate: object element accepts Partial<Input> | { set: Input }
Test.checks([
  // String element
  Test.check<LocatedUpdate['0'], string | undefined, Test.Pass>(),
  Test.check<LocatedUpdate['tag'], string | undefined, Test.Pass>(),
  // Object element: Partial merge or full replace
  Test.check<LocatedUpdate['1'], Partial<TupleAddressInput> | { set: TupleAddressInput } | undefined, Test.Pass>(),
]);

// LocatedUpdate accepts partial object merge
Test.checks([
  Test.check<Extends<{ 1: { city: 'NYC' } }, LocatedUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ 1: { set: { street: '123'; city: 'NYC' } } }, LocatedUpdate>, 1, Test.Pass>(),
]);

// =============================================================================
// Nested Tuple Update
// =============================================================================

// DeepOuterTupleUpdate: nested tuple accepts array-form | TupleUpdate (no wrapper)
Test.checks([
  Test.check<DeepOuterTupleUpdate['0'], string | undefined, Test.Pass>(),
  Test.check<DeepOuterTupleUpdate['1'], [string, DeepMidObjInput] | DeepMidTupleUpdate | undefined, Test.Pass>(),
]);

// DeepOuterTupleUpdate accepts nested per-element update (no { update } wrapper)
Test.checks([
  Test.check<Extends<{ 1: DeepMidTupleUpdate }, DeepOuterTupleUpdate>, 1, Test.Pass>(),
  // Array form = full replace
  Test.check<Extends<{ 1: [string, DeepMidObjInput] }, DeepOuterTupleUpdate>, 1, Test.Pass>(),
  // { update: ... } wrapper should NOT be assignable (removed at nested level)
  Test.check<Extends<{ 1: { update: DeepMidTupleUpdate } }, DeepOuterTupleUpdate>, 0, Test.Pass>(),
]);

// =============================================================================
// Model Update Types with array/object disambiguation
// =============================================================================

// TupleBasicUpdate: single tuple field — array = full replace, object = per-element
Test.checks([
  // Full replace (array form)
  Test.check<Extends<{ location: [number, number] }, TupleBasicUpdate>, 1, Test.Pass>(),
  // Per-element update (object form = CoordinateUpdate)
  Test.check<Extends<{ location: CoordinateUpdate }, TupleBasicUpdate>, 1, Test.Pass>(),
  // { update: ... } wrapper should NOT be assignable (removed)
  Test.check<Extends<{ location: { update: CoordinateUpdate } }, TupleBasicUpdate>, 0, Test.Pass>(),
]);

// TupleObjInTupleUpdate: tuple with objects — array/object disambiguation
Test.checks([
  // Full replace (array form)
  Test.check<Extends<{ place: [string, TupleAddressInput] }, TupleObjInTupleUpdate>, 1, Test.Pass>(),
  // Per-element update (object form)
  Test.check<Extends<{ place: LocatedUpdate }, TupleObjInTupleUpdate>, 1, Test.Pass>(),
]);

// TupleDeepNestUpdate: deep nested — array/object disambiguation
Test.checks([
  // Per-element update (object form)
  Test.check<Extends<{ deep: DeepOuterTupleUpdate }, TupleDeepNestUpdate>, 1, Test.Pass>(),
  // Full replace (array form)
  Test.check<Extends<{ deep: [string, DeepMidTupleInput] }, TupleDeepNestUpdate>, 1, Test.Pass>(),
]);

// TupleDeepNestUpdate: optional deep field accepts CerialNone
Test.checks([Test.check<Extends<{ deepOpt: CerialNone }, TupleDeepNestUpdate>, 1, Test.Pass>()]);

// =============================================================================
// Array tuples do NOT get per-element update
// =============================================================================

// TupleBasicUpdate: array tuple uses push/set, not per-element
Test.checks([
  Test.check<Extends<{ history: { push: CoordinateInput } }, TupleBasicUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ history: { set: CoordinateInput[] } }, TupleBasicUpdate>, 1, Test.Pass>(),
  // Per-element update should NOT be assignable to array tuple field
  Test.check<Extends<{ history: CoordinateUpdate }, TupleBasicUpdate>, 0, Test.Pass>(),
]);
