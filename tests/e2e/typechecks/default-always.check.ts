/**
 * Type checks for @defaultAlways decorator
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests types generated for:
 * - @defaultAlways(value): optional in Create, present in Update (Partial), present in Where
 * - ReviewMetaCreateInput: @defaultAlways fields optional in object CreateInput
 */

import { Test } from 'ts-toolbelt';
import type {
  ContentItem,
  ContentItemCreate,
  ContentItemSelect,
  ContentItemUpdate,
  ContentItemWhere,
  ReviewMetaCreateInput,
} from '../generated';

const { checks, check } = Test;

// Helper: 1 if K is a key of T (required OR optional), 0 otherwise
type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;

// Helper: 1 if A extends B
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// ContentItem Output Type — all @defaultAlways fields present
// =============================================================================

// reviewed (@defaultAlways(false)) exists in output type
checks([check<HasKey<ContentItem, 'reviewed'>, 1, Test.Pass>()]);

// syncStatus (@defaultAlways("dirty")) exists in output type
checks([check<HasKey<ContentItem, 'syncStatus'>, 1, Test.Pass>()]);

// retryCount (@defaultAlways(0)) exists in output type
checks([check<HasKey<ContentItem, 'retryCount'>, 1, Test.Pass>()]);

// score (@defaultAlways(1.0)) exists in output type
checks([check<HasKey<ContentItem, 'score'>, 1, Test.Pass>()]);

// non-defaultAlways fields also present
checks([check<HasKey<ContentItem, 'title'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItem, 'body'>, 1, Test.Pass>()]);

// =============================================================================
// ContentItemCreate — @defaultAlways fields are optional
// =============================================================================

// reviewed is optional in Create (can be omitted, DB fills via DEFAULT ALWAYS)
checks([check<HasKey<ContentItemCreate, 'reviewed'>, 1, Test.Pass>()]);
checks([check<Extends<{ title: 'a'; body: 'b' }, ContentItemCreate>, 1, Test.Pass>()]);

// syncStatus is optional in Create
checks([check<HasKey<ContentItemCreate, 'syncStatus'>, 1, Test.Pass>()]);

// retryCount is optional in Create
checks([check<HasKey<ContentItemCreate, 'retryCount'>, 1, Test.Pass>()]);

// score is optional in Create
checks([check<HasKey<ContentItemCreate, 'score'>, 1, Test.Pass>()]);

// title and body are required (no @defaultAlways)
// Creating with only title and body should be valid
checks([check<Extends<{ title: 'x'; body: 'y' }, ContentItemCreate>, 1, Test.Pass>()]);

// =============================================================================
// ContentItemUpdate — @defaultAlways fields present (via Partial)
// =============================================================================

checks([check<HasKey<ContentItemUpdate, 'reviewed'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItemUpdate, 'syncStatus'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItemUpdate, 'retryCount'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItemUpdate, 'score'>, 1, Test.Pass>()]);

// =============================================================================
// ContentItemWhere — @defaultAlways fields present for filtering
// =============================================================================

checks([check<HasKey<ContentItemWhere, 'reviewed'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItemWhere, 'syncStatus'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItemWhere, 'retryCount'>, 1, Test.Pass>()]);
checks([check<HasKey<ContentItemWhere, 'score'>, 1, Test.Pass>()]);

// =============================================================================
// ContentItemSelect — @defaultAlways fields selectable
// =============================================================================

checks([check<Extends<{ reviewed: true }, ContentItemSelect>, 1, Test.Pass>()]);
checks([check<Extends<{ syncStatus: true }, ContentItemSelect>, 1, Test.Pass>()]);
checks([check<Extends<{ retryCount: true }, ContentItemSelect>, 1, Test.Pass>()]);
checks([check<Extends<{ score: true }, ContentItemSelect>, 1, Test.Pass>()]);

// =============================================================================
// ReviewMetaCreateInput — @defaultAlways fields optional in object CreateInput
// =============================================================================

// note (@defaultAlways("pending review")) is optional
checks([check<HasKey<ReviewMetaCreateInput, 'note'>, 1, Test.Pass>()]);

// flagged (@defaultAlways(false)) is optional
checks([check<HasKey<ReviewMetaCreateInput, 'flagged'>, 1, Test.Pass>()]);

// Can create ReviewMetaCreateInput with empty object (all fields have defaults)
checks([check<Extends<{}, ReviewMetaCreateInput>, 1, Test.Pass>()]);
