/**
 * Type checks for tuple input types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests that tuple input types accept both array and object forms.
 *
 * Every shape is compared with `Test.check`, which fails on a wider or a
 * narrower type.
 */

import type { CerialNone } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  CoordinateInput,
  CoordinateUpdate,
  EntryInput,
  InnerInput,
  LocatedInput,
  OuterInput,
  TupleAddressInput,
  TupleBasicCreate,
  TupleBasicUpdate,
  WithOptionalInput,
} from '../../generated';
import type { Flat, IsOptional } from '../helpers';

const { checks, check } = Test;

// =============================================================================
// Each tuple input is the array form or an object keyed by index and by name
// =============================================================================

checks([
  check<CoordinateInput, [number, number] | { 0?: number; lat?: number; 1?: number; lng?: number }, Test.Pass>(),
  check<EntryInput, [string, number, boolean] | { 0?: string; name?: string; 1?: number; 2?: boolean }, Test.Pass>(),
  // A nested tuple takes the nested tuple's own input form
  check<OuterInput, [string, InnerInput] | { 0?: string; label?: string; 1?: InnerInput }, Test.Pass>(),
  // An object element takes the object's input type
  check<LocatedInput, [string, TupleAddressInput] | { 0?: string; tag?: string; 1?: TupleAddressInput }, Test.Pass>(),
  // A @nullable element widens to `| null` in both forms
  check<WithOptionalInput, [string, number | null] | { 0?: string; text?: string; 1?: number | null }, Test.Pass>(),
]);

// =============================================================================
// Accepted forms
// =============================================================================

export const coordArray: CoordinateInput = [1, 2];
export const coordNamed: CoordinateInput = { lat: 1, lng: 2 };
export const coordIndexed: CoordinateInput = { '0': 1, '1': 2 };
export const coordMixed: CoordinateInput = { lat: 1, '1': 2 };
export const coordPartial: CoordinateInput = { lat: 1 };
export const entryNamed: EntryInput = { name: 'a', '1': 1, '2': true };
export const outerNested: OuterInput = ['a', [1, 2]];
export const outerObject: OuterInput = { label: 'a', '1': [1, 2] };
export const locatedArray: LocatedInput = ['a', { street: 's', city: 'c' }];
export const optionalNull: WithOptionalInput = ['a', null];
export const optionalObject: WithOptionalInput = { text: 'a' };

// =============================================================================
// Model-level create: the tuple field takes either form, the others may be omitted
// =============================================================================

checks([
  check<IsOptional<TupleBasicCreate, 'backup'>, 1, Test.Pass>(),
  check<IsOptional<TupleBasicCreate, 'history'>, 1, Test.Pass>(),
  check<IsOptional<TupleBasicCreate, 'entry'>, 1, Test.Pass>(),
  check<IsOptional<TupleBasicCreate, 'location'>, 0, Test.Pass>(),
  check<TupleBasicCreate['location'], CoordinateInput, Test.Pass>(),
  check<TupleBasicCreate['history'], CoordinateInput[] | undefined, Test.Pass>(),
]);

export const createArray: TupleBasicCreate = { name: 'n', location: [1, 2] };
export const createObject: TupleBasicCreate = { name: 'n', location: { lat: 1, lng: 2 } };

// =============================================================================
// Model-level update: full replace, per-element update, array push and set
// =============================================================================

checks([
  check<TupleBasicUpdate['location'], [number, number] | CoordinateUpdate | undefined, Test.Pass>(),
  check<TupleBasicUpdate['backup'], [number, number] | CoordinateUpdate | CerialNone | undefined, Test.Pass>(),
  check<
    Flat<TupleBasicUpdate['history']>,
    Flat<CoordinateInput[] | { push?: CoordinateInput | CoordinateInput[]; set?: CoordinateInput[] } | undefined>,
    Test.Pass
  >(),
  check<IsOptional<TupleBasicUpdate, 'location'>, 1, Test.Pass>(),
  check<IsOptional<TupleBasicUpdate, 'history'>, 1, Test.Pass>(),
]);

export const updateReplace: TupleBasicUpdate = { location: [1, 2] };
export const updatePush: TupleBasicUpdate = { history: { push: [1, 2] } };
export const updateSet: TupleBasicUpdate = { history: { set: [[1, 2]] } };
// oxlint-disable-next-line typescript/no-empty-object-type -- {} intentionally tests empty object assignability
export const updateNothing: TupleBasicUpdate = {};

// =============================================================================
// Negative
// =============================================================================

// @ts-expect-error - an element has the tuple's declared type
export const wrongElement: CoordinateInput = ['a', 2];

// @ts-expect-error - the object form only offers the declared keys
export const unknownKey: CoordinateInput = { x: 1 };

// @ts-expect-error - a required element is not nullable
export const nullRequired: CoordinateInput = [null, 2];

// @ts-expect-error - a nested tuple element still has to fit the nested tuple's element types
export const badNested: OuterInput = ['a', ['x', 2]];

// @ts-expect-error - the location is required on create
export const noLocation: TupleBasicCreate = { name: 'n' };
