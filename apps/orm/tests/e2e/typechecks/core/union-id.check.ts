/**
 * Type checks for union ID create input
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * SurrealDB 3.3.0 cannot generate a union id, so the id is required in create.
 */

import { Test } from 'ts-toolbelt';
import type { IntUnionIdModelCreate, StringIdModelCreate, UnionIdModelCreate } from '../../generated';

type Extends<A, B> = A extends B ? 1 : 0;

Test.checks([
  Test.check<Extends<{ id: string; label: string }, UnionIdModelCreate>, 1, Test.Pass>(),
  Test.check<Extends<{ id: number; label: string }, UnionIdModelCreate>, 1, Test.Pass>(),
  Test.check<Extends<{ label: string }, UnionIdModelCreate>, 0, Test.Pass>(),
  Test.check<Extends<{ label: string }, IntUnionIdModelCreate>, 0, Test.Pass>(),
  Test.check<Extends<{ value: string }, StringIdModelCreate>, 1, Test.Pass>(),
]);

// @ts-expect-error - id is required when the id type is a union
export const missingUnionId: UnionIdModelCreate = { label: 'no-id' };
