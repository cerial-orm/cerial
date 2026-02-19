/**
 * Type checks for $transaction return type inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import type {
  CerialTransaction,
  TransactionArrayItem,
  TransactionClient,
  TransactionItemResult,
  TransactionOptions,
} from 'cerial';
import { Test } from 'ts-toolbelt';
import type { CerialQueryPromise, Post, User } from '../../generated';

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

// =============================================================================
// Callback mode return type inference
// =============================================================================

type CallbackResult = Awaited<Promise<User>>;
Test.checks([Test.check<CallbackResult, User, Test.Pass>()]);

type CallbackReturnsNumber = Awaited<Promise<number>>;
Test.checks([Test.check<CallbackReturnsNumber, number, Test.Pass>()]);

// =============================================================================
// CerialTransaction type structure
// =============================================================================

Test.checks([
  Test.check<Extends<CerialTransaction, { commit: () => Promise<void> }>, 1, Test.Pass>(),
  Test.check<Extends<CerialTransaction, { cancel: () => Promise<void> }>, 1, Test.Pass>(),
]);

// =============================================================================
// TransactionOptions structure
// =============================================================================

Test.checks([
  Test.check<Extends<{ timeout: number }, TransactionOptions>, 1, Test.Pass>(),
  Test.check<Extends<{}, TransactionOptions>, 1, Test.Pass>(),
]);

// =============================================================================
// TransactionClient is indexable (model proxy)
// =============================================================================

Test.checks([Test.check<Extends<TransactionClient, Record<string, any>>, 1, Test.Pass>()]);

// =============================================================================
// TransactionArrayItem accepts CerialQueryPromise or function
// =============================================================================

Test.checks([
  Test.check<Extends<CerialQueryPromise<User>, TransactionArrayItem<User>>, 1, Test.Pass>(),
  Test.check<Extends<(prev: any[]) => CerialQueryPromise<User>, TransactionArrayItem<User>>, 1, Test.Pass>(),
  Test.check<Extends<(prev: any[]) => User, TransactionArrayItem<User>>, 1, Test.Pass>(),
  Test.check<Extends<(prev: any[]) => Promise<User>, TransactionArrayItem<User>>, 1, Test.Pass>(),
]);

// =============================================================================
// txn option accepted on model method types (via CerialTransaction)
// =============================================================================

type CreateWithTxn = { data: { email: string; name: string; isActive: boolean }; txn?: CerialTransaction };
Test.checks([Test.check<Extends<CreateWithTxn, { txn?: CerialTransaction }>, 1, Test.Pass>()]);

// =============================================================================
// Callback fn signature matches TransactionClient → Promise<T>
// =============================================================================

type ValidCallback = (tx: TransactionClient) => Promise<User>;
type CallbackOverload = <R>(fn: (tx: TransactionClient) => Promise<R> | R, options?: TransactionOptions) => Promise<R>;
Test.checks([Test.check<Extends<ValidCallback, (tx: TransactionClient) => Promise<User> | User>, 1, Test.Pass>()]);

// =============================================================================
// TransactionItemResult helper — individual type extraction
// =============================================================================

Test.checks([
  // CerialQueryPromise<User> → User
  Test.check<TransactionItemResult<CerialQueryPromise<User>>, User, Test.Pass>(),

  // Function returning CerialQueryPromise<Post> → Post
  Test.check<TransactionItemResult<(prev: any[]) => CerialQueryPromise<Post>>, Post, Test.Pass>(),

  // Function returning plain string → string
  Test.check<TransactionItemResult<(prev: any[]) => string>, string, Test.Pass>(),

  // Function returning Promise<number> → number
  Test.check<TransactionItemResult<(prev: any[]) => Promise<number>>, number, Test.Pass>(),

  // Function returning void → void
  Test.check<TransactionItemResult<() => void>, void, Test.Pass>(),
]);
