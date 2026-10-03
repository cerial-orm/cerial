/**
 * Type checks for upsert return type inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type { Model } from '../../../../src/client/model';
import type { CerialQueryPromise } from '../../../../src/query';
import type {
  GetUserPayload,
  UpsertArrayReturnType,
  UpsertReturn,
  UpsertReturnType,
  User,
  UserCreateInput,
  UserUpdateInput,
} from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// UpsertReturn Type
// =============================================================================

Test.checks([
  // UpsertReturn is a union of valid return options
  Test.check<UpsertReturn, null | undefined | true | 'before' | 'after', Test.Pass>(),

  // null is valid
  Test.check<Extends<null, UpsertReturn>, 1, Test.Pass>(),

  // undefined is valid
  Test.check<Extends<undefined, UpsertReturn>, 1, Test.Pass>(),

  // true is valid
  Test.check<Extends<true, UpsertReturn>, 1, Test.Pass>(),

  // 'before' is valid
  Test.check<Extends<'before', UpsertReturn>, 1, Test.Pass>(),

  // 'after' is valid
  Test.check<Extends<'after', UpsertReturn>, 1, Test.Pass>(),

  // false is NOT valid
  Test.check<Extends<false, UpsertReturn>, 0, Test.Pass>(),

  // 'invalid' is NOT valid
  Test.check<Extends<'invalid', UpsertReturn>, 0, Test.Pass>(),
]);

// =============================================================================
// UpsertReturnType - Conditional Return Types (single)
// =============================================================================

Test.checks([
  // undefined → T | null
  Test.check<UpsertReturnType<User, undefined>, User | null, Test.Pass>(),

  // null → T | null
  Test.check<UpsertReturnType<User, null>, User | null, Test.Pass>(),

  // 'after' → T | null
  Test.check<UpsertReturnType<User, 'after'>, User | null, Test.Pass>(),

  // 'before' → T | null
  Test.check<UpsertReturnType<User, 'before'>, User | null, Test.Pass>(),

  // true → boolean
  Test.check<UpsertReturnType<User, true>, boolean, Test.Pass>(),
]);

// =============================================================================
// UpsertArrayReturnType - Conditional Return Types (array)
// =============================================================================

Test.checks([
  // undefined → T[]
  Test.check<UpsertArrayReturnType<User, undefined>, User[], Test.Pass>(),

  // null → T[]
  Test.check<UpsertArrayReturnType<User, null>, User[], Test.Pass>(),

  // 'after' → T[]
  Test.check<UpsertArrayReturnType<User, 'after'>, User[], Test.Pass>(),

  // 'before' → T[]
  Test.check<UpsertArrayReturnType<User, 'before'>, User[], Test.Pass>(),

  // true → boolean
  Test.check<UpsertArrayReturnType<User, true>, boolean, Test.Pass>(),
]);

// =============================================================================
// UpsertReturnType with Select
// =============================================================================

type UserSelectIdName = GetUserPayload<{ id: true; name: true }>;

Test.checks([
  // Select with default return → selected fields | null
  Test.check<UpsertReturnType<UserSelectIdName, undefined>, UserSelectIdName | null, Test.Pass>(),

  // Select with true return → boolean (ignores select)
  Test.check<UpsertReturnType<UserSelectIdName, true>, boolean, Test.Pass>(),

  // Select with 'before' return → selected type | null
  Test.check<UpsertReturnType<UserSelectIdName, 'before'>, UserSelectIdName | null, Test.Pass>(),

  // Array variant: select with default return → selected fields[]
  Test.check<UpsertArrayReturnType<UserSelectIdName, undefined>, UserSelectIdName[], Test.Pass>(),

  // Array variant: select with true return → boolean
  Test.check<UpsertArrayReturnType<UserSelectIdName, true>, boolean, Test.Pass>(),
]);

// =============================================================================
// Create/Update types are compatible with upsert options
// =============================================================================

Test.checks([
  // UserCreateInput is assignable as create data
  Test.check<Extends<UserCreateInput, Record<string, unknown>>, 1, Test.Pass>(),

  // UserUpdateInput is assignable as update data
  Test.check<Extends<UserUpdateInput, Record<string, unknown>>, 1, Test.Pass>(),
]);

// =============================================================================
// Runtime Model class (client.db.<Model> for dynamic callers)
// =============================================================================
// The runtime class cannot tell a unique where from a non-unique one, so each
// return option resolves to the union of the two generated overloads.

// Model requires an index-signature-compatible T; a mapped alias of the interface provides one
type UserRecord = { [K in keyof User]: User[K] };

declare const runtimeUser: Model<UserRecord>;

type Resolved<P> = P extends CerialQueryPromise<infer V> ? V : never;

type RuntimeDefault = Resolved<ReturnType<typeof runtimeUser.upsert<undefined>>>;
type RuntimeAfter = Resolved<ReturnType<typeof runtimeUser.upsert<'after'>>>;
type RuntimeNull = Resolved<ReturnType<typeof runtimeUser.upsert<null>>>;
type RuntimeTrue = Resolved<ReturnType<typeof runtimeUser.upsert<true>>>;
type RuntimeBefore = Resolved<ReturnType<typeof runtimeUser.upsert<'before'>>>;

Test.checks([
  // undefined (default), null and 'after': record, null or array, never unknown
  Test.check<RuntimeDefault, UserRecord | null | UserRecord[], Test.Pass>(),
  Test.check<RuntimeNull, UserRecord | null | UserRecord[], Test.Pass>(),
  Test.check<RuntimeAfter, UserRecord | null | UserRecord[], Test.Pass>(),

  // 'before' has the same shape
  Test.check<RuntimeBefore, UserRecord | null | UserRecord[], Test.Pass>(),

  // true collapses both variants to boolean
  Test.check<RuntimeTrue, boolean, Test.Pass>(),

  // Not unknown: a caller must not need to narrow by hand
  Test.check<Extends<unknown, RuntimeDefault>, 0, Test.Pass>(),

  // Agrees with the generated overloads
  Test.check<
    RuntimeDefault,
    UpsertReturnType<UserRecord, undefined> | UpsertArrayReturnType<UserRecord, undefined>,
    Test.Pass
  >(),
  Test.check<RuntimeTrue, UpsertReturnType<UserRecord, true> | UpsertArrayReturnType<UserRecord, true>, Test.Pass>(),
]);
