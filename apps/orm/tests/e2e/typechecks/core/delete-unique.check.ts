/**
 * Type checks for deleteUnique return type inference
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 */

import { Test } from 'ts-toolbelt';
import type { DeleteUniqueReturn, DeleteUniqueReturnType, User, UserFindUniqueWhere } from '../../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// DeleteUniqueReturn Type
// =============================================================================

Test.checks([
  // DeleteUniqueReturn is a union of valid return options
  Test.check<DeleteUniqueReturn, null | undefined | true | 'before', Test.Pass>(),

  // null is valid
  Test.check<Extends<null, DeleteUniqueReturn>, 1, Test.Pass>(),

  // undefined is valid
  Test.check<Extends<undefined, DeleteUniqueReturn>, 1, Test.Pass>(),

  // true is valid
  Test.check<Extends<true, DeleteUniqueReturn>, 1, Test.Pass>(),

  // 'before' is valid
  Test.check<Extends<'before', DeleteUniqueReturn>, 1, Test.Pass>(),

  // 'beforeAndCheck' is NOT valid (removed)
  Test.check<Extends<'beforeAndCheck', DeleteUniqueReturn>, 0, Test.Pass>(),

  // false is NOT valid
  Test.check<Extends<false, DeleteUniqueReturn>, 0, Test.Pass>(),

  // 'after' is NOT valid
  Test.check<Extends<'after', DeleteUniqueReturn>, 0, Test.Pass>(),
]);

// =============================================================================
// DeleteUniqueReturnType Inference
// =============================================================================

Test.checks([
  // undefined returns boolean
  Test.check<DeleteUniqueReturnType<User, undefined>, boolean, Test.Pass>(),

  // null returns boolean
  Test.check<DeleteUniqueReturnType<User, null>, boolean, Test.Pass>(),

  // true returns boolean
  Test.check<DeleteUniqueReturnType<User, true>, boolean, Test.Pass>(),

  // 'before' returns User | null
  Test.check<DeleteUniqueReturnType<User, 'before'>, User | null, Test.Pass>(),
]);

// =============================================================================
// UserFindUniqueWhere - Required for deleteUnique
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
// DeleteUnique Method Signatures (conceptual)
// =============================================================================

// These test the expected method signature behavior
type DeleteUniqueOptions<R extends DeleteUniqueReturn = undefined> = {
  where: UserFindUniqueWhere;
  return?: R;
};

// Default options (no return specified)
type DefaultOptions = { where: { id: string } };
Test.checks([Test.check<Extends<DefaultOptions, DeleteUniqueOptions>, 1, Test.Pass>()]);

// Options with return: true
type TrueOptions = { where: { id: string }; return: true };
Test.checks([Test.check<Extends<TrueOptions, DeleteUniqueOptions<true>>, 1, Test.Pass>()]);

// Options with return: 'before'
type BeforeOptions = { where: { email: string }; return: 'before' };
Test.checks([Test.check<Extends<BeforeOptions, DeleteUniqueOptions<'before'>>, 1, Test.Pass>()]);
