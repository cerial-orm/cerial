/**
 * Type checks for generated TupleUpdate types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  CoordinateInput,
  CoordinateUpdate,
  LocatedUpdate,
  LocatedInput,
  DeepOuterTupleUpdate,
  DeepMidTupleUpdate,
  DeepMidTupleInput,
  DeepMidObjInput,
  DeepInnerTupleUpdate,
  DeepInnerTupleInput,
  TupleBasicUpdate,
  TupleObjInTupleUpdate,
  TupleDeepNestUpdate,
  TupleAddress,
  TupleAddressInput,
  WithOptionalUpdate,
} from '../generated';
import type { CerialNone } from 'cerial';

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
// Optional Element with CerialNone
// =============================================================================

// WithOptionalUpdate: optional element gets CerialNone union
Test.checks([
  // Element 0 is required string — no CerialNone
  Test.check<WithOptionalUpdate['0'], string | undefined, Test.Pass>(),
  Test.check<WithOptionalUpdate['text'], string | undefined, Test.Pass>(),
  // Element 1 is optional float — gets CerialNone
  Test.check<WithOptionalUpdate['1'], number | CerialNone | undefined, Test.Pass>(),
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

// DeepOuterTupleUpdate: nested tuple accepts Input | { update: Update }
Test.checks([
  Test.check<DeepOuterTupleUpdate['0'], string | undefined, Test.Pass>(),
  Test.check<DeepOuterTupleUpdate['1'], DeepMidTupleInput | { update: DeepMidTupleUpdate } | undefined, Test.Pass>(),
]);

// DeepOuterTupleUpdate accepts nested per-element update
Test.checks([Test.check<Extends<{ 1: { update: DeepMidTupleUpdate } }, DeepOuterTupleUpdate>, 1, Test.Pass>()]);

// =============================================================================
// Model Update Types with { update } wrapper
// =============================================================================

// TupleBasicUpdate: single tuple field accepts { update: TupleUpdate }
Test.checks([
  // Full replace
  Test.check<Extends<{ location: CoordinateInput }, TupleBasicUpdate>, 1, Test.Pass>(),
  // Per-element update
  Test.check<Extends<{ location: { update: CoordinateUpdate } }, TupleBasicUpdate>, 1, Test.Pass>(),
]);

// TupleObjInTupleUpdate: tuple with objects accepts { update }
Test.checks([
  Test.check<Extends<{ place: LocatedInput }, TupleObjInTupleUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ place: { update: LocatedUpdate } }, TupleObjInTupleUpdate>, 1, Test.Pass>(),
]);

// TupleDeepNestUpdate: deep nested accepts { update }
Test.checks([Test.check<Extends<{ deep: { update: DeepOuterTupleUpdate } }, TupleDeepNestUpdate>, 1, Test.Pass>()]);

// TupleDeepNestUpdate: optional deep field accepts CerialNone
Test.checks([Test.check<Extends<{ deepOpt: CerialNone }, TupleDeepNestUpdate>, 1, Test.Pass>()]);

// =============================================================================
// Array tuples do NOT get per-element update
// =============================================================================

// TupleBasicUpdate: array tuple uses push/set, not { update }
Test.checks([
  Test.check<Extends<{ history: { push: CoordinateInput } }, TupleBasicUpdate>, 1, Test.Pass>(),
  Test.check<Extends<{ history: { set: CoordinateInput[] } }, TupleBasicUpdate>, 1, Test.Pass>(),
  // { update: CoordinateUpdate } should NOT be assignable to history field
  Test.check<Extends<{ history: { update: CoordinateUpdate } }, TupleBasicUpdate>, 0, Test.Pass>(),
]);
