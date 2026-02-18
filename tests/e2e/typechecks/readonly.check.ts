/**
 * Type checks for @readonly decorator
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests types generated for:
 * - @readonly fields: present in output, Create, Where, Select — excluded from Update
 * - @readonly object sub-fields: excluded from object update Partial types
 * - @readonly PK Record: relation excluded from UpdateInput nested ops
 */

import { Test } from 'ts-toolbelt';
import type {
  ReadonlyRecord,
  ReadonlyRecordCreate,
  ReadonlyRecordUpdate,
  ReadonlyRecordUpdateInput,
  ReadonlyTest,
  ReadonlyTestCreate,
  ReadonlyTestSelect,
  ReadonlyTestUpdate,
  ReadonlyTestWhere,
} from '../generated';

const { checks, check } = Test;

// Helper: 1 if K is a key of T (required OR optional), 0 otherwise
type HasKey<T, K extends string> = K extends keyof T ? 1 : 0;

// Helper: 1 if A extends B
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// ReadonlyTest Output Type — all fields present (including @readonly)
// =============================================================================

checks([check<HasKey<ReadonlyTest, 'id'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'name'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'code'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'score'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'tags'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'createdBy'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'address'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTest, 'meta'>, 1, Test.Pass>()]);

// =============================================================================
// ReadonlyTestCreate — @readonly fields ARE present (writable on create)
// =============================================================================

checks([check<HasKey<ReadonlyTestCreate, 'name'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestCreate, 'code'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestCreate, 'score'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestCreate, 'tags'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestCreate, 'createdBy'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestCreate, 'address'>, 1, Test.Pass>()]);

// =============================================================================
// ReadonlyTestUpdate — @readonly fields NOT present (excluded from update)
// =============================================================================

// @readonly fields should NOT be in Update type
checks([check<HasKey<ReadonlyTestUpdate, 'code'>, 0, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestUpdate, 'score'>, 0, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestUpdate, 'createdBy'>, 0, Test.Pass>()]);

// Non-readonly fields SHOULD be in Update type
checks([check<HasKey<ReadonlyTestUpdate, 'name'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestUpdate, 'tags'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestUpdate, 'address'>, 1, Test.Pass>()]);

// =============================================================================
// ReadonlyTestWhere — @readonly fields ARE present (can filter by them)
// =============================================================================

checks([check<HasKey<ReadonlyTestWhere, 'code'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestWhere, 'score'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestWhere, 'createdBy'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyTestWhere, 'name'>, 1, Test.Pass>()]);

// =============================================================================
// ReadonlyTestSelect — @readonly fields ARE selectable
// =============================================================================

checks([check<Extends<{ code: true }, ReadonlyTestSelect>, 1, Test.Pass>()]);
checks([check<Extends<{ score: true }, ReadonlyTestSelect>, 1, Test.Pass>()]);
checks([check<Extends<{ createdBy: true }, ReadonlyTestSelect>, 1, Test.Pass>()]);

// =============================================================================
// ReadonlyRecord — @readonly PK Record field
// =============================================================================

// Output type: all fields present
checks([check<HasKey<ReadonlyRecord, 'authorId'>, 1, Test.Pass>()]);
checks([check<HasKey<ReadonlyRecord, 'name'>, 1, Test.Pass>()]);

// Create type: authorId is present (writable on create)
checks([check<HasKey<ReadonlyRecordCreate, 'authorId'>, 1, Test.Pass>()]);

// Update type: authorId is NOT present (readonly)
checks([check<HasKey<ReadonlyRecordUpdate, 'authorId'>, 0, Test.Pass>()]);
checks([check<HasKey<ReadonlyRecordUpdate, 'name'>, 1, Test.Pass>()]);

// UpdateInput should NOT have nested author connect/disconnect ops
// (It should be just ReadonlyRecordUpdate since the only relation has a @readonly PK)
checks([check<Extends<ReadonlyRecordUpdateInput, ReadonlyRecordUpdate>, 1, Test.Pass>()]);
