/**
 * Type checks for generated model types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId, RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  Post,
  Profile,
  Tag,
  User,
  UserCreate,
  UserInclude,
  UserOrderBy,
  UserUpdate,
  UserWhere,
} from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// User Interface Field Types
// =============================================================================

Test.checks([
  // Required fields
  Test.check<User['id'], CerialId<string>, Test.Pass>(),
  Test.check<User['email'], string, Test.Pass>(),
  Test.check<User['name'], string, Test.Pass>(),
  Test.check<User['isActive'], boolean, Test.Pass>(),

  // Optional fields (nullable)
  Test.check<User['age'], number | null | undefined, Test.Pass>(),
  Test.check<User['createdAt'], Date | undefined, Test.Pass>(),
  Test.check<User['profileId'], CerialId<string> | null | undefined, Test.Pass>(),

  // Array fields
  Test.check<User['tagIds'], CerialId<string>[], Test.Pass>(),
  Test.check<User['nicknames'], string[], Test.Pass>(),
  Test.check<User['scores'], number[], Test.Pass>(),
  Test.check<User['loginDates'], Date[], Test.Pass>(),
]);

// =============================================================================
// UserCreate Type
// =============================================================================

// UserCreate should accept required fields only
type RequiredOnly = { email: string; name: string; isActive: boolean };
Test.checks([Test.check<Extends<RequiredOnly, UserCreate>, 1, Test.Pass>()]);

// UserCreate should also accept optional fields
type WithOptional = {
  email: string;
  name: string;
  isActive: boolean;
  id?: string;
  age?: number;
  tagIds?: string[];
};
Test.checks([Test.check<Extends<WithOptional, UserCreate>, 1, Test.Pass>()]);

// =============================================================================
// UserUpdate Type
// =============================================================================

// Empty object should be valid for update (all fields optional)
// biome-ignore lint/complexity/noBannedTypes: {} intentionally tests empty object assignability
Test.checks([Test.check<Extends<{}, UserUpdate>, 1, Test.Pass>()]);

// Partial updates should work
type PartialUpdate = { name?: string; email?: string };
Test.checks([Test.check<Extends<PartialUpdate, UserUpdate>, 1, Test.Pass>()]);

// Array fields support push/unset operations
type ArrayOps = {
  push?: RecordIdInput<string> | RecordIdInput<string>[];
  unset?: RecordIdInput<string> | RecordIdInput<string>[];
};
type TagIdsUpdate = Exclude<UserUpdate['tagIds'], RecordIdInput<string>[] | undefined>;
Test.checks([Test.check<Extends<ArrayOps, TagIdsUpdate>, 1, Test.Pass>()]);

// =============================================================================
// UserWhere Type - Operators
// =============================================================================

// Record field operators (id accepts operator objects in Where)
type IdWhereEq = { id: { eq: string } };
type IdWhereNeq = { id: { neq: string } };
type IdWhereContains = { id: { contains: string } };
type IdWhereStartsWith = { id: { startsWith: string } };
type IdWhereEndsWith = { id: { endsWith: string } };
Test.checks([
  Test.check<Extends<IdWhereEq, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereNeq, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereContains, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereStartsWith, UserWhere>, 1, Test.Pass>(),
  Test.check<Extends<IdWhereEndsWith, UserWhere>, 1, Test.Pass>(),
]);

// Number field operators (optional fields also accept null for querying)
type AgeWhere = Exclude<UserWhere['age'], number | null | undefined>;
Test.checks([
  Test.check<Extends<AgeWhere, { gt?: number }>, 1, Test.Pass>(),
  Test.check<Extends<AgeWhere, { gte?: number }>, 1, Test.Pass>(),
  Test.check<Extends<AgeWhere, { lt?: number }>, 1, Test.Pass>(),
  Test.check<Extends<AgeWhere, { lte?: number }>, 1, Test.Pass>(),
  Test.check<Extends<AgeWhere, { between?: [number, number] }>, 1, Test.Pass>(),
  Test.check<Extends<AgeWhere, { isNull?: boolean }>, 1, Test.Pass>(),
]);

// Date field operators (optional fields also accept null for querying)
type CreatedAtWhere = Exclude<UserWhere['createdAt'], Date | null | undefined>;
Test.checks([
  Test.check<Extends<CreatedAtWhere, { gt?: Date }>, 1, Test.Pass>(),
  Test.check<Extends<CreatedAtWhere, { lt?: Date }>, 1, Test.Pass>(),
  Test.check<Extends<CreatedAtWhere, { between?: [Date, Date] }>, 1, Test.Pass>(),
]);

// Array field operators (tagIds uses RecordIdInput in Where)
type TagIdsWhere = Exclude<UserWhere['tagIds'], RecordIdInput[] | undefined>;
Test.checks([
  Test.check<Extends<TagIdsWhere, { has?: RecordIdInput }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsWhere, { hasAll?: RecordIdInput[] }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsWhere, { hasAny?: RecordIdInput[] }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsWhere, { isEmpty?: boolean }>, 1, Test.Pass>(),
]);

// Logical operators
Test.checks([
  Test.check<Extends<UserWhere, { AND?: UserWhere[] }>, 1, Test.Pass>(),
  Test.check<Extends<UserWhere, { OR?: UserWhere[] }>, 1, Test.Pass>(),
  Test.check<Extends<UserWhere, { NOT?: UserWhere }>, 1, Test.Pass>(),
]);

// Relation filtering
Test.checks([
  Test.check<Extends<UserWhere, { profile?: unknown }>, 1, Test.Pass>(),
  Test.check<Extends<UserWhere, { tags?: unknown }>, 1, Test.Pass>(),
  Test.check<Extends<UserWhere, { posts?: unknown }>, 1, Test.Pass>(),
]);

// =============================================================================
// UserOrderBy Type
// =============================================================================

Test.checks([
  Test.check<UserOrderBy['id'], 'asc' | 'desc' | undefined, Test.Pass>(),
  Test.check<UserOrderBy['email'], 'asc' | 'desc' | undefined, Test.Pass>(),
  Test.check<UserOrderBy['name'], 'asc' | 'desc' | undefined, Test.Pass>(),
  Test.check<UserOrderBy['age'], 'asc' | 'desc' | undefined, Test.Pass>(),
  Test.check<UserOrderBy['createdAt'], 'asc' | 'desc' | undefined, Test.Pass>(),
]);

// =============================================================================
// UserInclude Type
// =============================================================================

// Boolean includes
type IncludeProfile = { profile: true };
type IncludeTags = { tags: true };
Test.checks([
  Test.check<Extends<IncludeProfile, UserInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludeTags, UserInclude>, 1, Test.Pass>(),
]);

// Nested select in includes
type NestedInclude = { profile: { select: { id: true } } };
Test.checks([Test.check<Extends<NestedInclude, UserInclude>, 1, Test.Pass>()]);

// =============================================================================
// Related Model Types
// =============================================================================

Test.checks([
  // Profile
  Test.check<Profile['id'], CerialId<string>, Test.Pass>(),
  Test.check<Profile['bio'], string | null | undefined, Test.Pass>(),

  // Tag
  Test.check<Tag['id'], CerialId<string>, Test.Pass>(),

  // Post
  Test.check<Post['id'], CerialId<string>, Test.Pass>(),
  Test.check<Post['authorId'], CerialId<string>, Test.Pass>(),
]);
