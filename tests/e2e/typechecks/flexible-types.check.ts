/**
 * Type checks for @flexible decorator on object type fields
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  FlexAddress,
  FlexAddressInput,
  FlexAddressOrderBy,
  FlexAddressWhere,
  FlexMeta,
  FlexMetaInput,
  FlexMetaOrderBy,
  FlexMetaWhere,
  FlexProfile,
  FlexProfileInput,
  FlexProfileOrderBy,
  FlexProfileWhere,
  FlexUser,
  FlexUserCreate,
  FlexUserInput,
  FlexUserOrderBy,
  FlexUserSelect,
  FlexUserUpdate,
  FlexUserWhere,
  GetFlexUserPayload,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Object Interface Types (base objects — no flexible intersection)
// =============================================================================

// FlexAddress is a plain object interface (shared between flexible and strict)
Test.checks([
  Test.check<FlexAddress['street'], string, Test.Pass>(),
  Test.check<FlexAddress['city'], string, Test.Pass>(),
  Test.check<FlexAddress['zip'], string | null | undefined, Test.Pass>(),
]);

// FlexAddress does NOT have an index signature — it's the base type
// Extra keys are not assignable to it
type FlexAddressHasIndex = string extends keyof FlexAddress ? 1 : 0;
Test.checks([Test.check<FlexAddressHasIndex, 0, Test.Pass>()]);

// FlexMeta is a plain object with only 'label'
Test.checks([Test.check<FlexMeta['label'], string, Test.Pass>()]);

// FlexProfile has bio and flexible metadata
Test.checks([
  Test.check<FlexProfile['bio'], string, Test.Pass>(),
  Test.check<FlexProfile['metadata'], FlexMeta & Record<string, any>, Test.Pass>(),
]);

// =============================================================================
// Model Interface — flexible vs strict fields
// =============================================================================

// Flexible field: FlexAddress & Record<string, any>
Test.checks([Test.check<FlexUser['address'], FlexAddress & Record<string, any>, Test.Pass>()]);

// Flexible field has an index signature (arbitrary keys accessible)
type FlexUserAddressHasIndex = string extends keyof FlexUser['address'] ? 1 : 0;
Test.checks([Test.check<FlexUserAddressHasIndex, 1, Test.Pass>()]);

// Known fields still have correct types
Test.checks([
  Test.check<FlexUser['address']['street'], string, Test.Pass>(),
  Test.check<FlexUser['address']['city'], string, Test.Pass>(),
]);

// Optional flexible field: FlexAddress & Record<string, any> | undefined
Test.checks([
  Test.check<undefined extends FlexUser['shipping'] ? 1 : 0, 1, Test.Pass>(),
  Test.check<Extends<NonNullable<FlexUser['shipping']>, FlexAddress & Record<string, any>>, 1, Test.Pass>(),
]);

// Array flexible field: (FlexAddress & Record<string, any>)[]
Test.checks([Test.check<FlexUser['tags'], (FlexAddress & Record<string, any>)[], Test.Pass>()]);

// Strict field: plain FlexAddress (no Record intersection)
Test.checks([Test.check<FlexUser['strictAddress'], FlexAddress, Test.Pass>()]);

// Strict field does NOT accept arbitrary keys
Test.checks([Test.check<Extends<FlexUser['strictAddress'], { unknownKey: number }>, 0, Test.Pass>()]);

// Nested flexible: profile.metadata has Record<string, any>
Test.checks([
  Test.check<FlexUser['profile'], FlexProfile, Test.Pass>(),
  Test.check<FlexUser['profile']['metadata'], FlexMeta & Record<string, any>, Test.Pass>(),
]);

// profile itself is NOT flexible — only metadata within it is
Test.checks([Test.check<Extends<FlexUser['profile'], { unknownKey: number }>, 0, Test.Pass>()]);

// =============================================================================
// Input Types — flexible fields have Record<string, any>
// =============================================================================

Test.checks([
  Test.check<FlexUserInput['address'], FlexAddressInput & Record<string, any>, Test.Pass>(),
  Test.check<FlexUserInput['strictAddress'], FlexAddressInput, Test.Pass>(),
]);

// Flexible input accepts extra keys
Test.checks([
  Test.check<Extends<{ street: 'Main'; city: 'NYC'; bonus: true }, FlexUserInput['address']>, 1, Test.Pass>(),
]);

// Strict input does NOT have an index signature
type StrictInputHasIndex = string extends keyof FlexUserInput['strictAddress'] ? 1 : 0;
Test.checks([Test.check<StrictInputHasIndex, 0, Test.Pass>()]);

// Nested flexible input: profile.metadata accepts extra keys
Test.checks([
  Test.check<FlexProfileInput['metadata'], FlexMetaInput & Record<string, any>, Test.Pass>(),
  Test.check<Extends<{ label: 'x'; score: 99 }, FlexProfileInput['metadata']>, 1, Test.Pass>(),
]);

// =============================================================================
// Create Types
// =============================================================================

// Required flexible field must be provided with known fields + extras allowed
type FlexUserCreateMinimal = {
  name: string;
  address: { street: string; city: string };
  profile: { bio: string; metadata: { label: string } };
  strictAddress: { street: string; city: string };
};
Test.checks([Test.check<Extends<FlexUserCreateMinimal, FlexUserCreate>, 1, Test.Pass>()]);

// Create with extra fields on flexible object
type FlexUserCreateWithExtras = {
  name: string;
  address: { street: string; city: string; rating: number; active: boolean };
  profile: { bio: string; metadata: { label: string } };
  strictAddress: { street: string; city: string };
};
Test.checks([Test.check<Extends<FlexUserCreateWithExtras, FlexUserCreate>, 1, Test.Pass>()]);

// Create with extra fields on nested flexible metadata
type FlexUserCreateWithNestedExtras = {
  name: string;
  address: { street: string; city: string };
  profile: { bio: string; metadata: { label: string; score: number; custom: string } };
  strictAddress: { street: string; city: string };
};
Test.checks([Test.check<Extends<FlexUserCreateWithNestedExtras, FlexUserCreate>, 1, Test.Pass>()]);

// tags (array of flexible) is optional in create
type FlexUserCreateNoTags = {
  name: string;
  address: { street: string; city: string };
  profile: { bio: string; metadata: { label: string } };
  strictAddress: { street: string; city: string };
};
Test.checks([Test.check<Extends<FlexUserCreateNoTags, FlexUserCreate>, 1, Test.Pass>()]);

// tags with extra fields
type FlexUserCreateWithTags = {
  name: string;
  address: { street: string; city: string };
  tags: { street: string; city: string; category: string }[];
  profile: { bio: string; metadata: { label: string } };
  strictAddress: { street: string; city: string };
};
Test.checks([Test.check<Extends<FlexUserCreateWithTags, FlexUserCreate>, 1, Test.Pass>()]);

// =============================================================================
// Update Types
// =============================================================================

// Merge update on flexible field (partial)
Test.checks([Test.check<Extends<{ city: string }, NonNullable<FlexUserUpdate['address']>>, 1, Test.Pass>()]);

// Merge update with extra fields on flexible field
Test.checks([
  Test.check<Extends<{ city: string; newField: number }, NonNullable<FlexUserUpdate['address']>>, 1, Test.Pass>(),
]);

// Set replace on flexible field
Test.checks([
  Test.check<
    Extends<{ set: { street: string; city: string; extra: boolean } }, NonNullable<FlexUserUpdate['address']>>,
    1,
    Test.Pass
  >(),
]);

// Array of flexible: push with extra fields
type TagsPush = {
  push: { street: string; city: string; category: string };
};
Test.checks([Test.check<Extends<TagsPush, NonNullable<FlexUserUpdate['tags']>>, 1, Test.Pass>()]);

// Array of flexible: updateWhere with extra fields in where and data
type TagsUpdateWhere = {
  updateWhere: {
    where: FlexAddressWhere & { [key: string]: any };
    data: { city: string; newProp: number };
  };
};
Test.checks([Test.check<Extends<TagsUpdateWhere, NonNullable<FlexUserUpdate['tags']>>, 1, Test.Pass>()]);

// Strict field update does NOT accept extra keys
Test.checks([
  Test.check<Extends<Partial<FlexAddressInput>, NonNullable<FlexUserUpdate['strictAddress']>>, 1, Test.Pass>(),
  Test.check<Extends<{ set: FlexAddressInput }, NonNullable<FlexUserUpdate['strictAddress']>>, 1, Test.Pass>(),
]);

// =============================================================================
// Where Types
// =============================================================================

// FlexAddressWhere is the base where type (no index signature)
Test.checks([
  Test.check<Extends<{ street: 'Main' }, FlexAddressWhere>, 1, Test.Pass>(),
  Test.check<Extends<{ city: { contains: 'NY' } }, FlexAddressWhere>, 1, Test.Pass>(),
]);

// FlexAddressWhere has logical operators
Test.checks([
  Test.check<Extends<FlexAddressWhere, { AND?: FlexAddressWhere[] }>, 1, Test.Pass>(),
  Test.check<Extends<FlexAddressWhere, { OR?: FlexAddressWhere[] }>, 1, Test.Pass>(),
  Test.check<Extends<FlexAddressWhere, { NOT?: FlexAddressWhere }>, 1, Test.Pass>(),
]);

// Model-level where: flexible address has index signature
Test.checks([
  Test.check<Extends<FlexAddressWhere & { [key: string]: any }, NonNullable<FlexUserWhere['address']>>, 1, Test.Pass>(),
]);

// Model-level where: flexible field accepts arbitrary keys
Test.checks([
  Test.check<Extends<{ rating: 5 }, NonNullable<FlexUserWhere['address']>>, 1, Test.Pass>(),
  Test.check<Extends<{ city: 'NYC'; customField: true }, NonNullable<FlexUserWhere['address']>>, 1, Test.Pass>(),
]);

// Model-level where: strict field does NOT have index signature
Test.checks([Test.check<Extends<FlexAddressWhere, NonNullable<FlexUserWhere['strictAddress']>>, 1, Test.Pass>()]);

// Nested flexible where: profile.metadata has index signature
Test.checks([
  Test.check<
    Extends<FlexMetaWhere & { [key: string]: any }, NonNullable<FlexProfileWhere['metadata']>>,
    1,
    Test.Pass
  >(),
]);

// Array of flexible: some/every/none have index signatures
type TagsWhereField = NonNullable<FlexUserWhere['tags']>;
Test.checks([
  Test.check<Extends<{ some: FlexAddressWhere & { [key: string]: any } }, TagsWhereField>, 1, Test.Pass>(),
  Test.check<Extends<{ every: FlexAddressWhere & { [key: string]: any } }, TagsWhereField>, 1, Test.Pass>(),
  Test.check<Extends<{ none: FlexAddressWhere & { [key: string]: any } }, TagsWhereField>, 1, Test.Pass>(),
]);

// Model-level OR/NOT work with flexible extra fields
Test.checks([
  Test.check<
    Extends<{ OR: [{ address: { rating: 5 } }, { address: { custom: true } }] }, FlexUserWhere>,
    1,
    Test.Pass
  >(),
  Test.check<Extends<{ NOT: { address: { rating: 5 } } }, FlexUserWhere>, 1, Test.Pass>(),
]);

// =============================================================================
// Select Types
// =============================================================================

// Boolean select for flexible field
Test.checks([
  Test.check<Extends<{ address: true }, FlexUserSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ address: false }, FlexUserSelect>, 1, Test.Pass>(),
]);

// Sub-field select for flexible field (same select as strict)
Test.checks([
  Test.check<Extends<{ address: { city: true } }, FlexUserSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ address: { city: true; street: true } }, FlexUserSelect>, 1, Test.Pass>(),
]);

// Strict field uses the same select type
Test.checks([
  Test.check<Extends<{ strictAddress: true }, FlexUserSelect>, 1, Test.Pass>(),
  Test.check<Extends<{ strictAddress: { city: true } }, FlexUserSelect>, 1, Test.Pass>(),
]);

// =============================================================================
// OrderBy Types
// =============================================================================

Test.checks([
  Test.check<FlexUserOrderBy['address'], FlexAddressOrderBy | undefined, Test.Pass>(),
  Test.check<FlexUserOrderBy['strictAddress'], FlexAddressOrderBy | undefined, Test.Pass>(),
  Test.check<FlexAddressOrderBy['city'], 'asc' | 'desc' | undefined, Test.Pass>(),
]);

// Nested flexible: profile.metadata orderBy
Test.checks([Test.check<FlexProfileOrderBy['metadata'], FlexMetaOrderBy | undefined, Test.Pass>()]);

// =============================================================================
// GetPayload Type Inference
// =============================================================================

// No select → full model (flexible fields have Record<string, any>)
type NoSelect = GetFlexUserPayload<undefined>;

// Flexible field has index signature after compute
type NoSelectAddressHasIndex = string extends keyof NoSelect['address'] ? 1 : 0;
Test.checks([Test.check<NoSelectAddressHasIndex, 1, Test.Pass>()]);

// Flexible field retains known fields
Test.checks([
  Test.check<NoSelect['address']['street'], string, Test.Pass>(),
  Test.check<NoSelect['address']['city'], string, Test.Pass>(),
]);

// Strict field is plain FlexAddress (extends both ways)
Test.checks([
  Test.check<Extends<NoSelect['strictAddress'], FlexAddress>, 1, Test.Pass>(),
  Test.check<Extends<FlexAddress, NoSelect['strictAddress']>, 1, Test.Pass>(),
]);

// Strict field does NOT have index signature
type NoSelectStrictHasIndex = string extends keyof NoSelect['strictAddress'] ? 1 : 0;
Test.checks([Test.check<NoSelectStrictHasIndex, 0, Test.Pass>()]);

// Tags is array, elements have index signature
type NoSelectTagElement = NoSelect['tags'] extends (infer E)[] ? E : never;
type NoSelectTagHasIndex = string extends keyof NoSelectTagElement ? 1 : 0;
Test.checks([Test.check<NoSelectTagHasIndex, 1, Test.Pass>()]);

// Profile retains structure
Test.checks([Test.check<NoSelect['profile']['bio'], string, Test.Pass>()]);

// Profile.metadata (nested flexible) has index signature
type NoSelectMetaHasIndex = string extends keyof NoSelect['profile']['metadata'] ? 1 : 0;
Test.checks([Test.check<NoSelectMetaHasIndex, 1, Test.Pass>()]);

// Boolean true select → full type (flexible preserved with index signature)
type BoolSelect = GetFlexUserPayload<{ address: true }>;
type BoolSelectAddressHasIndex = string extends keyof BoolSelect['address'] ? 1 : 0;
Test.checks([Test.check<BoolSelectAddressHasIndex, 1, Test.Pass>()]);

// Boolean true strict → no index signature
type BoolStrictSelect = GetFlexUserPayload<{ strictAddress: true }>;
type BoolStrictHasIndex = string extends keyof BoolStrictSelect['strictAddress'] ? 1 : 0;
Test.checks([Test.check<BoolStrictHasIndex, 0, Test.Pass>()]);

// Sub-field select on flexible field → narrowed (only selected fields)
type SubFieldSelect = GetFlexUserPayload<{ address: { city: true } }>;
Test.checks([Test.check<SubFieldSelect['address'], { city: string }, Test.Pass>()]);

// Verify unselected fields are excluded from sub-field select
Test.checks([Test.check<'street' extends keyof SubFieldSelect['address'] ? 1 : 0, 0, Test.Pass>()]);

// Multiple sub-fields on flexible
type MultiSubField = GetFlexUserPayload<{ address: { city: true; street: true } }>;
Test.checks([Test.check<MultiSubField['address'], { city: string; street: string }, Test.Pass>()]);

// Array of flexible with sub-field select
type ArraySubField = GetFlexUserPayload<{ tags: { city: true } }>;
Test.checks([Test.check<ArraySubField['tags'], { city: string }[], Test.Pass>()]);

// Optional flexible with boolean select
type OptionalFlexBool = GetFlexUserPayload<{ shipping: true }>;
Test.checks([Test.check<undefined extends OptionalFlexBool['shipping'] ? 1 : 0, 1, Test.Pass>()]);
// Optional flexible element has index signature
type OptFlexHasIndex = string extends keyof NonNullable<OptionalFlexBool['shipping']> ? 1 : 0;
Test.checks([Test.check<OptFlexHasIndex, 1, Test.Pass>()]);

// Mixed select: flexible + strict + primitive
type MixedSelect = GetFlexUserPayload<{ name: true; address: { city: true }; strictAddress: true }>;
Test.checks([
  Test.check<MixedSelect['name'], string, Test.Pass>(),
  Test.check<MixedSelect['address'], { city: string }, Test.Pass>(),
]);
// Mixed strict has no index signature
type MixedStrictHasIndex = string extends keyof MixedSelect['strictAddress'] ? 1 : 0;
Test.checks([Test.check<MixedStrictHasIndex, 0, Test.Pass>()]);
// Mixed strict retains known fields
Test.checks([
  Test.check<MixedSelect['strictAddress']['street'], string, Test.Pass>(),
  Test.check<MixedSelect['strictAddress']['city'], string, Test.Pass>(),
]);
