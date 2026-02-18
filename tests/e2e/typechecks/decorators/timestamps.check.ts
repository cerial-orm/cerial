/**
 * Type checks for timestamp decorators (@now, @createdAt, @updatedAt)
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests types generated for:
 * - @now (COMPUTED): present in output, omitted from Create/Update/Where
 * - @createdAt: optional in Create/Update, present in Where
 * - @updatedAt: optional in Create/Update, present in Where
 * - TimestampInfo object: @createdAt/@updatedAt optional in CreateInput
 *   Note: @now is NOT allowed on object fields (COMPUTED must be top-level)
 */

import { Test } from 'ts-toolbelt';
import type {
  TimestampInfoCreateInput,
  TimestampTest,
  TimestampTestCreate,
  TimestampTestSelect,
  TimestampTestUpdate,
  TimestampTestWhere,
} from '../../generated';

const { checks, check } = Test;

// Helper: 1 if K is a key of T (required OR optional), 0 otherwise
type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;

// Helper: 1 if A extends B
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// TimestampTest Output Type — all timestamp fields present
// =============================================================================

// accessedAt (@now) exists in output type
checks([check<HasKey<TimestampTest, 'accessedAt'>, 1, Test.Pass>()]);

// createdAt (@createdAt) exists in output type
checks([check<HasKey<TimestampTest, 'createdAt'>, 1, Test.Pass>()]);

// updatedAt (@updatedAt) exists in output type
checks([check<HasKey<TimestampTest, 'updatedAt'>, 1, Test.Pass>()]);

// =============================================================================
// TimestampTestCreate — @now omitted, @createdAt/@updatedAt optional
// =============================================================================

// accessedAt (@now) does NOT exist in Create type (computed, omitted)
checks([check<HasKey<TimestampTestCreate, 'accessedAt'>, 0, Test.Pass>()]);

// createdAt (@createdAt) exists in Create type (optional)
checks([check<HasKey<TimestampTestCreate, 'createdAt'>, 1, Test.Pass>()]);

// updatedAt (@updatedAt) exists in Create type (optional)
checks([check<HasKey<TimestampTestCreate, 'updatedAt'>, 1, Test.Pass>()]);

// =============================================================================
// TimestampTestUpdate — @now omitted, @createdAt/@updatedAt optional
// =============================================================================

// accessedAt (@now) does NOT exist in Update type (computed, omitted)
checks([check<HasKey<TimestampTestUpdate, 'accessedAt'>, 0, Test.Pass>()]);

// createdAt (@createdAt) exists in Update type (optional via Partial)
checks([check<HasKey<TimestampTestUpdate, 'createdAt'>, 1, Test.Pass>()]);

// updatedAt (@updatedAt) exists in Update type (optional via Partial)
checks([check<HasKey<TimestampTestUpdate, 'updatedAt'>, 1, Test.Pass>()]);

// =============================================================================
// TimestampTestWhere — @now excluded, @createdAt/@updatedAt present
// =============================================================================

// accessedAt (@now) does NOT exist in Where type (excluded from filtering)
checks([check<HasKey<TimestampTestWhere, 'accessedAt'>, 0, Test.Pass>()]);

// createdAt (@createdAt) exists in Where type
checks([check<HasKey<TimestampTestWhere, 'createdAt'>, 1, Test.Pass>()]);

// updatedAt (@updatedAt) exists in Where type
checks([check<HasKey<TimestampTestWhere, 'updatedAt'>, 1, Test.Pass>()]);

// =============================================================================
// TimestampTestSelect — @now field IS selectable
// =============================================================================

// accessedAt can appear in select (it's readable, just not writable/filterable)
checks([check<Extends<{ accessedAt: true }, TimestampTestSelect>, 1, Test.Pass>()]);

// =============================================================================
// TimestampInfoCreateInput — @createdAt/@updatedAt optional
// (no @now on objects — COMPUTED must be top-level)
// =============================================================================

// createdAt (@createdAt) exists in TimestampInfoCreateInput (optional)
checks([check<HasKey<TimestampInfoCreateInput, 'createdAt'>, 1, Test.Pass>()]);

// updatedAt (@updatedAt) exists in TimestampInfoCreateInput (optional)
checks([check<HasKey<TimestampInfoCreateInput, 'updatedAt'>, 1, Test.Pass>()]);
