/**
 * Type checks that pin what a generated `{Model}Select` accepts and refuses.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Each `@ts-expect-error` fails the build when the select it covers starts compiling, so a select form that is
 * looser than the at-least-one-key union cannot land unnoticed.
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  AddressSelect,
  GeoPointSelect,
  GetObjectTestUserPayload,
  GetRelObjCompanyPayload,
  GetTupleObjInTuplePayload,
  ObjectTestUserSelect,
} from '../../generated';
import type { Flat } from '../helpers';

// =============================================================================
// Refusals on a model
// =============================================================================

// @ts-expect-error -- a select with no key is refused
export const modelEmpty: ObjectTestUserSelect = {};

// @ts-expect-error -- a key the model does not have is refused
export const modelUnknownKey: ObjectTestUserSelect = { name: true, nope: true };

// @ts-expect-error -- an unknown key alone does not satisfy the at-least-one rule
export const modelOnlyUnknownKey: ObjectTestUserSelect = { nope: true };

// @ts-expect-error -- a scalar field takes a boolean, not a sub-select
export const modelScalarSubSelect: ObjectTestUserSelect = { name: { first: true } };

// @ts-expect-error -- an object field refuses a key the object does not have
export const modelWrongSubKey: ObjectTestUserSelect = { address: { nope: true } };

// @ts-expect-error -- an object sub-select with no key is refused
export const modelEmptySubSelect: ObjectTestUserSelect = { address: {} };

// =============================================================================
// Refusals on an embedded object
// =============================================================================

// @ts-expect-error -- a select with no key is refused
export const objectEmpty: AddressSelect = {};

// @ts-expect-error -- a key the object does not have is refused
export const objectUnknownKey: AddressSelect = { street: true, nope: true };

// @ts-expect-error -- a scalar field takes a boolean, not a sub-select
export const objectScalarSubSelect: AddressSelect = { street: { first: true } };

// @ts-expect-error -- a nested object refuses a key it does not have
export const objectWrongSubKey: GeoPointSelect = { label: { nope: true } };

// @ts-expect-error -- a nested object sub-select with no key is refused
export const objectEmptySubSelect: GeoPointSelect = { label: {} };

// =============================================================================
// Accepted forms
// =============================================================================

export const modelOneKey: ObjectTestUserSelect = { name: true };
export const modelFalseKey: ObjectTestUserSelect = { name: true, address: false };
export const modelNested: ObjectTestUserSelect = { address: { city: true }, locations: { label: { city: true } } };
export const objectOneKey: AddressSelect = { zipCode: false, city: true };

// =============================================================================
// Narrowed results
// =============================================================================

type Narrowed = GetObjectTestUserPayload<
  {
    name: true;
    address: { city: true };
    shipping: { street: true };
    locations: { lat: true; label: { city: true } };
    primaryLocation: { lng: true };
  },
  undefined
>;

Test.checks([
  Test.check<Narrowed['name'], string, Test.Pass>(),
  Test.check<Flat<Narrowed['address']>, { city: string }, Test.Pass>(),
  Test.check<keyof Narrowed['address'], 'city', Test.Pass>(),
  // An optional object stays possibly undefined after it is narrowed
  Test.check<undefined extends Narrowed['shipping'] ? 1 : 0, 1, Test.Pass>(),
  Test.check<undefined extends Narrowed['address'] ? 1 : 0, 0, Test.Pass>(),
  Test.check<NonNullable<Narrowed['shipping']>['street'], string, Test.Pass>(),
  Test.check<keyof NonNullable<Narrowed['shipping']>, 'street', Test.Pass>(),
  // An object array narrows each element, and a nested optional object inside it
  Test.check<Narrowed['locations'][number]['lat'], number, Test.Pass>(),
  Test.check<keyof Narrowed['locations'][number], 'lat' | 'label', Test.Pass>(),
  Test.check<NonNullable<Narrowed['locations'][number]['label']>['city'], string, Test.Pass>(),
  Test.check<NonNullable<Narrowed['primaryLocation']>['lng'], number, Test.Pass>(),
  Test.check<keyof NonNullable<Narrowed['primaryLocation']>, 'lng', Test.Pass>(),
  // Keys that were not selected are absent
  Test.check<'id' extends keyof Narrowed ? 1 : 0, 0, Test.Pass>(),
]);

type DroppedKeys = GetObjectTestUserPayload<{ name: true; address: false; id: false }, undefined>;

Test.checks([Test.check<keyof DroppedKeys, 'name', Test.Pass>(), Test.check<DroppedKeys['name'], string, Test.Pass>()]);

type DroppedSubKeys = GetObjectTestUserPayload<{ address: { city: true; street: false } }, undefined>;

Test.checks([Test.check<Flat<DroppedSubKeys['address']>, { city: string }, Test.Pass>()]);

// A tuple with an object element narrows through the element's index
type TupleNarrowed = GetTupleObjInTuplePayload<{ place: { 1: { street: true } } }, undefined>;

Test.checks([
  Test.check<keyof TupleNarrowed, 'place', Test.Pass>(),
  Test.check<TupleNarrowed['place'][0], string, Test.Pass>(),
  Test.check<TupleNarrowed['place'][1]['street'], string, Test.Pass>(),
  Test.check<keyof TupleNarrowed['place'][1], 'street', Test.Pass>(),
]);

// A select inside an include narrows the included rows
type IncludedSelect = GetRelObjCompanyPayload<{ name: true }, { employees: { select: { name: true } } }>;

Test.checks([
  Test.check<Flat<IncludedSelect['employees']>, { name: string }[], Test.Pass>(),
  Test.check<IncludedSelect['name'], string, Test.Pass>(),
  Test.check<'id' extends keyof IncludedSelect ? 1 : 0, 0, Test.Pass>(),
]);

type IncludedObjectSelect = GetRelObjCompanyPayload<
  undefined,
  { employees: { select: { homeAddress: { city: true } } } }
>;

Test.checks([
  Test.check<Flat<IncludedObjectSelect['employees']>, { homeAddress: { city: string } }[], Test.Pass>(),
  Test.check<IncludedObjectSelect['id'], CerialId<string>, Test.Pass>(),
]);
