/**
 * Type checks for tuple input types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests that tuple input types accept both array and object forms.
 */

import { Test } from 'ts-toolbelt';
import type {
  CoordinateInput,
  EntryInput,
  LocatedInput,
  OuterInput,
  TupleBasicCreate,
  TupleBasicUpdate,
  WithOptionalInput,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// CoordinateInput Forms
// =============================================================================

// Array form: [number, number]
Test.checks([Test.check<Extends<[number, number], CoordinateInput>, 1, Test.Pass>()]);

// Object form with named keys
Test.checks([Test.check<Extends<{ lat: number; lng: number }, CoordinateInput>, 1, Test.Pass>()]);

// Object form with index keys
Test.checks([Test.check<Extends<{ '0': number; '1': number }, CoordinateInput>, 1, Test.Pass>()]);

// Mixed: named + index keys
Test.checks([Test.check<Extends<{ lat: number; '1': number }, CoordinateInput>, 1, Test.Pass>()]);

// Partial object form (keys are optional)
Test.checks([Test.check<Extends<{ lat: number }, CoordinateInput>, 1, Test.Pass>()]);

// =============================================================================
// EntryInput Forms
// =============================================================================

// Array form: [string, number, boolean]
Test.checks([Test.check<Extends<[string, number, boolean], EntryInput>, 1, Test.Pass>()]);

// Object form with named key for element 0
Test.checks([Test.check<Extends<{ name: string; '1': number; '2': boolean }, EntryInput>, 1, Test.Pass>()]);

// =============================================================================
// Nested Tuple Input (OuterInput)
// =============================================================================

// Array form: [string, InnerInput]
Test.checks([Test.check<Extends<[string, [number, number]], OuterInput>, 1, Test.Pass>()]);

// Object form for inner
Test.checks([Test.check<Extends<{ label: string; '1': [number, number] }, OuterInput>, 1, Test.Pass>()]);

// =============================================================================
// Tuple with Object Element (LocatedInput)
// =============================================================================

// Array form: [string, TupleAddressInput]
Test.checks([Test.check<Extends<[string, { street: string; city: string }], LocatedInput>, 1, Test.Pass>()]);

// =============================================================================
// WithOptional Tuple Input
// =============================================================================

// Array form: [string, number | null]
Test.checks([Test.check<Extends<[string, number], WithOptionalInput>, 1, Test.Pass>()]);

// Object form
Test.checks([Test.check<Extends<{ text: string }, WithOptionalInput>, 1, Test.Pass>()]);

// =============================================================================
// Model-level Create Input
// =============================================================================

// Create accepts tuple in array form
Test.checks([Test.check<Extends<{ name: string; location: [number, number] }, TupleBasicCreate>, 1, Test.Pass>()]);

// Create accepts tuple in object form
Test.checks([
  Test.check<Extends<{ name: string; location: { lat: number; lng: number } }, TupleBasicCreate>, 1, Test.Pass>(),
]);

// Create: optional tuple can be omitted
Test.checks([Test.check<Extends<{ name: string; location: [number, number] }, TupleBasicCreate>, 1, Test.Pass>()]);

// Create: history (array of tuples) can be omitted (defaults to [])
Test.checks([Test.check<Extends<{ name: string; location: [number, number] }, TupleBasicCreate>, 1, Test.Pass>()]);

// =============================================================================
// Model-level Update Input
// =============================================================================

// Update accepts tuple full replace
Test.checks([Test.check<Extends<{ location: [number, number] }, TupleBasicUpdate>, 1, Test.Pass>()]);

// Update accepts array tuple push
Test.checks([Test.check<Extends<{ history: { push: [number, number] } }, TupleBasicUpdate>, 1, Test.Pass>()]);

// Update accepts array tuple set
Test.checks([Test.check<Extends<{ history: { set: [number, number][] } }, TupleBasicUpdate>, 1, Test.Pass>()]);

// Update: all fields are optional
Test.checks([Test.check<Extends<{}, TupleBasicUpdate>, 1, Test.Pass>()]);
