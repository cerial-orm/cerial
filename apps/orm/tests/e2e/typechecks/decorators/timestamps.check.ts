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
 *
 * Every shape is compared with `Test.check`, which fails on a wider or a
 * narrower type.
 */

import type { CerialId, CerialNone } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  TimestampInfo,
  TimestampInfoCreateInput,
  TimestampInfoInput,
  TimestampTest,
  TimestampTestCreate,
  TimestampTestSelect,
  TimestampTestUpdate,
  TimestampTestWhere,
} from '../../generated';
import type { Flat, IsOptional } from '../helpers';

const { checks, check } = Test;

// =============================================================================
// TimestampTest output: every timestamp field is present
// =============================================================================

checks([
  check<
    Flat<TimestampTest>,
    {
      id: CerialId<string>;
      name: string;
      createdAt?: Date;
      updatedAt?: Date;
      accessedAt?: Date;
      meta?: Flat<TimestampInfo>;
    },
    Test.Pass
  >(),
]);

// =============================================================================
// TimestampTestCreate: @now omitted, @createdAt and @updatedAt optional
// =============================================================================

checks([
  check<
    Flat<TimestampTestCreate>,
    {
      id?: string;
      name: string;
      createdAt?: Date;
      updatedAt?: Date;
      meta?: TimestampInfoCreateInput;
    },
    Test.Pass
  >(),
  check<'accessedAt' extends keyof TimestampTestCreate ? 1 : 0, 0, Test.Pass>(),
  check<IsOptional<TimestampTestCreate, 'createdAt'>, 1, Test.Pass>(),
  check<IsOptional<TimestampTestCreate, 'updatedAt'>, 1, Test.Pass>(),
  check<IsOptional<TimestampTestCreate, 'name'>, 0, Test.Pass>(),
]);

// =============================================================================
// TimestampTestUpdate: @now omitted, @createdAt and @updatedAt optional and clearable
// =============================================================================

checks([
  check<
    Flat<TimestampTestUpdate>,
    {
      name?: string;
      meta?: Flat<Partial<TimestampInfoInput>> | { set: Flat<TimestampInfoInput> } | CerialNone;
      createdAt?: Date | CerialNone;
      updatedAt?: Date | CerialNone;
    },
    Test.Pass
  >(),
  check<'accessedAt' extends keyof TimestampTestUpdate ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// TimestampTestWhere: @now excluded, @createdAt and @updatedAt filterable
// =============================================================================

checks([
  check<
    keyof TimestampTestWhere,
    'id' | 'name' | 'createdAt' | 'updatedAt' | 'meta' | 'AND' | 'OR' | 'NOT',
    Test.Pass
  >(),
  check<
    NonNullable<TimestampTestWhere['createdAt']> extends infer W ? (Date extends W ? 1 : 0) : never,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// TimestampTestSelect: the @now field is selectable (readable, not writable or filterable)
// =============================================================================

type SelectedKeys = TimestampTestSelect extends infer S ? (S extends unknown ? keyof S : never) : never;

checks([check<SelectedKeys, 'id' | 'name' | 'createdAt' | 'updatedAt' | 'accessedAt' | 'meta', Test.Pass>()]);

// =============================================================================
// TimestampInfoCreateInput: @createdAt and @updatedAt optional
// (no @now on objects — COMPUTED must be top-level)
// =============================================================================

checks([
  check<TimestampInfoCreateInput, { label: string; createdAt?: Date; updatedAt?: Date }, Test.Pass>(),
  check<IsOptional<TimestampInfoCreateInput, 'createdAt'>, 1, Test.Pass>(),
  check<IsOptional<TimestampInfoCreateInput, 'updatedAt'>, 1, Test.Pass>(),
  check<IsOptional<TimestampInfoCreateInput, 'label'>, 0, Test.Pass>(),
]);

// =============================================================================
// Negative
// =============================================================================

export const nameOnly: TimestampTestCreate = { name: 'x' };

// @ts-expect-error - a computed @now field cannot be written on create
export const writeNow: TimestampTestCreate = { name: 'x', accessedAt: new Date() };

// @ts-expect-error - a computed @now field cannot be written on update
export const updateNow: TimestampTestUpdate = { accessedAt: new Date() };

// @ts-expect-error - a computed @now field cannot be filtered
export const filterNow: TimestampTestWhere = { accessedAt: new Date() };

// @ts-expect-error - a timestamp takes a Date, not a string
export const stringTimestamp: TimestampTestCreate = { name: 'x', createdAt: '2026-01-01' };
