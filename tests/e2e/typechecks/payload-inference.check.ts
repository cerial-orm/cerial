/**
 * Type checks for GetPayload inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type { GetProfilePayload, GetUserPayload, Post, Profile, Tag } from '../generated';

// =============================================================================
// GetUserPayload - No Select/Include
// =============================================================================

type FullUser = GetUserPayload<undefined, undefined>;

Test.checks([
  Test.check<FullUser['id'], CerialId, Test.Pass>(),
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
  Test.check<SelectedFields['id'], CerialId, Test.Pass>(),
  Test.check<SelectedFields['email'], string, Test.Pass>(),
]);

// Select single field
type SingleField = GetUserPayload<{ name: true }>;
Test.checks([Test.check<SingleField['name'], string, Test.Pass>()]);

// Select array fields
type ArrayFields = GetUserPayload<{ tagIds: true; nicknames: true }>;
Test.checks([
  Test.check<ArrayFields['tagIds'], CerialId[], Test.Pass>(),
  Test.check<ArrayFields['nicknames'], string[], Test.Pass>(),
]);

// =============================================================================
// GetUserPayload - With Include
// =============================================================================

// Include single relation
type WithProfile = GetUserPayload<undefined, { profile: true }>;
Test.checks([
  Test.check<WithProfile['id'], CerialId, Test.Pass>(),
  Test.check<WithProfile['profile'], Profile, Test.Pass>(),
]);

// Include array relation
type WithTags = GetUserPayload<undefined, { tags: true }>;
Test.checks([Test.check<WithTags['id'], CerialId, Test.Pass>(), Test.check<WithTags['tags'], Tag[], Test.Pass>()]);

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
  Test.check<SelectAndInclude['id'], CerialId, Test.Pass>(),
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
  Test.check<IncludedProfile['id'], CerialId, Test.Pass>(),
  Test.check<IncludedProfile['bio'], string | null | undefined, Test.Pass>(),
]);

// =============================================================================
// GetProfilePayload
// =============================================================================

type FullProfile = GetProfilePayload<undefined>;
type SelectedProfile = GetProfilePayload<{ id: true }>;

Test.checks([
  Test.check<FullProfile['id'], CerialId, Test.Pass>(),
  Test.check<FullProfile['bio'], string | null | undefined, Test.Pass>(),
  Test.check<SelectedProfile['id'], CerialId, Test.Pass>(),
]);
