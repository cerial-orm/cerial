/**
 * Type checks for Nested Create types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  UserRequiredCreateInput,
  ProfileRequiredCreateInput,
  AuthorCreateInput,
  PostRequiredCreateInput,
  StudentCreateInput,
  CourseCreateInput,
  KitchenSinkUserCreateInput,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Nested Create vs Connect (Mutually Exclusive for Single Relations)
// =============================================================================

// For 1-1: create XOR connect - both should be valid input types
type ProfileWithCreate = { bio: string; user: { create: { email: string; name: string } } };
type ProfileWithConnect = { bio: string; user: { connect: string } };

Test.checks([
  Test.check<Extends<ProfileWithCreate, ProfileRequiredCreateInput>, 1, Test.Pass>(),
  Test.check<Extends<ProfileWithConnect, ProfileRequiredCreateInput>, 1, Test.Pass>(),
]);

// =============================================================================
// Required Relations Must Provide Nested or Connect
// =============================================================================

// PostRequired.author is required - must provide via nested create or connect
type PostWithAuthorCreate = {
  title: string;
  author: { create: { name: string; email: string } };
};
type PostWithAuthorConnect = {
  title: string;
  author: { connect: string };
};
type PostWithAuthorIdDirect = {
  title: string;
  authorId: string;
};

Test.checks([
  Test.check<Extends<PostWithAuthorCreate, PostRequiredCreateInput>, 1, Test.Pass>(),
  Test.check<Extends<PostWithAuthorConnect, PostRequiredCreateInput>, 1, Test.Pass>(),
  Test.check<Extends<PostWithAuthorIdDirect, PostRequiredCreateInput>, 1, Test.Pass>(),
]);

// =============================================================================
// Optional Relations Can Be Omitted
// =============================================================================

// UserRequired.profile is optional in schema (non-PK side)
type UserWithoutProfile = { email: string; name: string };
Test.checks([Test.check<Extends<UserWithoutProfile, UserRequiredCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Array Relations - Create and Connect Arrays
// =============================================================================

// Student.courses allows create array
type StudentWithCoursesCreateArray = {
  name: string;
  email: string;
  courses: { create: [{ name: string; code: string }, { name: string; code: string }] };
};

// Student.courses allows connect array
type StudentWithCoursesConnectArray = {
  name: string;
  email: string;
  courses: { connect: ['course1', 'course2'] };
};

// Student.courses allows single create
type StudentWithSingleCourseCreate = {
  name: string;
  email: string;
  courses: { create: { name: string; code: string } };
};

// Student.courses allows single connect
type StudentWithSingleCourseConnect = {
  name: string;
  email: string;
  courses: { connect: string };
};

Test.checks([
  Test.check<Extends<StudentWithCoursesCreateArray, StudentCreateInput>, 1, Test.Pass>(),
  Test.check<Extends<StudentWithCoursesConnectArray, StudentCreateInput>, 1, Test.Pass>(),
  Test.check<Extends<StudentWithSingleCourseCreate, StudentCreateInput>, 1, Test.Pass>(),
  Test.check<Extends<StudentWithSingleCourseConnect, StudentCreateInput>, 1, Test.Pass>(),
]);

// =============================================================================
// From Non-PK Side - Create Children with FK Back to Parent
// =============================================================================

// Author.posts is non-PK side - creates posts with authorId pointing back
type AuthorWithPostsCreate = {
  name: string;
  email: string;
  posts: { create: [{ title: string }, { title: string; content: string }] };
};
Test.checks([Test.check<Extends<AuthorWithPostsCreate, AuthorCreateInput>, 1, Test.Pass>()]);

// Author can also connect to existing posts
type AuthorWithPostsConnect = {
  name: string;
  email: string;
  posts: { connect: string[] };
};
Test.checks([Test.check<Extends<AuthorWithPostsConnect, AuthorCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Mixed Relations in Same Create
// =============================================================================

// KitchenSinkUser has multiple relation types
type KitchenSinkComplex = {
  email: string;
  name: string;
  profile: { create: { bio: string } }; // 1-1 required
  tags: { connect: string[] }; // n-n
  settings: { create: { theme: string } }; // 1-1 optional
};
Test.checks([Test.check<Extends<KitchenSinkComplex, KitchenSinkUserCreateInput>, 1, Test.Pass>()]);
