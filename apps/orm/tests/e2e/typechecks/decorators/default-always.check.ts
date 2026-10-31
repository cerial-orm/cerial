/**
 * Type checks for @defaultAlways decorator
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests types generated for:
 * - @defaultAlways(value): optional in Create, present in Update (Partial), present in Where
 * - ReviewMetaCreateInput: @defaultAlways fields optional in object CreateInput
 *
 * Every shape is compared with `Test.check`, which fails on a wider or a
 * narrower type.
 */

import type { CerialId, CerialNone } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  ContentItem,
  ContentItemCreate,
  ContentItemSelect,
  ContentItemUpdate,
  ContentItemWhere,
  ReviewMeta,
  ReviewMetaCreateInput,
  ReviewMetaInput,
} from '../../generated';
import type { Flat, IsOptional } from '../helpers';

const { checks, check } = Test;

// =============================================================================
// ContentItem output: the @defaultAlways fields are optional values of their own type
// =============================================================================

checks([
  check<
    Flat<ContentItem>,
    {
      id: CerialId<string>;
      title: string;
      body: string;
      reviewed?: boolean;
      syncStatus?: string;
      retryCount?: number;
      score?: number;
      meta?: Flat<ReviewMeta>;
    },
    Test.Pass
  >(),
]);

// =============================================================================
// ContentItemCreate: @defaultAlways fields may be omitted, the rest may not
// =============================================================================

checks([
  check<
    Flat<ContentItemCreate>,
    {
      id?: string;
      title: string;
      body: string;
      reviewed?: boolean;
      syncStatus?: string;
      retryCount?: number;
      score?: number;
      meta?: ReviewMetaCreateInput;
    },
    Test.Pass
  >(),
  check<IsOptional<ContentItemCreate, 'reviewed'>, 1, Test.Pass>(),
  check<IsOptional<ContentItemCreate, 'syncStatus'>, 1, Test.Pass>(),
  check<IsOptional<ContentItemCreate, 'retryCount'>, 1, Test.Pass>(),
  check<IsOptional<ContentItemCreate, 'score'>, 1, Test.Pass>(),
  check<IsOptional<ContentItemCreate, 'title'>, 0, Test.Pass>(),
  check<IsOptional<ContentItemCreate, 'body'>, 0, Test.Pass>(),
]);

// =============================================================================
// ContentItemUpdate: every field optional, and each @defaultAlways field can be cleared
// =============================================================================

checks([
  check<
    Flat<ContentItemUpdate>,
    {
      title?: string;
      body?: string;
      meta?: Flat<Partial<ReviewMetaInput>> | { set: Flat<ReviewMetaInput> } | CerialNone;
      reviewed?: boolean | CerialNone;
      syncStatus?: string | CerialNone;
      retryCount?: number | CerialNone;
      score?: number | CerialNone;
    },
    Test.Pass
  >(),
  // The id is never updatable
  check<'id' extends keyof ContentItemUpdate ? 1 : 0, 0, Test.Pass>(),
]);

// =============================================================================
// ContentItemWhere: every field filterable
// =============================================================================

checks([
  check<
    keyof ContentItemWhere,
    | 'id'
    | 'title'
    | 'body'
    | 'reviewed'
    | 'syncStatus'
    | 'retryCount'
    | 'score'
    | 'meta'
    | '$raw'
    | 'AND'
    | 'OR'
    | 'NOT',
    Test.Pass
  >(),
  // A @defaultAlways field filters by the type of its value
  check<NonNullable<ContentItemWhere['reviewed']> extends infer W ? (true extends W ? 1 : 0) : never, 1, Test.Pass>(),
  check<NonNullable<ContentItemWhere['retryCount']> extends infer W ? (3 extends W ? 1 : 0) : never, 1, Test.Pass>(),
  check<
    NonNullable<ContentItemWhere['syncStatus']> extends infer W ? ('dirty' extends W ? 1 : 0) : never,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// ContentItemSelect: a select names any one field as the required one
// =============================================================================

type SelectedKeys = ContentItemSelect extends infer S ? (S extends unknown ? keyof S : never) : never;

checks([
  check<
    SelectedKeys,
    'id' | 'title' | 'body' | 'reviewed' | 'syncStatus' | 'retryCount' | 'score' | 'meta',
    Test.Pass
  >(),
]);

// =============================================================================
// ReviewMetaCreateInput: all fields have defaults, so all are optional
// =============================================================================

checks([
  check<ReviewMetaCreateInput, { note?: string; flagged?: boolean }, Test.Pass>(),
  check<IsOptional<ReviewMetaCreateInput, 'note'>, 1, Test.Pass>(),
  check<IsOptional<ReviewMetaCreateInput, 'flagged'>, 1, Test.Pass>(),
]);

// =============================================================================
// Negative
// =============================================================================

export const onlyRequired: ContentItemCreate = { title: 'x', body: 'y' };
export const emptyMeta: ContentItemCreate = { title: 'x', body: 'y', meta: {} };

// @ts-expect-error - title has no default, so it is required
export const missingTitle: ContentItemCreate = { body: 'y' };

// @ts-expect-error - a @defaultAlways value keeps its declared type
export const wrongType: ContentItemCreate = { title: 'x', body: 'y', retryCount: 'many' };

// @ts-expect-error - a @defaultAlways boolean is not a string
export const wrongBoolean: ContentItemUpdate = { reviewed: 'yes' };
