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
 *
 * Every shape is compared with `Test.check`, which fails on a wider or a
 * narrower type, so a key that gains or loses a variant is caught.
 */

import { Test } from 'ts-toolbelt';
import type { Empty } from '../helpers';
import type {
  BookUnset,
  PublisherUnset,
  SafeUnset,
  UnsetDeepTupleUnset,
  UnsetObjTupleUnset,
  UnsetOptTupleUnset,
  UnsetRecursiveUnset,
  UnsetTestUnset,
} from '../../generated';

const { checks, check } = Test;

// =============================================================================
// UnsetTestUnset: the full shape
// =============================================================================

type NestedUnset = {
  mid?: {
    score?: true;
    deep?: {
      note?: true;
    };
  };
  desc?: true;
};

type ExpectedUnsetTestUnset = {
  bio?: true;
  age?: true;
  address?: { zip?: true };
  shipping?: true | { zip?: true };
  backup?: true;
  opt?: true | UnsetOptTupleUnset;
  tagged?: true | UnsetObjTupleUnset;
  nested?: NestedUnset;
  optNested?: true | NestedUnset;
  deepTuple?: true | UnsetDeepTupleUnset;
  tree?: true | { extra?: true; child?: true };
  recursive?: true | UnsetRecursiveUnset;
};

checks([check<UnsetTestUnset, ExpectedUnsetTestUnset, Test.Pass>()]);

// Required fields (name, id) and required tuples without optional elements (pos) are not unsettable
checks([check<keyof UnsetTestUnset & ('name' | 'id' | 'pos'), never, Test.Pass>()]);

// Optional primitives accept `true` only; a required object offers its optional children only
checks([
  check<UnsetTestUnset['bio'], true | undefined, Test.Pass>(),
  check<UnsetTestUnset['age'], true | undefined, Test.Pass>(),
  check<UnsetTestUnset['address'], { zip?: true } | undefined, Test.Pass>(),
  // An optional object additionally accepts `true` for the whole field
  check<UnsetTestUnset['shipping'], true | { zip?: true } | undefined, Test.Pass>(),
  check<UnsetTestUnset['backup'], true | undefined, Test.Pass>(),
]);

// =============================================================================
// Tuple unset shapes
// =============================================================================

checks([
  // Only the @nullable element 1 is unsettable (to null); element 0 is required
  check<UnsetOptTupleUnset, { 1?: true }, Test.Pass>(),
  // Self-referencing tuple: element 1 takes `true` or the same shape again
  check<UnsetRecursiveUnset, { 1?: true | UnsetRecursiveUnset }, Test.Pass>(),
  // Object element: sub-field unset, keyed by index
  check<UnsetObjTupleUnset, { 1?: { extra?: true } }, Test.Pass>(),
  check<UnsetDeepTupleUnset, { 1?: { score?: true; deep?: { note?: true } } }, Test.Pass>(),
]);

// =============================================================================
// Models whose only unsettable field is an optional foreign key
// =============================================================================

checks([
  check<BookUnset, { publisherId?: true }, Test.Pass>(),
  // A model with nothing optional has an empty unset
  check<keyof PublisherUnset, never, Test.Pass>(),
]);

// =============================================================================
// SafeUnset cross-exclusion
// =============================================================================

// A leaf in data removes that key from unset; every other key is untouched
type DataWithBio = { bio: string };
checks([check<SafeUnset<UnsetTestUnset, DataWithBio>, Omit<ExpectedUnsetTestUnset, 'bio'>, Test.Pass>()]);

// Same object field in data with different sub-fields: the key stays, with the shared leaves removed
type DataWithAddress = { address: { city: string } };
checks([check<SafeUnset<UnsetTestUnset, DataWithAddress>['address'], { zip?: true } | undefined, Test.Pass>()]);

// A sub-field that data also sets is removed from the nested unset
type DataWithAddressZip = { address: { zip: string } };
checks([check<SafeUnset<UnsetTestUnset, DataWithAddressZip>['address'], Empty | undefined, Test.Pass>()]);

// No overlap: unset is unchanged
// oxlint-disable-next-line typescript/no-empty-object-type -- {} intentionally tests empty object assignability
type DataEmpty = {};
checks([check<SafeUnset<UnsetTestUnset, DataEmpty>, ExpectedUnsetTestUnset, Test.Pass>()]);

// An array in data removes the key (array replace semantics)
type ArrayData = { bio: string[] };
checks([check<SafeUnset<{ bio?: true }, ArrayData>, Empty, Test.Pass>()]);

// Several overlapping leaves
type DataPartial = { bio: string; name: string };
checks([check<SafeUnset<UnsetTestUnset, DataPartial>, Omit<ExpectedUnsetTestUnset, 'bio'>, Test.Pass>()]);

// =============================================================================
// Negative: values the unset types refuse
// =============================================================================

// @ts-expect-error - unset takes `true`, not `false`
export const falseUnset: UnsetTestUnset = { bio: false };

// @ts-expect-error - a required field cannot be unset
export const requiredUnset: UnsetTestUnset = { name: true };

// @ts-expect-error - a required object offers its children, not the whole field
export const wholeRequiredObject: UnsetTestUnset = { address: true };

// @ts-expect-error - tuple element 0 is required
export const requiredElement: UnsetOptTupleUnset = { 0: true };

// @ts-expect-error - an object has no sub-field named 'bogus'
export const unknownSubField: UnsetTestUnset = { address: { bogus: true } };
