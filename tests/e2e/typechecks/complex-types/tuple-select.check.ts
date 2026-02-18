/**
 * Type checks for generated TupleSelect types and payload narrowing
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  DeepInnerTupleSelect,
  DeepMidTupleSelect,
  DeepOuterTupleSelect,
  GetTupleDeepNestPayload,
  GetTupleObjInTuplePayload,
  Located,
  LocatedSelect,
  TupleBasicSelect,
  TupleDeepNestSelect,
  TupleObjInTupleSelect,
} from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;
type HasKey<T, K extends string | number> = K extends keyof T ? 1 : 0;

// =============================================================================
// Tuple Select Type Shape — Only tuples with objects get Select types
// =============================================================================

// LocatedSelect: only object element (index 1) is selectable
Test.checks([
  Test.check<HasKey<LocatedSelect, 1>, 1, Test.Pass>(),
  // Primitive element 0 is NOT in select type
  Test.check<HasKey<LocatedSelect, 0>, 0, Test.Pass>(),
  Test.check<HasKey<LocatedSelect, 'tag'>, 0, Test.Pass>(),
]);

// LocatedSelect element accepts boolean | TupleAddressSelect
Test.checks([
  Test.check<Extends<{ 1: true }, LocatedSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ 1: { city: true } }, LocatedSelect>, 1, Test.Pass>(),
]);

// DeepOuterTupleSelect: nested tuple element (numeric key)
Test.checks([
  Test.check<HasKey<DeepOuterTupleSelect, 1>, 1, Test.Pass>(),
  Test.check<HasKey<DeepOuterTupleSelect, 0>, 0, Test.Pass>(),
]);

// DeepMidTupleSelect: object element
Test.checks([Test.check<HasKey<DeepMidTupleSelect, 1>, 1, Test.Pass>()]);

// DeepInnerTupleSelect: object element
Test.checks([Test.check<HasKey<DeepInnerTupleSelect, 1>, 1, Test.Pass>()]);

// =============================================================================
// Coordinate (all-primitive) does NOT have a Select type
// =============================================================================

// TupleBasicSelect: primitive-only tuple fields are boolean only
Test.checks([
  // location is Coordinate (no objects) → boolean only
  Test.check<Extends<{ location: true }, TupleBasicSelect>, 1, Test.Pass>(),
  // Object select should not be assignable to boolean-only field
  Test.check<Extends<{ location: { 0: true } }, TupleBasicSelect>, 0, Test.Pass>(),
]);

// =============================================================================
// Model Select includes TupleSelect for tuples with objects
// =============================================================================

// TupleObjInTupleSelect: place field accepts boolean | LocatedSelect
Test.checks([
  Test.check<Extends<{ place: true }, TupleObjInTupleSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ place: { 1: { city: true } } }, TupleObjInTupleSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ place: { 1: true } }, TupleObjInTupleSelect>, 1, Test.Pass>(),
]);

// TupleDeepNestSelect: deep field accepts boolean | DeepOuterTupleSelect
Test.checks([
  Test.check<Extends<{ deep: true }, TupleDeepNestSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ deep: { 1: { 1: { name: true } } } }, TupleDeepNestSelect>, 1, Test.Pass>(),
]);

// =============================================================================
// GetPayload Type Narrowing with Tuple Select
// =============================================================================

// No select → full type
Test.checks([
  Test.check<GetTupleObjInTuplePayload['id'], CerialId<string>, Test.Pass>(),
  Test.check<GetTupleObjInTuplePayload['place'], Located, Test.Pass>(),
]);

// Boolean true select → full type preserved
type PayloadBool = GetTupleObjInTuplePayload<{ place: true }>;
Test.checks([Test.check<PayloadBool['place'], Located, Test.Pass>()]);

// Sub-field select → tuple with narrowed object
// Use concrete type aliases to help TypeScript resolve through A.Compute
type PayloadNarrow = GetTupleObjInTuplePayload<{ place: { 1: { city: true } } }>;

// Verify the narrowed payload has the place field
Test.checks([Test.check<HasKey<PayloadNarrow, 'place'>, 1, Test.Pass>()]);

// Verify element 0 is still string
Test.checks([Test.check<PayloadNarrow['place'][0], string, Test.Pass>()]);

// Verify element 1 is narrowed to { city: string }
Test.checks([Test.check<PayloadNarrow['place'][1], { city: string }, Test.Pass>()]);

// =============================================================================
// Deep Nest Payload Narrowing
// =============================================================================

// Select mid-level object field
type DeepPayloadMid = GetTupleDeepNestPayload<{ deep: { 1: { 1: { name: true } } } }>;
Test.checks([
  // Outer element 0 preserved as string
  Test.check<DeepPayloadMid['deep'][0], string, Test.Pass>(),
  // Mid element 0 preserved as string
  Test.check<DeepPayloadMid['deep'][1][0], string, Test.Pass>(),
  // Mid object narrowed to { name: string }
  Test.check<DeepPayloadMid['deep'][1][1], { name: string }, Test.Pass>(),
]);

// Select deepest object field
type DeepPayloadDeep = GetTupleDeepNestPayload<{
  deep: { 1: { 1: { pos: { 1: { value: true } } } } };
}>;
Test.checks([
  Test.check<DeepPayloadDeep['deep'][0], string, Test.Pass>(),
  Test.check<DeepPayloadDeep['deep'][1][0], string, Test.Pass>(),
  // Mid object narrowed to { pos: ... }
  Test.check<HasKey<DeepPayloadDeep['deep'][1][1], 'pos'>, 1, Test.Pass>(),
  // Inner tuple element 0 preserved as number
  Test.check<DeepPayloadDeep['deep'][1][1]['pos'][0], number, Test.Pass>(),
  // Deepest object narrowed to { value: string }
  Test.check<DeepPayloadDeep['deep'][1][1]['pos'][1], { value: string }, Test.Pass>(),
]);
