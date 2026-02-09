/**
 * Type checks for CerialId integration
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Validates that:
 * - Output types (User, Profile) have CerialId for Record fields
 * - Input types (UserCreate, UserUpdate, UserWhere) accept RecordIdInput
 */

import { CerialId, type RecordIdInput } from 'cerial';
import { RecordId, StringRecordId } from 'surrealdb';
import { Test } from 'ts-toolbelt';
import type {
  Post,
  PostInput,
  Profile,
  ProfileInput,
  Tag,
  User,
  UserCreate,
  UserFindUniqueWhere,
  UserInput,
  UserUpdate,
  UserWhere,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Output Types - Record fields should be CerialId
// =============================================================================

Test.checks([
  // User model
  Test.check<User['id'], CerialId, Test.Pass>(),
  Test.check<User['profileId'], CerialId | null | undefined, Test.Pass>(),
  Test.check<User['tagIds'], CerialId[], Test.Pass>(),

  // Profile model
  Test.check<Profile['id'], CerialId, Test.Pass>(),
  Test.check<Profile['userId'], CerialId | null | undefined, Test.Pass>(),

  // Post model
  Test.check<Post['id'], CerialId, Test.Pass>(),
  Test.check<Post['authorId'], CerialId, Test.Pass>(),

  // Tag model
  Test.check<Tag['id'], CerialId, Test.Pass>(),
]);

// =============================================================================
// Input Types - Record fields should accept RecordIdInput
// =============================================================================

Test.checks([
  // UserInput
  Test.check<UserInput['id'], RecordIdInput | undefined, Test.Pass>(),
  Test.check<UserInput['profileId'], RecordIdInput | null | undefined, Test.Pass>(),
  Test.check<UserInput['tagIds'], RecordIdInput[], Test.Pass>(),

  // ProfileInput
  Test.check<ProfileInput['id'], RecordIdInput | undefined, Test.Pass>(),
  Test.check<ProfileInput['userId'], RecordIdInput | null | undefined, Test.Pass>(),

  // PostInput
  Test.check<PostInput['id'], RecordIdInput | undefined, Test.Pass>(),
  Test.check<PostInput['authorId'], RecordIdInput, Test.Pass>(),
]);

// =============================================================================
// RecordIdInput Union - accepts multiple input formats
// =============================================================================

// String should be assignable to RecordIdInput
Test.checks([Test.check<Extends<string, RecordIdInput>, 1, Test.Pass>()]);

// CerialId should be assignable to RecordIdInput
Test.checks([Test.check<Extends<CerialId, RecordIdInput>, 1, Test.Pass>()]);

// RecordId should be assignable to RecordIdInput
Test.checks([Test.check<Extends<RecordId, RecordIdInput>, 1, Test.Pass>()]);

// StringRecordId should be assignable to RecordIdInput
Test.checks([Test.check<Extends<StringRecordId, RecordIdInput>, 1, Test.Pass>()]);

// =============================================================================
// Create Types - should accept RecordIdInput for Record fields
// =============================================================================

// UserCreate should accept string for id
type CreateWithStringId = { email: string; name: string; isActive: boolean; id: string };
Test.checks([Test.check<Extends<CreateWithStringId, UserCreate>, 1, Test.Pass>()]);

// UserCreate should accept CerialId for id
type CreateWithCerialId = { email: string; name: string; isActive: boolean; id: CerialId };
Test.checks([Test.check<Extends<CreateWithCerialId, UserCreate>, 1, Test.Pass>()]);

// UserCreate should accept RecordId for id
type CreateWithRecordId = { email: string; name: string; isActive: boolean; id: RecordId };
Test.checks([Test.check<Extends<CreateWithRecordId, UserCreate>, 1, Test.Pass>()]);

// =============================================================================
// Where Types - should accept RecordIdInput for Record fields
// =============================================================================

// Where should accept string for id
type WhereWithStringId = { id: string };
Test.checks([Test.check<Extends<WhereWithStringId, UserWhere>, 1, Test.Pass>()]);

// Where should accept CerialId for id
type WhereWithCerialId = { id: CerialId };
Test.checks([Test.check<Extends<WhereWithCerialId, UserWhere>, 1, Test.Pass>()]);

// Where operators should accept RecordIdInput
type IdWhereOps = Exclude<UserWhere['id'], RecordIdInput | undefined>;
Test.checks([
  Test.check<Extends<IdWhereOps, { eq?: RecordIdInput }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereOps, { neq?: RecordIdInput }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereOps, { in?: RecordIdInput[] }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereOps, { notIn?: RecordIdInput[] }>, 1, Test.Pass>(),
]);

// =============================================================================
// FindUniqueWhere - should accept RecordIdInput for id
// =============================================================================

// FindUniqueWhere should accept string for id
type FindUniqueStringId = { id: string };
Test.checks([Test.check<Extends<FindUniqueStringId, UserFindUniqueWhere>, 1, Test.Pass>()]);

// FindUniqueWhere should accept CerialId for id
type FindUniqueCerialId = { id: CerialId };
Test.checks([Test.check<Extends<FindUniqueCerialId, UserFindUniqueWhere>, 1, Test.Pass>()]);

// FindUniqueWhere should accept RecordId for id
type FindUniqueRecordId = { id: RecordId };
Test.checks([Test.check<Extends<FindUniqueRecordId, UserFindUniqueWhere>, 1, Test.Pass>()]);

// =============================================================================
// Update Types - should accept RecordIdInput for Record fields
// =============================================================================

// Update should accept string for profileId
type UpdateWithStringProfileId = { profileId: string };
Test.checks([Test.check<Extends<UpdateWithStringProfileId, UserUpdate>, 1, Test.Pass>()]);

// Update should accept CerialId for profileId
type UpdateWithCerialIdProfileId = { profileId: CerialId };
Test.checks([Test.check<Extends<UpdateWithCerialIdProfileId, UserUpdate>, 1, Test.Pass>()]);

// Update array operations should accept RecordIdInput
type TagIdsOps = Exclude<UserUpdate['tagIds'], RecordIdInput[] | undefined>;
Test.checks([
  Test.check<Extends<TagIdsOps, { push?: RecordIdInput | RecordIdInput[] }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsOps, { unset?: RecordIdInput | RecordIdInput[] }>, 1, Test.Pass>(),
]);
