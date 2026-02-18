/**
 * Type checks for updateUnique return type inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type {
  GetUserPayload,
  UpdateUniqueReturn,
  UpdateUniqueReturnType,
  User,
  UserFindUniqueWhere,
} from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// UpdateUniqueReturn Type
// =============================================================================

Test.checks([
  // UpdateUniqueReturn is a union of valid return options
  Test.check<UpdateUniqueReturn, null | undefined | true | 'before' | 'after', Test.Pass>(),

  // null is valid
  Test.check<Extends<null, UpdateUniqueReturn>, 1, Test.Pass>(),

  // undefined is valid
  Test.check<Extends<undefined, UpdateUniqueReturn>, 1, Test.Pass>(),

  // true is valid
  Test.check<Extends<true, UpdateUniqueReturn>, 1, Test.Pass>(),

  // 'before' is valid
  Test.check<Extends<'before', UpdateUniqueReturn>, 1, Test.Pass>(),

  // 'after' is valid
  Test.check<Extends<'after', UpdateUniqueReturn>, 1, Test.Pass>(),

  // false is NOT valid
  Test.check<Extends<false, UpdateUniqueReturn>, 0, Test.Pass>(),

  // 'beforeAndCheck' is NOT valid
  Test.check<Extends<'beforeAndCheck', UpdateUniqueReturn>, 0, Test.Pass>(),
]);

// =============================================================================
// UpdateUniqueReturnType Inference
// =============================================================================

Test.checks([
  // undefined returns User | null
  Test.check<UpdateUniqueReturnType<User, undefined>, User | null, Test.Pass>(),

  // null returns User | null
  Test.check<UpdateUniqueReturnType<User, null>, User | null, Test.Pass>(),

  // true returns boolean
  Test.check<UpdateUniqueReturnType<User, true>, boolean, Test.Pass>(),

  // 'before' returns User | null
  Test.check<UpdateUniqueReturnType<User, 'before'>, User | null, Test.Pass>(),

  // 'after' returns User | null
  Test.check<UpdateUniqueReturnType<User, 'after'>, User | null, Test.Pass>(),
]);

// =============================================================================
// UpdateUniqueReturnType with GetPayload (select/include)
// =============================================================================

// When using select, the return type should be the selected payload
type SelectedPayload = GetUserPayload<{ id: true; name: true }>;

Test.checks([
  // With select, undefined returns selected payload | null
  Test.check<UpdateUniqueReturnType<SelectedPayload, undefined>, SelectedPayload | null, Test.Pass>(),

  // With select, true still returns boolean
  Test.check<UpdateUniqueReturnType<SelectedPayload, true>, boolean, Test.Pass>(),

  // With select, 'before' returns selected payload | null
  Test.check<UpdateUniqueReturnType<SelectedPayload, 'before'>, SelectedPayload | null, Test.Pass>(),
]);

// =============================================================================
// UserFindUniqueWhere - Required for updateUnique
// =============================================================================

// ID-based where
type IdWhere = { id: string };
Test.checks([Test.check<Extends<IdWhere, UserFindUniqueWhere>, 1, Test.Pass>()]);

// Email-based where (unique field)
type EmailWhere = { email: string };
Test.checks([Test.check<Extends<EmailWhere, UserFindUniqueWhere>, 1, Test.Pass>()]);

// Combined ID and email
type CombinedWhere = { id: string; email: string };
Test.checks([Test.check<Extends<CombinedWhere, UserFindUniqueWhere>, 1, Test.Pass>()]);

// =============================================================================
// UpdateUnique Method Signatures (conceptual)
// =============================================================================

// These test the expected method signature behavior
type UpdateUniqueOptions<R extends UpdateUniqueReturn = undefined> = {
  where: UserFindUniqueWhere;
  data: Partial<User>;
  return?: R;
};

// Default options (no return specified)
type DefaultOptions = { where: { id: string }; data: { name: string } };
Test.checks([Test.check<Extends<DefaultOptions, UpdateUniqueOptions>, 1, Test.Pass>()]);

// Options with return: true
type TrueOptions = { where: { id: string }; data: { name: string }; return: true };
Test.checks([Test.check<Extends<TrueOptions, UpdateUniqueOptions<true>>, 1, Test.Pass>()]);

// Options with return: 'before'
type BeforeOptions = { where: { email: string }; data: { age: number }; return: 'before' };
Test.checks([Test.check<Extends<BeforeOptions, UpdateUniqueOptions<'before'>>, 1, Test.Pass>()]);

// Options with return: 'after'
type AfterOptions = { where: { id: string }; data: { name: string }; return: 'after' };
Test.checks([Test.check<Extends<AfterOptions, UpdateUniqueOptions<'after'>>, 1, Test.Pass>()]);
