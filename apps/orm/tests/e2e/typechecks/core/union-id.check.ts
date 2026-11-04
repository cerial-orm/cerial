/**
 * Type checks for union ID create input
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * SurrealDB 4.0.0 cannot generate a union id, so the id is required in create.
 *
 * Every shape is compared with `Test.check`, which fails on a wider or a
 * narrower type.
 */

import { Test } from 'ts-toolbelt';
import type { IntUnionIdModelCreate, StringIdModelCreate, UnionIdModelCreate } from '../../generated';
import type { Flat, IsOptional } from '../helpers';

Test.checks([
  Test.check<Flat<UnionIdModelCreate>, { id: string | number; label: string }, Test.Pass>(),
  Test.check<Flat<IntUnionIdModelCreate>, { id: number | string; label: string }, Test.Pass>(),
  Test.check<IsOptional<UnionIdModelCreate, 'id'>, 0, Test.Pass>(),
  Test.check<IsOptional<IntUnionIdModelCreate, 'id'>, 0, Test.Pass>(),
  // A single-type string id can still be generated, so it stays optional
  Test.check<Flat<StringIdModelCreate>, { id?: string; payload: string }, Test.Pass>(),
]);

export const stringUnionId: UnionIdModelCreate = { id: 'a', label: 'x' };
export const numberUnionId: UnionIdModelCreate = { id: 1, label: 'x' };
export const generatedStringId: StringIdModelCreate = { payload: 'x' };

// @ts-expect-error - id is required when the id type is a union
export const missingUnionId: UnionIdModelCreate = { label: 'no-id' };

// @ts-expect-error - id is required when the id type is a union, whatever its members
export const missingIntUnionId: IntUnionIdModelCreate = { label: 'no-id' };
