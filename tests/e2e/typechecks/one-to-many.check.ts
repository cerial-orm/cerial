/**
 * Type checks for One-to-Many relation types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  Author,
  AuthorCreateInput,
  AuthorUpdateInput,
  AuthorInclude,
  PostRequired,
  PostRequiredCreate,
  PostRequiredCreateInput,
  PostRequiredUpdateInput,
  Publisher,
  PublisherCreateInput,
  PublisherInclude,
  Book,
  BookCreateInput,
  BookUpdateInput,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Required 1-n: Author <-> PostRequired
// =============================================================================

// Author base type
Test.checks([
  Test.check<Author['id'], string, Test.Pass>(),
  Test.check<Author['name'], string, Test.Pass>(),
  Test.check<Author['email'], string, Test.Pass>(),
]);

// PostRequired should have authorId (the FK)
Test.checks([
  Test.check<PostRequired['id'], string, Test.Pass>(),
  Test.check<PostRequired['title'], string, Test.Pass>(),
  Test.check<PostRequired['authorId'], string, Test.Pass>(),
]);

// =============================================================================
// Parent Create with Children Array
// =============================================================================

// AuthorCreateInput should allow nested posts create array
type AuthorWithPostsCreate = {
  name: string;
  email: string;
  posts: { create: [{ title: string }, { title: string }] };
};
Test.checks([Test.check<Extends<AuthorWithPostsCreate, AuthorCreateInput>, 1, Test.Pass>()]);

// AuthorCreateInput should allow posts connect array
type AuthorWithPostsConnect = {
  name: string;
  email: string;
  posts: { connect: string[] };
};
Test.checks([Test.check<Extends<AuthorWithPostsConnect, AuthorCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Child Create with Parent
// =============================================================================

// PostRequiredCreateInput should allow nested author create
type PostWithAuthorCreate = {
  title: string;
  author: { create: { name: string; email: string } };
};
Test.checks([Test.check<Extends<PostWithAuthorCreate, PostRequiredCreateInput>, 1, Test.Pass>()]);

// PostRequiredCreateInput should allow author connect
type PostWithAuthorConnect = {
  title: string;
  author: { connect: string };
};
Test.checks([Test.check<Extends<PostWithAuthorConnect, PostRequiredCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Optional 1-n: Publisher <-> Book
// =============================================================================

// Publisher without books should be valid
type PublisherWithoutBooks = { name: string };
Test.checks([Test.check<Extends<PublisherWithoutBooks, PublisherCreateInput>, 1, Test.Pass>()]);

// Book without publisher should be valid (optional FK)
type BookWithoutPublisher = { title: string; isbn: string };
Test.checks([Test.check<Extends<BookWithoutPublisher, BookCreateInput>, 1, Test.Pass>()]);

// Book with publisher connect
type BookWithPublisherConnect = {
  title: string;
  isbn: string;
  publisher: { connect: string };
};
Test.checks([Test.check<Extends<BookWithPublisherConnect, BookCreateInput>, 1, Test.Pass>()]);

// =============================================================================
// Update Types
// =============================================================================

// PostRequiredUpdateInput should allow author reassignment
type PostReassignAuthor = { author: { connect: string } };
Test.checks([Test.check<Extends<PostReassignAuthor, PostRequiredUpdateInput>, 1, Test.Pass>()]);

// BookUpdateInput should allow disconnect (optional)
type BookDisconnectPublisher = { publisher: { disconnect: true } };
Test.checks([Test.check<Extends<BookDisconnectPublisher, BookUpdateInput>, 1, Test.Pass>()]);

// =============================================================================
// Include Types - Array Relations
// =============================================================================

// AuthorInclude should support posts include with options
type IncludePosts = { posts: true };
type IncludePostsWithOptions = {
  posts: {
    where: { title: { contains: string } };
    orderBy: { createdAt: 'desc' };
    limit: number;
    offset: number;
  };
};
Test.checks([
  Test.check<Extends<IncludePosts, AuthorInclude>, 1, Test.Pass>(),
  Test.check<Extends<IncludePostsWithOptions, AuthorInclude>, 1, Test.Pass>(),
]);

// PublisherInclude should support books include
type IncludeBooks = { books: true };
Test.checks([Test.check<Extends<IncludeBooks, PublisherInclude>, 1, Test.Pass>()]);
