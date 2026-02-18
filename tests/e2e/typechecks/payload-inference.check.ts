/**
 * Type checks for GetPayload inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  Address,
  CompanyMeta,
  GetProfilePayload,
  GetRelObjCompanyPayload,
  GetRelObjEmployeePayload,
  GetUserPayload,
  Post,
  Profile,
  RelObjCompany,
  Tag,
} from '../generated';

// =============================================================================
// GetUserPayload - No Select/Include
// =============================================================================

type FullUser = GetUserPayload<undefined, undefined>;

Test.checks([
  Test.check<FullUser['id'], CerialId<string>, Test.Pass>(),
  Test.check<FullUser['email'], string, Test.Pass>(),
  Test.check<FullUser['name'], string, Test.Pass>(),
  Test.check<FullUser['isActive'], boolean, Test.Pass>(),
]);

// =============================================================================
// GetUserPayload - With Select
// =============================================================================

// Select specific fields
type SelectedFields = GetUserPayload<{ id: true; email: true }, undefined>;
Test.checks([
  Test.check<SelectedFields['id'], CerialId<string>, Test.Pass>(),
  Test.check<SelectedFields['email'], string, Test.Pass>(),
]);

// Select single field
type SingleField = GetUserPayload<{ name: true }>;
Test.checks([Test.check<SingleField['name'], string, Test.Pass>()]);

// Select array fields
type ArrayFields = GetUserPayload<{ tagIds: true; nicknames: true }>;
Test.checks([
  Test.check<ArrayFields['tagIds'], CerialId<string>[], Test.Pass>(),
  Test.check<ArrayFields['nicknames'], string[], Test.Pass>(),
]);

// =============================================================================
// GetUserPayload - With Include
// =============================================================================

// Include single relation
type WithProfile = GetUserPayload<undefined, { profile: true }>;
Test.checks([
  Test.check<WithProfile['id'], CerialId<string>, Test.Pass>(),
  Test.check<WithProfile['profile'], Profile, Test.Pass>(),
]);

// Include array relation
type WithTags = GetUserPayload<undefined, { tags: true }>;
Test.checks([
  Test.check<WithTags['id'], CerialId<string>, Test.Pass>(),
  Test.check<WithTags['tags'], Tag[], Test.Pass>(),
]);

// Include multiple relations
type WithMultiple = GetUserPayload<undefined, { profile: true; tags: true; posts: true }>;
Test.checks([
  Test.check<WithMultiple['profile'], Profile, Test.Pass>(),
  Test.check<WithMultiple['tags'], Tag[], Test.Pass>(),
  Test.check<WithMultiple['posts'], Post[], Test.Pass>(),
]);

// =============================================================================
// GetUserPayload - Combined Select + Include
// =============================================================================

type SelectAndInclude = GetUserPayload<{ id: true; email: true }, { profile: true }>;
Test.checks([
  Test.check<SelectAndInclude['id'], CerialId<string>, Test.Pass>(),
  Test.check<SelectAndInclude['email'], string, Test.Pass>(),
  Test.check<SelectAndInclude['profile'], Profile, Test.Pass>(),
]);

type SingleSelectWithInclude = GetUserPayload<{ name: true }, { tags: true }>;
Test.checks([
  Test.check<SingleSelectWithInclude['name'], string, Test.Pass>(),
  Test.check<SingleSelectWithInclude['tags'], Tag[], Test.Pass>(),
]);

// =============================================================================
// GetUserPayload - Nested Include with Select
// =============================================================================

type NestedInclude = GetUserPayload<undefined, { profile: { select: { id: true; bio: true } } }>;
type IncludedProfile = NestedInclude['profile'];
Test.checks([
  Test.check<IncludedProfile['id'], CerialId<string>, Test.Pass>(),
  Test.check<IncludedProfile['bio'], string | null | undefined, Test.Pass>(),
]);

// =============================================================================
// GetProfilePayload
// =============================================================================

type FullProfile = GetProfilePayload<undefined>;
type SelectedProfile = GetProfilePayload<{ id: true }>;

Test.checks([
  Test.check<FullProfile['id'], CerialId<string>, Test.Pass>(),
  Test.check<FullProfile['bio'], string | null | undefined, Test.Pass>(),
  Test.check<SelectedProfile['id'], CerialId<string>, Test.Pass>(),
]);

// =============================================================================
// GetRelObjEmployeePayload - Top-level select with object sub-field
// =============================================================================

// Select object sub-fields on own model
type EmpHomeCity = GetRelObjEmployeePayload<{ homeAddress: { city: true } }>;
Test.checks([Test.check<EmpHomeCity['homeAddress'], { city: string }, Test.Pass>()]);

// Select mix of primitives and object sub-field
type EmpNameAndCity = GetRelObjEmployeePayload<{ name: true; homeAddress: { city: true; state: true } }>;
Test.checks([
  Test.check<EmpNameAndCity['name'], string, Test.Pass>(),
  Test.check<EmpNameAndCity['homeAddress'], { city: string; state: string }, Test.Pass>(),
]);

// Select with boolean true on object field → full Address
type EmpFullAddr = GetRelObjEmployeePayload<{ homeAddress: true }>;
Test.checks([Test.check<EmpFullAddr['homeAddress'], Address, Test.Pass>()]);

// =============================================================================
// GetRelObjEmployeePayload - Include with select on related model's object field
// =============================================================================

// Include company with select narrowing headquarters
type EmpIncludeCompanyHQ = GetRelObjEmployeePayload<
  undefined,
  { company: { select: { headquarters: { city: true } } } }
>;
Test.checks([
  // Full employee fields present (no own select)
  Test.check<EmpIncludeCompanyHQ['id'], CerialId<string>, Test.Pass>(),
  Test.check<EmpIncludeCompanyHQ['name'], string, Test.Pass>(),
  // Included company has narrowed headquarters
  Test.check<EmpIncludeCompanyHQ['company'], { headquarters: { city: string } }, Test.Pass>(),
]);

// Include company with select on name + object sub-field
type EmpIncludeCompanyNameHQ = GetRelObjEmployeePayload<
  undefined,
  { company: { select: { name: true; headquarters: { city: true } } } }
>;
Test.checks([
  Test.check<EmpIncludeCompanyNameHQ['company'], { name: string; headquarters: { city: string } }, Test.Pass>(),
]);

// Include company with boolean true → full RelObjCompany
type EmpIncludeCompanyFull = GetRelObjEmployeePayload<undefined, { company: true }>;
Test.checks([Test.check<EmpIncludeCompanyFull['company'], RelObjCompany, Test.Pass>()]);

// =============================================================================
// GetRelObjEmployeePayload - Combined own select + include select with objects
// =============================================================================

type EmpCombined = GetRelObjEmployeePayload<
  { homeAddress: { city: true } },
  { company: { select: { name: true; headquarters: { city: true } } } }
>;
Test.checks([
  Test.check<EmpCombined['homeAddress'], { city: string }, Test.Pass>(),
  Test.check<EmpCombined['company'], { name: string; headquarters: { city: string } }, Test.Pass>(),
]);

// =============================================================================
// GetRelObjCompanyPayload - Select on model with multiple object types
// =============================================================================

// Select sub-fields from both headquarters (Address) and meta (CompanyMeta)
type CompanyMultiObj = GetRelObjCompanyPayload<{ headquarters: { city: true }; meta: { industry: true } }>;
Test.checks([
  Test.check<CompanyMultiObj['headquarters'], { city: string }, Test.Pass>(),
  // meta is optional (CompanyMeta?) so ResolveFieldSelect preserves the undefined
  // Use extends checks since A.Compute distributes over unions in ways that affect exact equality
  Test.check<undefined extends CompanyMultiObj['meta'] ? 1 : 0, 1, Test.Pass>(),
  Test.check<{ industry: string } extends NonNullable<CompanyMultiObj['meta']> ? 1 : 0, 1, Test.Pass>(),
  Test.check<NonNullable<CompanyMultiObj['meta']> extends { industry: string } ? 1 : 0, 1, Test.Pass>(),
]);

// Boolean true on optional object → preserves optionality
type CompanyMetaTrue = GetRelObjCompanyPayload<{ meta: true }>;
Test.checks([Test.check<CompanyMetaTrue['meta'], CompanyMeta | undefined, Test.Pass>()]);

// Select all fields from company (no select = full model)
type CompanyFull = GetRelObjCompanyPayload<undefined>;
Test.checks([
  Test.check<CompanyFull['id'], CerialId<string>, Test.Pass>(),
  Test.check<CompanyFull['name'], string, Test.Pass>(),
  Test.check<CompanyFull['headquarters'], Address, Test.Pass>(),
  Test.check<CompanyFull['meta'], CompanyMeta | undefined, Test.Pass>(),
]);
