/**
 * Type checks for $transaction return type inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type { CerialQueryPromise, Post, User } from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// CerialQueryPromise extends PromiseLike
// =============================================================================

Test.checks([
  // CerialQueryPromise<User> extends PromiseLike<User>
  Test.check<Extends<CerialQueryPromise<User>, PromiseLike<User>>, 1, Test.Pass>(),
]);

// =============================================================================
// TransactionResult tuple inference helper
// =============================================================================

type TransactionResult<T extends CerialQueryPromise<any>[]> = {
  [K in keyof T]: T[K] extends CerialQueryPromise<infer R> ? R : never;
};

// Single query: infer return type from CerialQueryPromise<User | null>
Test.checks([Test.check<TransactionResult<[CerialQueryPromise<User | null>]>, [User | null], Test.Pass>()]);

// Two queries: [CerialQueryPromise<User | null>, CerialQueryPromise<Post[]>]
Test.checks([
  Test.check<
    TransactionResult<[CerialQueryPromise<User | null>, CerialQueryPromise<Post[]>]>,
    [User | null, Post[]],
    Test.Pass
  >(),
]);

// =============================================================================
// Count and Exists return types
// =============================================================================

Test.checks([
  // CerialQueryPromise<number> for count
  Test.check<TransactionResult<[CerialQueryPromise<number>]>, [number], Test.Pass>(),

  // CerialQueryPromise<boolean> for exists
  Test.check<TransactionResult<[CerialQueryPromise<boolean>]>, [boolean], Test.Pass>(),
]);

// =============================================================================
// Mixed transaction tuple: count + exists + findOne
// =============================================================================

Test.checks([
  Test.check<
    TransactionResult<[CerialQueryPromise<number>, CerialQueryPromise<boolean>]>,
    [number, boolean],
    Test.Pass
  >(),
]);
