/**
 * Exact-equality checks for which relations appear in `{Model}OrderBy`.
 *
 * Only a forward to-one relation (the side that owns the foreign key) is
 * orderable. Reverse sides, array-key relations and many-to-many relations are
 * left out, and the foreign-key field itself stays orderable.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  AuthorOrderBy,
  CourseOrderBy,
  PostRequiredOrderBy,
  ProfileOrderBy,
  StudentOrderBy,
  UserOrderBy,
} from '../../generated';

const { checks, check } = Test;

type Dir = 'asc' | 'desc' | undefined;

// =============================================================================
// Forward to-one: the relation key is present and typed as the target's OrderBy
// =============================================================================

checks([
  // Required forward relation
  check<keyof PostRequiredOrderBy, 'id' | 'title' | 'body' | 'authorId' | 'author' | 'createdAt', Test.Pass>(),
  check<PostRequiredOrderBy['author'], AuthorOrderBy | undefined, Test.Pass>(),
  // Optional forward relation
  check<keyof ProfileOrderBy, 'id' | 'bio' | 'avatarUrl' | 'userId' | 'user', Test.Pass>(),
  check<ProfileOrderBy['user'], UserOrderBy | undefined, Test.Pass>(),
  // The foreign key stays orderable by direction next to the relation
  check<PostRequiredOrderBy['authorId'], Dir, Test.Pass>(),
  check<ProfileOrderBy['userId'], Dir, Test.Pass>(),
]);

// =============================================================================
// Absent: reverse relations, array-key relations and the sides of many-to-many
// =============================================================================

checks([
  // Author is the reverse side of PostRequired.author, so `posts` is not offered
  check<keyof AuthorOrderBy, 'id' | 'name' | 'email', Test.Pass>(),
  // Many-to-many through array keys: only the key arrays remain, ordered by direction
  check<keyof StudentOrderBy, 'id' | 'name' | 'email' | 'courseIds', Test.Pass>(),
  check<keyof CourseOrderBy, 'id' | 'name' | 'code' | 'studentIds', Test.Pass>(),
  check<StudentOrderBy['courseIds'], Dir, Test.Pass>(),
  // A model with a forward relation and an array-key relation offers only the forward one
  check<
    keyof UserOrderBy,
    | 'id'
    | 'email'
    | 'name'
    | 'age'
    | 'isActive'
    | 'createdAt'
    | 'nicknames'
    | 'scores'
    | 'loginDates'
    | 'profileId'
    | 'profile'
    | 'tagIds',
    Test.Pass
  >(),
  check<UserOrderBy['profile'], ProfileOrderBy | undefined, Test.Pass>(),
  check<'tags' extends keyof UserOrderBy ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// Negative: an absent relation cannot be ordered
// =============================================================================

// @ts-expect-error - the reverse side is not orderable
export const reverseSide: AuthorOrderBy = { posts: { title: 'asc' } };

// @ts-expect-error - an array-key relation is not orderable
export const arrayKeyRelation: StudentOrderBy = { courses: { name: 'asc' } };

// @ts-expect-error - a forward relation takes the target's fields, not a direction
export const bareRelation: PostRequiredOrderBy = { author: 'asc' };
