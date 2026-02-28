/**
 * Type checks for generated object types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  Address,
  AddressInput,
  AddressOrderBy,
  AddressSelect,
  AddressWhere,
  GeoPoint,
  GeoPointInput,
  GeoPointOrderBy,
  GeoPointWhere,
  GetObjectTestOrderPayload,
  GetObjectTestUserPayload,
  ObjectTestOrder,
  ObjectTestUser,
  ObjectTestUserCreate,
  ObjectTestUserInput,
  ObjectTestUserOrderBy,
  ObjectTestUserSelect,
  ObjectTestUserUpdate,
  ObjectTestUserWhere,
  OrderItem,
  TreeNode,
  TreeNodeOrderBy,
  TreeNodeSelect,
  TreeNodeWhere,
} from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Object Interface Types
// =============================================================================

Test.checks([
  // Address has required string fields
  Test.check<Address['street'], string, Test.Pass>(),
  Test.check<Address['city'], string, Test.Pass>(),
  Test.check<Address['state'], string, Test.Pass>(),
  // Address has optional zipCode (scalar fields still support null)
  Test.check<Address['zipCode'], string | null | undefined, Test.Pass>(),
]);

// Address does NOT have id field
Test.checks([Test.check<'id' extends keyof Address ? 1 : 0, 0, Test.Pass>()]);

// AddressInput has same fields (no Record fields in Address)
Test.checks([
  Test.check<AddressInput['street'], string, Test.Pass>(),
  Test.check<AddressInput['city'], string, Test.Pass>(),
  Test.check<AddressInput['state'], string, Test.Pass>(),
  Test.check<AddressInput['zipCode'], string | null | undefined, Test.Pass>(),
]);

// GeoPoint has lat/lng and optional nested Address label
Test.checks([
  Test.check<GeoPoint['lat'], number, Test.Pass>(),
  Test.check<GeoPoint['lng'], number, Test.Pass>(),
  // Object-typed optional fields don't support null, only NONE (undefined)
  Test.check<GeoPoint['label'], Address | undefined, Test.Pass>(),
]);

// GeoPointInput uses same types (no Record fields)
Test.checks([
  Test.check<GeoPointInput['lat'], number, Test.Pass>(),
  Test.check<GeoPointInput['lng'], number, Test.Pass>(),
]);

// TreeNode has value and recursive children
Test.checks([
  Test.check<TreeNode['value'], number, Test.Pass>(),
  Test.check<TreeNode['children'], TreeNode[], Test.Pass>(),
]);

// TreeNode recursive type compiles
Test.checks([Test.check<Extends<{ value: 1; children: [{ value: 2; children: [] }] }, TreeNode>, 1, Test.Pass>()]);

// OrderItem has all fields
Test.checks([
  Test.check<OrderItem['productName'], string, Test.Pass>(),
  Test.check<OrderItem['quantity'], number, Test.Pass>(),
  Test.check<OrderItem['price'], number, Test.Pass>(),
  Test.check<OrderItem['tags'], string[], Test.Pass>(),
]);

// =============================================================================
// Model Interface With Object Fields
// =============================================================================

Test.checks([
  // ObjectTestUser.address is required Address
  Test.check<ObjectTestUser['address'], Address, Test.Pass>(),
  // ObjectTestUser.shipping is optional Address (no null for object fields)
  Test.check<ObjectTestUser['shipping'], Address | undefined, Test.Pass>(),
  // ObjectTestUser.locations is required GeoPoint array
  Test.check<ObjectTestUser['locations'], GeoPoint[], Test.Pass>(),
  // ObjectTestUser.primaryLocation is optional GeoPoint (no null for object fields)
  Test.check<ObjectTestUser['primaryLocation'], GeoPoint | undefined, Test.Pass>(),
]);

// Input types use Input variants
Test.checks([
  Test.check<ObjectTestUserInput['address'], AddressInput, Test.Pass>(),
  Test.check<ObjectTestUserInput['shipping'], AddressInput | undefined, Test.Pass>(),
  Test.check<ObjectTestUserInput['locations'], GeoPointInput[], Test.Pass>(),
  Test.check<ObjectTestUserInput['primaryLocation'], GeoPointInput | undefined, Test.Pass>(),
]);

// Same object type used in different model
Test.checks([
  Test.check<ObjectTestOrder['billingAddress'], Address, Test.Pass>(),
  Test.check<ObjectTestOrder['shippingAddress'], Address | undefined, Test.Pass>(),
  Test.check<ObjectTestOrder['items'], OrderItem[], Test.Pass>(),
  Test.check<ObjectTestOrder['metadata'], TreeNode | undefined, Test.Pass>(),
]);

// =============================================================================
// Where Types
// =============================================================================

// AddressWhere has string operators for street
type StreetWhere = Exclude<AddressWhere['street'], string | undefined>;
Test.checks([
  Test.check<Extends<StreetWhere, { eq?: string }>, 1, Test.Pass>(),
  Test.check<Extends<StreetWhere, { neq?: string }>, 1, Test.Pass>(),
  Test.check<Extends<StreetWhere, { contains?: string }>, 1, Test.Pass>(),
]);

// AddressWhere.zipCode accepts null (optional field)
type _ZipCodeWhere = Exclude<AddressWhere['zipCode'], string | undefined>;
// Verify null is part of the union by checking that assigning null to the field is valid
type _ZipCodeAcceptsNull = null extends NonNullable<AddressWhere['zipCode']> ? 0 : 1;
// Instead, verify null is included in the field type
Test.checks([Test.check<Extends<{ zipCode: null }, AddressWhere>, 1, Test.Pass>()]);

// AddressWhere has logical operators
Test.checks([
  Test.check<Extends<AddressWhere, { AND?: AddressWhere[] }>, 1, Test.Pass>(),
  Test.check<Extends<AddressWhere, { OR?: AddressWhere[] }>, 1, Test.Pass>(),
  Test.check<Extends<AddressWhere, { NOT?: AddressWhere }>, 1, Test.Pass>(),
]);

// GeoPointWhere.lat accepts numeric operators
type LatWhere = Exclude<GeoPointWhere['lat'], number | undefined>;
Test.checks([
  Test.check<Extends<LatWhere, { gt?: number }>, 1, Test.Pass>(),
  Test.check<Extends<LatWhere, { gte?: number }>, 1, Test.Pass>(),
  Test.check<Extends<LatWhere, { lt?: number }>, 1, Test.Pass>(),
  Test.check<Extends<LatWhere, { lte?: number }>, 1, Test.Pass>(),
  Test.check<Extends<LatWhere, { between?: [number, number] }>, 1, Test.Pass>(),
]);

// GeoPointWhere.label accepts nested AddressWhere (no null for object fields)
Test.checks([Test.check<Extends<AddressWhere, NonNullable<GeoPointWhere['label']>>, 1, Test.Pass>()]);

// Model where types use object where types
Test.checks([
  // Required object: no null prefix
  Test.check<Extends<AddressWhere, NonNullable<ObjectTestUserWhere['address']>>, 1, Test.Pass>(),
  // Optional object: no null support for object where fields
  Test.check<Extends<AddressWhere, NonNullable<ObjectTestUserWhere['shipping']>>, 1, Test.Pass>(),
  // Array of objects: some/every/none
  Test.check<
    Extends<
      { some?: GeoPointWhere; every?: GeoPointWhere; none?: GeoPointWhere },
      NonNullable<ObjectTestUserWhere['locations']>
    >,
    1,
    Test.Pass
  >(),
  // Optional single: no null support for object where fields
  Test.check<Extends<GeoPointWhere, NonNullable<ObjectTestUserWhere['primaryLocation']>>, 1, Test.Pass>(),
]);

// TreeNodeWhere compiles without infinite type error
Test.checks([
  Test.check<Extends<TreeNodeWhere, { AND?: TreeNodeWhere[] }>, 1, Test.Pass>(),
  Test.check<
    Extends<
      { some?: TreeNodeWhere; every?: TreeNodeWhere; none?: TreeNodeWhere },
      NonNullable<TreeNodeWhere['children']>
    >,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// Create Types
// =============================================================================

// Required object field must be provided
type UserCreateRequiredOnly = {
  name: string;
  address: AddressInput;
};
Test.checks([Test.check<Extends<UserCreateRequiredOnly, ObjectTestUserCreate>, 1, Test.Pass>()]);

// Optional fields can be omitted
type UserCreateWithOptional = {
  name: string;
  address: AddressInput;
  shipping?: AddressInput;
  locations?: GeoPointInput[];
};
Test.checks([Test.check<Extends<UserCreateWithOptional, ObjectTestUserCreate>, 1, Test.Pass>()]);

// =============================================================================
// Update Types
// =============================================================================

// Required single object: merge (partial) or full replace
type AddressPartial = Partial<AddressInput>;
type AddressSetReplace = { set: AddressInput };
Test.checks([
  Test.check<Extends<AddressPartial, NonNullable<ObjectTestUserUpdate['address']>>, 1, Test.Pass>(),
  Test.check<Extends<AddressSetReplace, NonNullable<ObjectTestUserUpdate['address']>>, 1, Test.Pass>(),
]);

// Optional single object: merge or set (no null — object fields don't support null)
Test.checks([
  Test.check<Extends<AddressPartial, NonNullable<ObjectTestUserUpdate['shipping']>>, 1, Test.Pass>(),
  Test.check<Extends<AddressSetReplace, NonNullable<ObjectTestUserUpdate['shipping']>>, 1, Test.Pass>(),
]);

// Array of objects: direct array or operation object
type LocationsDirectArray = GeoPointInput[];
type LocationsPush = { push: GeoPointInput };
type LocationsSet = { set: GeoPointInput[] };
type LocationsUpdateWhere = { updateWhere: { where: GeoPointWhere; data: Partial<GeoPointInput> } };
type LocationsUnset = { unset: { where: GeoPointWhere } };
Test.checks([
  Test.check<Extends<LocationsDirectArray, NonNullable<ObjectTestUserUpdate['locations']>>, 1, Test.Pass>(),
  Test.check<Extends<LocationsPush, NonNullable<ObjectTestUserUpdate['locations']>>, 1, Test.Pass>(),
  Test.check<Extends<LocationsSet, NonNullable<ObjectTestUserUpdate['locations']>>, 1, Test.Pass>(),
  Test.check<Extends<LocationsUpdateWhere, NonNullable<ObjectTestUserUpdate['locations']>>, 1, Test.Pass>(),
  Test.check<Extends<LocationsUnset, NonNullable<ObjectTestUserUpdate['locations']>>, 1, Test.Pass>(),
]);

// =============================================================================
// Select Types
// =============================================================================

// Boolean select for object field
Test.checks([
  Test.check<Extends<{ address: true }, ObjectTestUserSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ address: false }, ObjectTestUserSelect>, 1, Test.Pass>(),
]);

// Sub-field select for object field
Test.checks([Test.check<Extends<{ address: { city: true } }, ObjectTestUserSelect>, 1, Test.Pass>()]);

// AddressSelect requires at least one field
Test.checks([
  Test.check<Extends<{ street: true }, AddressSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ city: true; zipCode: true }, AddressSelect>, 1, Test.Pass>(),
]);

// Nested: locations with sub-field select
Test.checks([Test.check<Extends<{ locations: { lat: true } }, ObjectTestUserSelect>, 1, Test.Pass>()]);

// =============================================================================
// OrderBy Types
// =============================================================================

Test.checks([
  // Object field ordering uses nested OrderBy
  Test.check<ObjectTestUserOrderBy['address'], AddressOrderBy | undefined, Test.Pass>(),
  // AddressOrderBy fields
  Test.check<AddressOrderBy['city'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // Array object ordering
  Test.check<ObjectTestUserOrderBy['locations'], GeoPointOrderBy | undefined, Test.Pass>(),
  // Nested: GeoPoint label is AddressOrderBy
  Test.check<GeoPointOrderBy['label'], AddressOrderBy | undefined, Test.Pass>(),
]);

// =============================================================================
// Self-Referencing Compiles
// =============================================================================

// TreeNode type compiles without infinite type error
const _treeNode: TreeNode = { value: 1, children: [{ value: 2, children: [] }] };

// TreeNodeWhere compiles without infinite type error
const _treeWhere: TreeNodeWhere = { children: { some: { value: { gt: 0 } } } };

// TreeNodeSelect compiles
const _treeSelect: TreeNodeSelect = { value: true, children: { value: true } };

// TreeNodeOrderBy compiles
const _treeOrderBy: TreeNodeOrderBy = { children: { value: 'asc' } };

// =============================================================================
// GetPayload Type Inference — Object Sub-Field Select
// =============================================================================

// No select → full model
type NoSelect = GetObjectTestUserPayload<undefined>;
Test.checks([
  Test.check<NoSelect['address'], Address, Test.Pass>(),
  Test.check<NoSelect['name'], string, Test.Pass>(),
  Test.check<NoSelect['locations'], GeoPoint[], Test.Pass>(),
]);

// Boolean true → full object type
type BooleanSelect = GetObjectTestUserPayload<{ address: true }>;
Test.checks([Test.check<BooleanSelect['address'], Address, Test.Pass>()]);

// Sub-field select → narrowed object type
type SubFieldSelect = GetObjectTestUserPayload<{ address: { city: true } }>;
Test.checks([Test.check<SubFieldSelect['address'], { city: string }, Test.Pass>()]);

// Multiple sub-fields
type MultiSubField = GetObjectTestUserPayload<{ address: { city: true; state: true } }>;
Test.checks([Test.check<MultiSubField['address'], { city: string; state: string }, Test.Pass>()]);

// Array of objects sub-field select → narrowed array
type ArraySubField = GetObjectTestUserPayload<{ locations: { lat: true } }>;
Test.checks([Test.check<ArraySubField['locations'], { lat: number }[], Test.Pass>()]);

// Recursive nested object select (primaryLocation is optional → result includes undefined)
type NestedSubField = GetObjectTestUserPayload<{ primaryLocation: { lat: true; label: { city: true } } }>;
type NestedSubFieldResolved = NonNullable<NestedSubField['primaryLocation']>;
// Verify individual fields of the nested result (after unwrapping undefined)
Test.checks([
  Test.check<NestedSubFieldResolved['lat'], number, Test.Pass>(),
  // label is optional on GeoPoint, so the resolved type preserves undefined
  // A.Compute distributes over the union, test via extends rather than exact match
  Test.check<undefined extends NestedSubFieldResolved['label'] ? 1 : 0, 1, Test.Pass>(),
  Test.check<{ city: string } extends NonNullable<NestedSubFieldResolved['label']> ? 1 : 0, 1, Test.Pass>(),
  Test.check<NonNullable<NestedSubFieldResolved['label']> extends { city: string } ? 1 : 0, 1, Test.Pass>(),
]);
// Verify excluded fields are not present
Test.checks([
  Test.check<'lng' extends keyof NestedSubFieldResolved ? 1 : 0, 0, Test.Pass>(),
  Test.check<'street' extends keyof NonNullable<NestedSubFieldResolved['label']> ? 1 : 0, 0, Test.Pass>(),
]);

// Mixed primitive + object sub-field select
type MixedSelect = GetObjectTestUserPayload<{ name: true; address: { city: true } }>;
Test.checks([
  Test.check<MixedSelect['name'], string, Test.Pass>(),
  Test.check<MixedSelect['address']['city'], string, Test.Pass>(),
]);
// Verify address doesn't have unselected fields
Test.checks([Test.check<'street' extends keyof MixedSelect['address'] ? 1 : 0, 0, Test.Pass>()]);

// Mixed primitive + boolean true for object
type MixedBooleanSelect = GetObjectTestUserPayload<{ name: true; address: true }>;
Test.checks([
  Test.check<MixedBooleanSelect['name'], string, Test.Pass>(),
  Test.check<MixedBooleanSelect['address'], Address, Test.Pass>(),
]);

// Array of objects boolean true → full array
type ArrayBooleanSelect = GetObjectTestUserPayload<{ locations: true }>;
Test.checks([Test.check<ArrayBooleanSelect['locations'], GeoPoint[], Test.Pass>()]);

// Nested: label true within primaryLocation sub-select → primaryLocation is optional, label is optional on GeoPoint
type NestedLabelTrue = GetObjectTestUserPayload<{ primaryLocation: { label: true } }>;
type NestedLabelTrueResolved = NonNullable<NestedLabelTrue['primaryLocation']>;
Test.checks([Test.check<NestedLabelTrueResolved['label'], Address | undefined, Test.Pass>()]);
// Verify only label is selected (lat/lng excluded)
Test.checks([Test.check<'lat' extends keyof NestedLabelTrueResolved ? 1 : 0, 0, Test.Pass>()]);
// Verify primaryLocation itself is optional
Test.checks([Test.check<undefined extends NestedLabelTrue['primaryLocation'] ? 1 : 0, 1, Test.Pass>()]);

// ObjectTestOrder: sub-field select on billingAddress
type OrderSubField = GetObjectTestOrderPayload<{ billingAddress: { city: true; state: true } }>;
Test.checks([
  Test.check<OrderSubField['billingAddress']['city'], string, Test.Pass>(),
  Test.check<OrderSubField['billingAddress']['state'], string, Test.Pass>(),
]);
// Verify street is excluded
Test.checks([Test.check<'street' extends keyof OrderSubField['billingAddress'] ? 1 : 0, 0, Test.Pass>()]);
