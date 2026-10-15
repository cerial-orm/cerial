/**
 * Type checks for Nested Create types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Each relation operation is compared with `Test.check`, which fails on a
 * wider or a narrower type, and then exercised with concrete values.
 */

import type { RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  AuthorCreateInput,
  AuthorNestedCreate,
  CourseNestedCreate,
  KitchenSinkBadgeNestedCreate,
  KitchenSinkPostNestedCreate,
  KitchenSinkProfileNestedCreate,
  KitchenSinkSettingsNestedCreate,
  KitchenSinkTagNestedCreate,
  KitchenSinkUserCreateInput,
  PostRequiredCreateInput,
  PostRequiredNestedCreate,
  ProfileRequiredCreateInput,
  ProfileRequiredNestedCreate,
  StudentCreateInput,
  UserRequiredCreateInput,
  UserRequiredNestedCreate,
} from '../../generated';
import type { IsOptional } from '../helpers';

const { checks, check } = Test;

type ManyOp<N> = { create?: N | N[]; connect?: RecordIdInput | RecordIdInput[] };
type OneOp<N> = { create: N } | { connect: RecordIdInput };

// =============================================================================
// Single relations: create or connect
// =============================================================================

// For 1-1: create XOR connect
type ProfileUserBranch = Exclude<ProfileRequiredCreateInput, { userId: unknown }>;
checks([check<ProfileUserBranch['user'], OneOp<UserRequiredNestedCreate>, Test.Pass>()]);

export const profileWithCreate: ProfileRequiredCreateInput = {
  bio: 'b',
  user: { create: { email: 'e', name: 'n' } },
};
export const profileWithConnect: ProfileRequiredCreateInput = { bio: 'b', user: { connect: 'user:1' } };

// =============================================================================
// Required relations must provide nested, connect or the key directly
// =============================================================================

type PostAuthorBranch = Extract<PostRequiredCreateInput, { author: unknown }>;
checks([
  check<PostAuthorBranch['author'], OneOp<AuthorNestedCreate>, Test.Pass>(),
  check<IsOptional<PostAuthorBranch, 'author'>, 0, Test.Pass>(),
]);

export const postWithAuthorCreate: PostRequiredCreateInput = {
  title: 't',
  author: { create: { name: 'n', email: 'e' } },
};
export const postWithAuthorConnect: PostRequiredCreateInput = { title: 't', author: { connect: 'author:1' } };
export const postWithAuthorKey: PostRequiredCreateInput = { title: 't', authorId: 'author:1' };

// @ts-expect-error - a required relation needs the nested operation or the key
export const postWithoutAuthor: PostRequiredCreateInput = { title: 't' };

// =============================================================================
// Optional relations can be omitted
// =============================================================================

checks([
  check<IsOptional<UserRequiredCreateInput, 'profile'>, 1, Test.Pass>(),
  check<NonNullable<UserRequiredCreateInput['profile']>, OneOp<ProfileRequiredNestedCreate>, Test.Pass>(),
]);

export const userWithoutProfile: UserRequiredCreateInput = { email: 'e', name: 'n' };

// =============================================================================
// To-many relations: create and connect take one or many
// =============================================================================

type StudentCoursesBranch = Extract<StudentCreateInput, { courses?: unknown }>;
checks([check<NonNullable<StudentCoursesBranch['courses']>, ManyOp<CourseNestedCreate>, Test.Pass>()]);

export const studentCreateArray: StudentCreateInput = {
  name: 'n',
  email: 'e',
  courses: {
    create: [
      { name: 'a', code: 'c' },
      { name: 'b', code: 'd' },
    ],
  },
};
export const studentConnectArray: StudentCreateInput = { name: 'n', email: 'e', courses: { connect: ['c1', 'c2'] } };
export const studentCreateOne: StudentCreateInput = {
  name: 'n',
  email: 'e',
  courses: { create: { name: 'a', code: 'c' } },
};
export const studentConnectOne: StudentCreateInput = { name: 'n', email: 'e', courses: { connect: 'c1' } };

// =============================================================================
// Non-owning side: creating children points their key back at the parent
// =============================================================================

checks([check<NonNullable<AuthorCreateInput['posts']>, ManyOp<PostRequiredNestedCreate>, Test.Pass>()]);

export const authorCreatePosts: AuthorCreateInput = {
  name: 'n',
  email: 'e',
  posts: { create: [{ title: 'a' }, { title: 'b', body: 'c' }] },
};
export const authorConnectPosts: AuthorCreateInput = { name: 'n', email: 'e', posts: { connect: ['p1', 'p2'] } };

// =============================================================================
// Mixed relations in one create
// =============================================================================

type KitchenSinkBranch = Extract<KitchenSinkUserCreateInput, { profile?: unknown }>;
checks([
  check<NonNullable<KitchenSinkBranch['profile']>, OneOp<KitchenSinkProfileNestedCreate>, Test.Pass>(),
  check<NonNullable<KitchenSinkBranch['posts']>, ManyOp<KitchenSinkPostNestedCreate>, Test.Pass>(),
  check<NonNullable<KitchenSinkBranch['tags']>, ManyOp<KitchenSinkTagNestedCreate>, Test.Pass>(),
  check<NonNullable<KitchenSinkBranch['settings']>, OneOp<KitchenSinkSettingsNestedCreate>, Test.Pass>(),
  check<NonNullable<KitchenSinkBranch['badges']>, ManyOp<KitchenSinkBadgeNestedCreate>, Test.Pass>(),
]);

export const kitchenSinkComplex: KitchenSinkUserCreateInput = {
  email: 'e',
  name: 'n',
  profile: { create: { bio: 'b' } },
  tags: { connect: ['t1', 't2'] },
  settings: { create: { theme: 't' } },
};
