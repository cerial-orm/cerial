/**
 * Type checks for generated model types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test, Object as O } from 'ts-toolbelt';
import type {
  User,
  UserCreate,
  UserUpdate,
  UserSelect,
  UserWhere,
  UserOrderBy,
  UserInclude,
  Profile,
  Tag,
  Post,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// User Interface Field Types
// =============================================================================

Test.checks([
  // Required fields
  Test.check<User['id'], string, Test.Pass>(),
  Test.check<User['email'], string, Test.Pass>(),
  Test.check<User['name'], string, Test.Pass>(),
  Test.check<User['isActive'], boolean, Test.Pass>(),

  // Optional fields (nullable)
  Test.check<User['age'], number | null | undefined, Test.Pass>(),
  Test.check<User['createdAt'], Date | null | undefined, Test.Pass>(),
  Test.check<User['profileId'], string | null | undefined, Test.Pass>(),

  // Array fields
  Test.check<User['tagIds'], string[], Test.Pass>(),
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
Test.checks([Test.check<Extends<{}, UserUpdate>, 1, Test.Pass>()]);

// Partial updates should work
type PartialUpdate = { name?: string; email?: string };
Test.checks([Test.check<Extends<PartialUpdate, UserUpdate>, 1, Test.Pass>()]);

// Array fields support push/unset operations
type ArrayOps = { push?: string | string[]; unset?: string | string[] };
type TagIdsUpdate = Exclude<UserUpdate['tagIds'], string[] | undefined>;
Test.checks([Test.check<Extends<ArrayOps, TagIdsUpdate>, 1, Test.Pass>()]);

// =============================================================================
// UserWhere Type - Operators
// =============================================================================

// String field operators
type IdWhere = Exclude<UserWhere['id'], string | undefined>;
Test.checks([
  Test.check<Extends<IdWhere, { eq?: string }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhere, { neq?: string }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhere, { contains?: string }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhere, { startsWith?: string }>, 1, Test.Pass>(),
  Test.check<Extends<IdWhere, { endsWith?: string }>, 1, Test.Pass>(),
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

// Array field operators
type TagIdsWhere = Exclude<UserWhere['tagIds'], string[] | undefined>;
Test.checks([
  Test.check<Extends<TagIdsWhere, { has?: string }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsWhere, { hasAll?: string[] }>, 1, Test.Pass>(),
  Test.check<Extends<TagIdsWhere, { hasAny?: string[] }>, 1, Test.Pass>(),
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
  Test.check<Profile['id'], string, Test.Pass>(),
  Test.check<Profile['bio'], string | null | undefined, Test.Pass>(),

  // Tag
  Test.check<Tag['id'], string, Test.Pass>(),

  // Post
  Test.check<Post['id'], string, Test.Pass>(),
  Test.check<Post['authorId'], string, Test.Pass>(),
]);
