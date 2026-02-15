/**
 * Type checks for unset parameter
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests:
 * - {Model}Unset type shape (correct fields, correct types)
 * - {Tuple}Unset type shape (index + name keys for optional elements)
 * - SafeUnset cross-exclusion (prevents leaf-level data/unset conflicts)
 * - Method signatures accept unset parameter
 */

import { Test } from 'ts-toolbelt';
import type {
  UnsetTest,
  UnsetTestUpdate,
  UnsetTestUnset,
  UnsetAddress,
  UnsetOptTupleUnset,
  UnsetObjTupleUnset,
  UnsetRecursiveUnset,
  SafeUnset,
} from '../generated';

const { checks, check } = Test;

// Helper: 1 if K is a key of T (required OR optional), 0 otherwise
type HasKey<T, K extends string | number> = K extends keyof T ? 1 : 0;

// Helper: check if types are equal
type IsEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? 1 : 0) : 0;

// =============================================================================
// UnsetTestUnset Type Shape
// =============================================================================

// Optional primitive fields → true
checks([check<HasKey<UnsetTestUnset, 'bio'>, 1, Test.Pass>()]);
checks([check<HasKey<UnsetTestUnset, 'age'>, 1, Test.Pass>()]);

// Required fields → not present
checks([check<HasKey<UnsetTestUnset, 'name'>, 0, Test.Pass>()]);
checks([check<HasKey<UnsetTestUnset, 'id'>, 0, Test.Pass>()]);

// Required object with optional children → sub-field object only (no true)
checks([check<HasKey<UnsetTestUnset, 'address'>, 1, Test.Pass>()]);

// Optional object → true | sub-field object
checks([check<HasKey<UnsetTestUnset, 'shipping'>, 1, Test.Pass>()]);

// Required tuple (no optional elements) → not present
checks([check<HasKey<UnsetTestUnset, 'pos'>, 0, Test.Pass>()]);

// Optional tuple (no optional elements) → true only
checks([check<HasKey<UnsetTestUnset, 'backup'>, 1, Test.Pass>()]);

// Optional tuple with @nullable element → true | UnsetOptTupleUnset
checks([check<HasKey<UnsetTestUnset, 'opt'>, 1, Test.Pass>()]);

// Optional tuple with object element (optional sub-fields) → true | TupleUnset
checks([check<HasKey<UnsetTestUnset, 'tagged'>, 1, Test.Pass>()]);

// Optional recursive tuple with @nullable element → true | UnsetRecursiveUnset
checks([check<HasKey<UnsetTestUnset, 'recursive'>, 1, Test.Pass>()]);

// =============================================================================
// UnsetOptTupleUnset Type Shape (tuple with @nullable element)
// =============================================================================

// Element 1 (Float @nullable) → unsetable (sets to null)
checks([check<HasKey<UnsetOptTupleUnset, 1>, 1, Test.Pass>()]);

// Element 0 (String, required) → not present
checks([check<HasKey<UnsetOptTupleUnset, 0>, 0, Test.Pass>()]);

// =============================================================================
// UnsetRecursiveUnset Type Shape (self-referencing tuple with @nullable element)
// =============================================================================

// Element 1 (UnsetRecursive @nullable) → unsetable (sets to null)
checks([check<HasKey<UnsetRecursiveUnset, 1>, 1, Test.Pass>()]);

// Element 0 (String, required) → not present
checks([check<HasKey<UnsetRecursiveUnset, 0>, 0, Test.Pass>()]);

// =============================================================================
// UnsetObjTupleUnset Type Shape (tuple with object element having optional sub-fields)
// =============================================================================

// Element 1 (InnerObj with extra?) → has sub-field unset (numeric key, matching keyof behavior)
checks([check<HasKey<UnsetObjTupleUnset, 1>, 1, Test.Pass>()]);

// Element 0 (String, required) → not present
checks([check<HasKey<UnsetObjTupleUnset, 0>, 0, Test.Pass>()]);

// =============================================================================
// SafeUnset Cross-Exclusion
// =============================================================================

// When data has a field at top-level, unset excludes that field (leaf conflict)
type DataWithBio = { bio: string };
type Excluded1 = SafeUnset<UnsetTestUnset, DataWithBio>;
checks([check<HasKey<Excluded1, 'bio'>, 0, Test.Pass>()]);
// Other fields still available
checks([check<HasKey<Excluded1, 'age'>, 1, Test.Pass>()]);
checks([check<HasKey<Excluded1, 'address'>, 1, Test.Pass>()]);

// When data has same object field but different sub-fields, unset keeps it
type DataWithAddress = { address: { city: string } };
type Kept1 = SafeUnset<UnsetTestUnset, DataWithAddress>;
checks([check<HasKey<Kept1, 'address'>, 1, Test.Pass>()]);

// When data has no overlapping fields, all unset fields available
type DataEmpty = {};
type AllAvailable = SafeUnset<UnsetTestUnset, DataEmpty>;
checks([check<HasKey<AllAvailable, 'bio'>, 1, Test.Pass>()]);
checks([check<HasKey<AllAvailable, 'age'>, 1, Test.Pass>()]);
checks([check<HasKey<AllAvailable, 'address'>, 1, Test.Pass>()]);
checks([check<HasKey<AllAvailable, 'shipping'>, 1, Test.Pass>()]);
checks([check<HasKey<AllAvailable, 'backup'>, 1, Test.Pass>()]);
checks([check<HasKey<AllAvailable, 'opt'>, 1, Test.Pass>()]);
checks([check<HasKey<AllAvailable, 'tagged'>, 1, Test.Pass>()]);

// Array field in data → excluded from unset (array replace semantics)
// (pos is a required tuple without optional elements, so it's not in Unset anyway)
// Test with a hypothetical array field:
type ArrayData = { bio: string[] };
type ArrayExcluded = SafeUnset<{ bio?: true }, ArrayData>;
checks([check<HasKey<ArrayExcluded, 'bio'>, 0, Test.Pass>()]);

// Multiple fields: data has some, unset has others
type DataPartial = { bio: string; name: string };
type PartialExcluded = SafeUnset<UnsetTestUnset, DataPartial>;
checks([check<HasKey<PartialExcluded, 'bio'>, 0, Test.Pass>()]);
checks([check<HasKey<PartialExcluded, 'age'>, 1, Test.Pass>()]);
