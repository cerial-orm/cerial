/**
 * Exact-equality checks for `{Model}NestedCreate` and for the shape of the
 * nested `create` / `connect` operations on forward and reverse relations.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type { IsOptional } from '../helpers';
import type {
  AuthorNestedCreate,
  AuthorCreateInput,
  BookCreateInput,
  BookNestedCreate,
  FkChildModelNestedCreate,
  FkTargetIntIdNestedCreate,
  PostRequiredCreateInput,
  PostRequiredNestedCreate,
  PublisherCreateInput,
  PublisherNestedCreate,
  StudentCreateInput,
  StudentNestedCreate,
} from '../../generated';

const { checks, check } = Test;

// =============================================================================
// NestedCreate drops the relation and the foreign key that the parent supplies
// =============================================================================

checks([
  // Book: no `publisher`, no `publisherId`
  check<keyof BookNestedCreate, 'id' | 'title' | 'isbn', Test.Pass>(),
  // Required relation: the key is dropped, the id and defaulted fields turn optional
  check<keyof PostRequiredNestedCreate, 'id' | 'title' | 'content' | 'createdAt', Test.Pass>(),
  check<IsOptional<PostRequiredNestedCreate, 'id'>, 1, Test.Pass>(),
  check<IsOptional<PostRequiredNestedCreate, 'content'>, 1, Test.Pass>(),
  check<IsOptional<PostRequiredNestedCreate, 'createdAt'>, 1, Test.Pass>(),
  check<IsOptional<PostRequiredNestedCreate, 'title'>, 0, Test.Pass>(),
  // Array foreign key: `courseIds` and `courses` both dropped
  check<keyof StudentNestedCreate, 'id' | 'name' | 'email', Test.Pass>(),
  // A reverse-only side has no key to drop
  check<keyof AuthorNestedCreate, 'id' | 'name' | 'email', Test.Pass>(),
  check<keyof PublisherNestedCreate, 'id' | 'name', Test.Pass>(),
  // An int-id target keeps its id required: it cannot be generated
  check<keyof FkTargetIntIdNestedCreate, 'id' | 'label', Test.Pass>(),
  check<IsOptional<FkTargetIntIdNestedCreate, 'id'>, 0, Test.Pass>(),
  check<keyof FkChildModelNestedCreate, 'id' | 'note', Test.Pass>(),
  check<IsOptional<FkChildModelNestedCreate, 'id'>, 1, Test.Pass>(),
]);

// Field types carried into the nested create are the model's own input types
checks([
  check<BookNestedCreate['title'], string, Test.Pass>(),
  check<PostRequiredNestedCreate['content'], string | null | undefined, Test.Pass>(),
  check<PostRequiredNestedCreate['createdAt'], Date | undefined, Test.Pass>(),
]);

// =============================================================================
// Forward to-one: the operation is typed as create OR connect
// =============================================================================

type BookPublisherOp = NonNullable<Extract<BookCreateInput, { publisher?: unknown }>['publisher']>;
type PostAuthorOp = Extract<PostRequiredCreateInput, { author: unknown }>['author'];

checks([
  check<BookPublisherOp, { create: PublisherNestedCreate } | { connect: RecordIdInput }, Test.Pass>(),
  // A required relation is required on the nested-operation branch
  check<PostAuthorOp, { create: AuthorNestedCreate } | { connect: RecordIdInput }, Test.Pass>(),
  check<IsOptional<Extract<PostRequiredCreateInput, { author: unknown }>, 'author'>, 0, Test.Pass>(),
]);

// The nested branch replaces the foreign key; it never allows both
checks([
  check<'publisherId' extends keyof Extract<BookCreateInput, { publisher?: unknown }> ? 1 : 0, 0, Test.Pass>(),
  check<'authorId' extends keyof Extract<PostRequiredCreateInput, { author: unknown }> ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// Reverse to-many: create and connect are independent, optional, and take one or many
// =============================================================================

type PublisherBooksOp = NonNullable<PublisherCreateInput['books']>;
type StudentCoursesOp = NonNullable<Extract<StudentCreateInput, { courses?: unknown }>['courses']>;

checks([
  check<
    PublisherBooksOp,
    { create?: BookNestedCreate | BookNestedCreate[]; connect?: RecordIdInput | RecordIdInput[] },
    Test.Pass
  >(),
  check<IsOptional<PublisherCreateInput, 'books'>, 1, Test.Pass>(),
  check<IsOptional<NonNullable<AuthorCreateInput['posts']>, 'create'>, 1, Test.Pass>(),
  check<IsOptional<NonNullable<AuthorCreateInput['posts']>, 'connect'>, 1, Test.Pass>(),
  check<keyof StudentCoursesOp, 'create' | 'connect', Test.Pass>(),
  // The array foreign key is replaced by the relation operation, as on the forward side
  check<'courseIds' extends keyof Extract<StudentCreateInput, { courses?: unknown }> ? 1 : 0, 0, Test.Pass>(),
]);

// Create-side operations never offer disconnect or set; those belong to update
checks([
  check<'disconnect' extends keyof PublisherBooksOp ? 1 : 0, 0, Test.Pass>(),
  check<'set' extends keyof PublisherBooksOp ? 1 : 0, 0, Test.Pass>(),
  check<'disconnect' extends keyof BookPublisherOp ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// Accepted and rejected values
// =============================================================================

export const createOne: BookCreateInput = { title: 't', isbn: 'i', publisher: { create: { name: 'p' } } };
export const connectOne: BookCreateInput = { title: 't', isbn: 'i', publisher: { connect: 'publisher:1' } };
export const createMany: PublisherCreateInput = {
  name: 'p',
  books: {
    create: [
      { title: 'a', isbn: '1' },
      { title: 'b', isbn: '2' },
    ],
    connect: ['book:1'],
  },
};

export const nestedWithKey: PublisherCreateInput = {
  name: 'p',
  // @ts-expect-error - a nested create must not carry the foreign key the parent supplies
  books: { create: { title: 'a', isbn: '1', publisherId: 'p:1' } },
};

// @ts-expect-error - a nested create still needs the model's required fields
export const nestedMissingField: PublisherCreateInput = { name: 'p', books: { create: { title: 'a' } } };

// @ts-expect-error - disconnect is an update operation
export const disconnectOnCreate: PublisherCreateInput = { name: 'p', books: { disconnect: 'book:1' } };

// @ts-expect-error - a forward relation takes create or connect, not an unknown operation
export const unknownOp: BookCreateInput = { title: 't', isbn: 'i', publisher: { upsert: { name: 'p' } } };

// @ts-expect-error - a required relation cannot be omitted when the foreign key is also absent
export const noAuthor: PostRequiredCreateInput = { title: 't' };

// @ts-expect-error - a forward relation operation must name create or connect; an empty one is rejected
export const emptyOp: BookCreateInput = { title: 't', isbn: 'i', publisher: {} };
