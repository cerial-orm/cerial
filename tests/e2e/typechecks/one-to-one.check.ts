/**
 * Type checks for One-to-One relation types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  ProfileOptionalCreateInput,
  ProfileOptionalUpdateInput,
  ProfileRequired,
  ProfileRequiredCreateInput,
  UserOptionalCreateInput,
  UserOptionalUpdateInput,
  UserRequired,
  UserRequiredCreateInput,
  UserRequiredInclude,
  UserRequiredUpdateInput,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Required 1-1: UserRequired <-> ProfileRequired
// =============================================================================

// UserRequired base type should NOT include profile (it's virtual)
Test.checks([
  Test.check<UserRequired['id'], CerialId<string>, Test.Pass>(),
  Test.check<UserRequired['email'], string, Test.Pass>(),
  Test.check<UserRequired['name'], string, Test.Pass>(),
]);

// ProfileRequired should have userId (the FK)
Test.checks([
  Test.check<ProfileRequired['id'], CerialId<string>, Test.Pass>(),
  Test.check<ProfileRequired['userId'], CerialId<string>, Test.Pass>(),
]);

// =============================================================================
// Required 1-1 Create Types
// =============================================================================

// UserRequiredCreateInput should allow nested profile create
type UserWithNestedProfileCreate = {
  email: string;
  name: string;
  profile: { create: { bio: string } };
};
Test.checks([Test.check<Extends<UserWithNestedProfileCreate, UserRequiredCreateInput>, 1, Test.Pass>()]);

// UserRequiredCreateInput should allow profile connect
type UserWithProfileConnect = {
  email: string;
  name: string;
  profile: { connect: string };
};
Test.checks([Test.check<Extends<UserWithProfileConnect, UserRequiredCreateInput>, 1, Test.Pass>()]);

// ProfileRequiredCreateInput should allow nested user create
type ProfileWithNestedUserCreate = {
  bio: string;
  user: { create: { email: string; name: string } };
};
Test.checks([Test.check<Extends<ProfileWithNestedUserCreate, ProfileRequiredCreateInput>, 1, Test.Pass>()]);

// ProfileRequiredCreateInput should allow user connect
type ProfileWithUserConnect = {
  bio: string;
  user: { connect: string };
};
Test.checks([Test.check<Extends<ProfileWithUserConnect, ProfileRequiredCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Required 1-1 Update Types
// =============================================================================

// UserRequiredUpdateInput should allow profile operations
type UserUpdateWithProfileConnect = { profile: { connect: string } };
type UserUpdateWithProfileCreate = { profile: { create: { bio: string } } };
Test.checks([
  Test.check<Extends<UserUpdateWithProfileConnect, UserRequiredUpdateInput>, 1, Test.Pass>(),
  Test.check<Extends<UserUpdateWithProfileCreate, UserRequiredUpdateInput>, 1, Test.Pass>(),
]);

// =============================================================================
// Optional 1-1: UserOptional <-> ProfileOptional
// =============================================================================

// Optional create without relation should be valid
type UserOptionalWithoutProfile = { email: string; name: string };
Test.checks([Test.check<Extends<UserOptionalWithoutProfile, UserOptionalCreateInput>, 1, Test.Pass>()]);

// ProfileOptionalCreateInput without user should be valid
type ProfileOptionalWithoutUser = { bio: string };
Test.checks([Test.check<Extends<ProfileOptionalWithoutUser, ProfileOptionalCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Optional 1-1 Update with Disconnect
// =============================================================================

// UserOptionalUpdateInput should allow disconnect
type UserOptionalDisconnect = { profile: { disconnect: true } };
Test.checks([Test.check<Extends<UserOptionalDisconnect, UserOptionalUpdateInput>, 1, Test.Pass>()]);

// ProfileOptionalUpdateInput should allow disconnect
type ProfileOptionalDisconnect = { user: { disconnect: true } };
Test.checks([Test.check<Extends<ProfileOptionalDisconnect, ProfileOptionalUpdateInput>, 1, Test.Pass>()]);

// =============================================================================
// Include Types
// =============================================================================

// UserRequiredInclude should support profile include
type IncludeProfile = { profile: true };
type IncludeProfileWithOptions = { profile: { select: { id: true; bio: true } } };
Test.checks([
  Test.check<Extends<IncludeProfile, UserRequiredInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeProfileWithOptions, UserRequiredInclude>, 1, Test.Pass>(),
]);
