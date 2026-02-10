/**
 * Type checks for generated object types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { CerialId, type RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  Address,
  AddressInput,
  AddressWhere,
  AddressSelect,
  AddressOrderBy,
  GeoPoint,
  GeoPointInput,
  GeoPointWhere,
  GeoPointSelect,
  GeoPointOrderBy,
  TreeNode,
  TreeNodeInput,
  TreeNodeWhere,
  TreeNodeSelect,
  TreeNodeOrderBy,
  OrderItem,
  OrderItemInput,
  OrderItemWhere,
  OrderItemSelect,
  OrderItemOrderBy,
  ObjectTestUser,
  ObjectTestUserInput,
  ObjectTestUserCreate,
  ObjectTestUserUpdate,
  ObjectTestUserWhere,
  ObjectTestUserSelect,
  ObjectTestUserOrderBy,
  ObjectTestOrder,
  ObjectTestOrderInput,
  ObjectTestOrderCreate,
  ObjectTestOrderUpdate,
  ObjectTestOrderWhere,
  ObjectTestOrderSelect,
  ObjectTestOrderOrderBy,
} from '../generated';

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
type ZipCodeWhere = Exclude<AddressWhere['zipCode'], string | undefined>;
// Verify null is part of the union by checking that assigning null to the field is valid
type ZipCodeAcceptsNull = null extends NonNullable<AddressWhere['zipCode']> ? 0 : 1;
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
