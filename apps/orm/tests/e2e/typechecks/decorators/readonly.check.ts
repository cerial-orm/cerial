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
 *
 * Every shape is compared with `Test.check`, which fails on a wider or a
 * narrower type.
 */

import type { CerialId, CerialNone, RecordIdInput } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  ReadonlyAddress,
  ReadonlyAddressInput,
  ReadonlyMeta,
  ReadonlyMetaInput,
  ReadonlyRecord,
  ReadonlyRecordCreate,
  ReadonlyRecordUpdate,
  ReadonlyRecordUpdateInput,
  ReadonlyTest,
  ReadonlyTestCreate,
  ReadonlyTestSelect,
  ReadonlyTestUpdate,
  ReadonlyTestWhere,
} from '../../generated';
import type { Flat, IsOptional } from '../helpers';

const { checks, check } = Test;

// =============================================================================
// ReadonlyTest output: every field present, @readonly included
// =============================================================================

checks([
  check<
    Flat<ReadonlyTest>,
    {
      id: CerialId<string>;
      name: string;
      code: string;
      score?: number;
      tags: string[];
      createdBy: string;
      address: Flat<ReadonlyAddress>;
      meta?: Flat<ReadonlyMeta>;
    },
    Test.Pass
  >(),
]);

// =============================================================================
// ReadonlyTestCreate: @readonly fields are writable on create
// =============================================================================

checks([
  check<
    Flat<ReadonlyTestCreate>,
    {
      id?: string;
      name: string;
      code: string;
      score?: number;
      tags?: string[];
      createdBy?: string;
      address: Flat<ReadonlyAddressInput>;
      meta?: Flat<ReadonlyMetaInput>;
    },
    Test.Pass
  >(),
  // @readonly without a default stays required; with a default it turns optional
  check<IsOptional<ReadonlyTestCreate, 'code'>, 0, Test.Pass>(),
  check<IsOptional<ReadonlyTestCreate, 'createdBy'>, 1, Test.Pass>(),
]);

// =============================================================================
// ReadonlyTestUpdate: @readonly fields are excluded, including inside objects
// =============================================================================

checks([
  check<
    Flat<ReadonlyTestUpdate>,
    {
      name?: string;
      tags?: string[] | { push?: string | string[]; unset?: string | string[] };
      // A @readonly sub-field (`city`) is dropped from the partial update, but not from a full `set`
      address?: Flat<Partial<Omit<ReadonlyAddressInput, 'city'>>> | { set: Flat<ReadonlyAddressInput> };
      meta?: Flat<Partial<Omit<ReadonlyMetaInput, 'label'>>> | { set: Flat<ReadonlyMetaInput> } | CerialNone;
    },
    Test.Pass
  >(),
  check<keyof ReadonlyTestUpdate & ('code' | 'score' | 'createdBy' | 'id'), never, Test.Pass>(),
]);

// =============================================================================
// ReadonlyTestWhere and ReadonlyTestSelect: @readonly fields stay filterable and selectable
// =============================================================================

type SelectedKeys = ReadonlyTestSelect extends infer S ? (S extends unknown ? keyof S : never) : never;

checks([
  check<
    keyof ReadonlyTestWhere,
    'id' | 'name' | 'code' | 'score' | 'tags' | 'createdBy' | 'address' | 'meta' | 'AND' | 'OR' | 'NOT',
    Test.Pass
  >(),
  check<SelectedKeys, 'id' | 'name' | 'code' | 'score' | 'tags' | 'createdBy' | 'address' | 'meta', Test.Pass>(),
]);

// =============================================================================
// ReadonlyRecord: a @readonly foreign key
// =============================================================================

checks([
  check<Flat<ReadonlyRecord>, { id: CerialId<string>; name: string; authorId?: CerialId<string> }, Test.Pass>(),
  // Writable on create
  check<Flat<ReadonlyRecordCreate>, Flat<{ id?: string; name: string; authorId?: RecordIdInput<string> }>, Test.Pass>(),
  // Excluded from update, so the relation also loses its nested operations
  check<Flat<ReadonlyRecordUpdate>, { name?: string }, Test.Pass>(),
  check<ReadonlyRecordUpdateInput, ReadonlyRecordUpdate, Test.Pass>(),
]);

// =============================================================================
// Negative
// =============================================================================

export const renameOnly: ReadonlyTestUpdate = { name: 'x' };

// @ts-expect-error - a @readonly field cannot be updated
export const updateCode: ReadonlyTestUpdate = { code: 'new' };

// @ts-expect-error - a @readonly sub-field cannot be partially updated
export const updateCity: ReadonlyTestUpdate = { address: { city: 'new' } };

// @ts-expect-error - a @readonly foreign key cannot be updated
export const updateAuthor: ReadonlyRecordUpdate = { authorId: 'author:1' };

// @ts-expect-error - the nested relation operations are gone with the @readonly key
export const nestedAuthor: ReadonlyRecordUpdateInput = { author: { connect: 'author:1' } };
