/**
 * Exact-equality checks for foreign-key type inference.
 *
 * A foreign key is declared as a bare `Record`; its type comes from the target
 * model's `@id`. A target with `Record(int) @id` therefore gives every key that
 * points at it a number, and a target with a plain `@id` a string.
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type { CerialId, CerialNone, RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type { IsOptional } from '../helpers';
import type {
  Book,
  BookCreate,
  BookInput,
  BookUpdate,
  FkChildModel,
  FkChildModelCreate,
  FkChildModelInput,
  FkChildModelNestedCreate,
  FkChildModelUpdate,
  FkChildModelWhere,
  StandaloneRefModel,
  StandaloneRefModelCreate,
  Student,
  StudentInput,
} from '../../generated';

const { checks, check } = Test;

// =============================================================================
// Foreign key to an int-id target: number everywhere, not string
// =============================================================================

checks([
  check<FkChildModel['parentId'], CerialId<number>, Test.Pass>(),
  check<FkChildModelInput['parentId'], RecordIdInput<number>, Test.Pass>(),
  check<FkChildModelCreate['parentId'], RecordIdInput<number>, Test.Pass>(),
  check<FkChildModelUpdate['parentId'], RecordIdInput<number> | undefined, Test.Pass>(),
]);

// The child's own plain `Record @id` stays a string
checks([check<FkChildModel['id'], CerialId<string>, Test.Pass>()]);

// A required relation makes the key required on create, and a nested create
// supplies it from the parent so the key is not offered at all
checks([
  check<IsOptional<FkChildModelCreate, 'parentId'>, 0, Test.Pass>(),
  check<'parentId' extends keyof FkChildModelNestedCreate ? 1 : 0, 0, Test.Pass>(),
]);

// The where filter takes the same inferred type
checks([
  check<
    NonNullable<FkChildModelWhere['parentId']> extends infer W ? (RecordIdInput<number> extends W ? 1 : 0) : never,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// Foreign key to a string-id target
// =============================================================================

// An optional relation makes the key optional and nullable
checks([
  check<Book['publisherId'], CerialId<string> | null | undefined, Test.Pass>(),
  check<BookInput['publisherId'], RecordIdInput<string> | null | undefined, Test.Pass>(),
  check<IsOptional<BookCreate, 'publisherId'>, 1, Test.Pass>(),
  check<BookUpdate['publisherId'], RecordIdInput<string> | null | CerialNone | undefined, Test.Pass>(),
]);

// =============================================================================
// Array foreign keys
// =============================================================================

checks([
  check<Student['courseIds'], CerialId<string>[], Test.Pass>(),
  check<StudentInput['courseIds'], RecordIdInput<string>[], Test.Pass>(),
]);

// =============================================================================
// Standalone `Record(int)` fields have no relation and carry the written type
// =============================================================================

checks([
  check<StandaloneRefModel['externalRef'], CerialId<number>, Test.Pass>(),
  check<StandaloneRefModel['externalRefs'], CerialId<number>[], Test.Pass>(),
  check<StandaloneRefModelCreate['externalRef'], RecordIdInput<number>, Test.Pass>(),
  // arrays default to [] on create, so the key may be omitted
  check<StandaloneRefModelCreate['externalRefs'], RecordIdInput<number>[] | undefined, Test.Pass>(),
  check<IsOptional<StandaloneRefModelCreate, 'externalRefs'>, 1, Test.Pass>(),
]);

// =============================================================================
// Negative: a string id is not a number-id foreign key
// =============================================================================

export const numberKey: FkChildModelCreate = { parentId: 1, note: 'ok' };

// @ts-expect-error - the target has an int id, so the key is a number or a record id, not a string
export const stringKey: FkChildModelCreate = { parentId: 'abc', note: 'x' };

// @ts-expect-error - the key is required on create
export const missingKey: FkChildModelCreate = { note: 'x' };
