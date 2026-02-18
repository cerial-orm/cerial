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

import type { CerialId, RecordIdInput } from 'cerial';
import type { RecordId, StringRecordId } from 'surrealdb';
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
  Test.check<User['id'], CerialId<string>, Test.Pass>(),
  Test.check<User['profileId'], CerialId<string> | null | undefined, Test.Pass>(),
  Test.check<User['tagIds'], CerialId<string>[], Test.Pass>(),

  // Profile model
  Test.check<Profile['id'], CerialId<string>, Test.Pass>(),
  Test.check<Profile['userId'], CerialId<string> | null | undefined, Test.Pass>(),

  // Post model
  Test.check<Post['id'], CerialId<string>, Test.Pass>(),
  Test.check<Post['authorId'], CerialId<string>, Test.Pass>(),

  // Tag model
  Test.check<Tag['id'], CerialId<string>, Test.Pass>(),
]);

// =============================================================================
// Input Types - Record fields should accept RecordIdInput
// =============================================================================

Test.checks([
  // UserInput — plain Record @id uses string for id input
  Test.check<UserInput['id'], string | undefined, Test.Pass>(),
  Test.check<UserInput['profileId'], RecordIdInput<string> | null | undefined, Test.Pass>(),
  Test.check<UserInput['tagIds'], RecordIdInput<string>[], Test.Pass>(),

  // ProfileInput
  Test.check<ProfileInput['id'], string | undefined, Test.Pass>(),
  Test.check<ProfileInput['userId'], RecordIdInput<string> | null | undefined, Test.Pass>(),

  // PostInput
  Test.check<PostInput['id'], string | undefined, Test.Pass>(),
  Test.check<PostInput['authorId'], RecordIdInput<string>, Test.Pass>(),
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

// UserCreate accepts string for id (plain Record @id)
type CreateWithCerialId = { email: string; name: string; isActive: boolean; id: string };
Test.checks([Test.check<Extends<CreateWithCerialId, UserCreate>, 1, Test.Pass>()]);

// =============================================================================
// Where Types - should accept RecordIdInput for Record fields
// =============================================================================

// Where should accept string for id
type WhereWithStringId = { id: string };
Test.checks([Test.check<Extends<WhereWithStringId, UserWhere>, 1, Test.Pass>()]);

// Where should accept CerialId for id
type WhereWithCerialId = { id: CerialId<string> };
Test.checks([Test.check<Extends<WhereWithCerialId, UserWhere>, 1, Test.Pass>()]);

// Where should accept operator objects for id
type IdWhereWithEq = { id: { eq: string } };
type IdWhereWithNeq = { id: { neq: string } };
type IdWhereWithIn = { id: { in: string[] } };
type IdWhereWithNotIn = { id: { notIn: string[] } };
Test.checks([
  Test.check<Extends<IdWhereWithEq, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereWithNeq, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereWithIn, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereWithNotIn, UserWhere>, 1, Test.Pass>(),
]);

// =============================================================================
// FindUniqueWhere - should accept RecordIdInput for id
// =============================================================================

// FindUniqueWhere should accept string for id
type FindUniqueStringId = { id: string };
Test.checks([Test.check<Extends<FindUniqueStringId, UserFindUniqueWhere>, 1, Test.Pass>()]);

// FindUniqueWhere should accept CerialId for id
type FindUniqueCerialId = { id: CerialId<string> };
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
type UpdateWithCerialIdProfileId = { profileId: CerialId<string> };
Test.checks([Test.check<Extends<UpdateWithCerialIdProfileId, UserUpdate>, 1, Test.Pass>()]);

// Update array operations should accept RecordIdInput
type TagIdsOps = Exclude<UserUpdate['tagIds'], RecordIdInput[] | undefined>;
Test.checks([
  Test.check<Extends<TagIdsOps, { push?: RecordIdInput | RecordIdInput[] }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsOps, { unset?: RecordIdInput | RecordIdInput[] }>, 1, Test.Pass>(),
]);
