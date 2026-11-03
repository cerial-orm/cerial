/**
 * Type checks that pin what a generated `{Model}Select` accepts and refuses.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Each `@ts-expect-error` fails the build when the select it covers starts compiling, so a select form that is
 * looser than the at-least-one-key union cannot land unnoticed. The method section goes through `findMany`, where the
 * select is inferred from the argument and a typo next to a valid key needs `SelectArg` to be refused.
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  AddressSelect,
  GeoPointSelect,
  GetObjectTestUserPayload,
  GetRelObjCompanyPayload,
  GetTupleObjInTuplePayload,
  GetUnsetTestPayload,
  ObjectTestUserSelect,
} from '../../generated';
import type { CerialClient } from '../../generated/client';
import type { Flat } from '../helpers';

declare const db: CerialClient['db'];

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

// =============================================================================
// Refusals through a method call, where `select` is inferred from the argument
// =============================================================================

// @ts-expect-error -- a typo next to a valid key is refused
export const callTypoNextToKey = db.ObjectTestUser.findMany({ select: { name: true, nope: true } });

// @ts-expect-error -- a typo alone is refused
export const callTypoAlone = db.ObjectTestUser.findMany({ select: { nope: true } });

// @ts-expect-error -- a typo inside a nested object select is refused
export const callNestedTypo = db.ObjectTestUser.findMany({ select: { address: { nope: true } } });

// @ts-expect-error -- a typo next to a valid sub-key of a nested object select is refused
export const callNestedTypoNextToKey = db.ObjectTestUser.findMany({ select: { address: { city: true, nope: true } } });

export const callDeepTypo = db.ObjectTestUser.findMany({
  // @ts-expect-error -- a typo two object levels down, next to valid keys, is refused
  select: { locations: { label: { city: true, nope: true } } },
});

export const callOk = db.ObjectTestUser.findMany({ select: { name: true, address: { city: true } } });
export const callFalseKeys = db.ObjectTestUser.findMany({ select: { name: true, address: false } });

// A recursive `SelectArg`/`Parameters` formulation can silently turn the whole signature into `never`
type FindManyArgs = Parameters<typeof db.ObjectTestUser.findMany>;
Test.checks([
  Test.check<[FindManyArgs] extends [never] ? 1 : 0, 0, Test.Pass>(),
  Test.check<undefined extends FindManyArgs[0] ? 1 : 0, 1, Test.Pass>(),
  Test.check<'select' extends keyof NonNullable<FindManyArgs[0]> ? 1 : 0, 1, Test.Pass>(),
]);

// @flexible is per field: it takes undeclared sub-keys, a strict field of the same object type does not
export const flexibleSubKey = db.FlexUser.findMany({ select: { address: { city: true, extra: true } } });
export const strictSubKey = db.FlexUser.findMany({
  // @ts-expect-error -- a strict field refuses an undeclared sub-key
  select: { strictAddress: { city: true, extra: true } },
});

// =============================================================================
// Depth: the typo check covers the first six select levels (the model's own keys are level 1)
// =============================================================================

// UnsetTest.tree is a self-referencing object, so its select nests as deep as the caller writes.
// Level 6 is the last checked one: model, tree, child, child, child, child.
export const depthLastCheckedTypo = db.UnsetTest.findMany({
  // @ts-expect-error -- a typo at the last checked level is refused
  select: { tree: { child: { child: { child: { child: { nope: true } } } } } },
});

export const depthLastCheckedTypoNextToKey = db.UnsetTest.findMany({
  // @ts-expect-error -- a typo at the last checked level, next to a valid key, is refused
  select: { tree: { child: { child: { child: { child: { payload: true, nope: true } } } } } },
});

export const depthLastChecked = db.UnsetTest.findMany({
  select: { tree: { child: { child: { child: { child: { payload: true } } } } } },
});

// Level 7 is past the cap: an unknown key compiles there, and a valid selection still compiles and narrows
export const depthPastCap = db.UnsetTest.findMany({
  select: { tree: { child: { child: { child: { child: { child: { payload: true } } } } } } },
});
// The documented limit of the cap: a typo this deep is not caught, so this must keep compiling
export const depthPastCapTypo = db.UnsetTest.findMany({
  select: { tree: { child: { child: { child: { child: { child: { payload: true, nope: true } } } } } } },
});
export const depthFarPastCap = db.UnsetTest.findMany({
  select: {
    tree: { child: { child: { child: { child: { child: { child: { child: { child: { payload: true } } } } } } } } },
  },
});

type DeepSelect = {
  tree: { child: { child: { child: { child: { child: { child: { child: { child: { payload: true } } } } } } } } };
};
type DeepNarrowed = GetUnsetTestPayload<DeepSelect, undefined>;
type DeepLeaf = NonNullable<
  NonNullable<
    NonNullable<
      NonNullable<
        NonNullable<
          NonNullable<NonNullable<NonNullable<NonNullable<DeepNarrowed['tree']>['child']>['child']>['child']>['child']
        >['child']
      >['child']
    >['child']
  >['child']
>;

Test.checks([
  Test.check<keyof DeepNarrowed, 'tree', Test.Pass>(),
  Test.check<keyof DeepLeaf, 'payload', Test.Pass>(),
  Test.check<DeepLeaf['payload'], string, Test.Pass>(),
]);
