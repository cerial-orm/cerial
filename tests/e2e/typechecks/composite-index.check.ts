/**
 * Type checks for composite index types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Verifies that:
 * - StaffFindUniqueWhere accepts composite key variant (staffFullName)
 * - StaffFindUniqueWhere accepts single unique field variant (email)
 * - StaffFindUniqueWhere accepts id variant
 * - WarehouseFindUniqueWhere accepts dot-notation composite key variant (cityZip)
 * - WarehouseFindUniqueWhere accepts mixed composite key variant (nameCity)
 * - Composite key objects have correct nested structure for dot-notation fields
 */

import { Test } from 'ts-toolbelt';
import type { StaffFindUniqueWhere, WarehouseFindUniqueWhere } from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// StaffFindUniqueWhere — composite unique on primitives
// =============================================================================

// Single-field unique variants still work
Test.checks([
  // id variant
  Test.check<Extends<{ id: string }, StaffFindUniqueWhere>, 1, Test.Pass>(),

  // email variant
  Test.check<Extends<{ email: string }, StaffFindUniqueWhere>, 1, Test.Pass>(),
]);

// Composite unique key variant
Test.checks([
  // staffFullName with required fields
  Test.check<Extends<{ staffFullName: { firstName: string; lastName: string } }, StaffFindUniqueWhere>, 1, Test.Pass>(),
]);

// Composite key with additional where filters
Test.checks([
  Test.check<
    Extends<{ staffFullName: { firstName: string; lastName: string }; department: string }, StaffFindUniqueWhere>,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// WarehouseFindUniqueWhere — composite unique on dot-notation fields
// =============================================================================

// id variant
Test.checks([Test.check<Extends<{ id: string }, WarehouseFindUniqueWhere>, 1, Test.Pass>()]);

// cityZip composite variant — nested location object with city and zip
Test.checks([
  Test.check<
    Extends<{ cityZip: { location: { city: string; zip: string } } }, WarehouseFindUniqueWhere>,
    1,
    Test.Pass
  >(),
]);

// nameCity composite variant — mixed primitive + dot-notation
Test.checks([
  Test.check<
    Extends<{ nameCity: { name: string; location: { city: string } } }, WarehouseFindUniqueWhere>,
    1,
    Test.Pass
  >(),
]);

// =============================================================================
// Invalid types should NOT extend FindUniqueWhere
// =============================================================================

// Missing required composite field should fail
Test.checks([
  // staffFullName with only firstName (missing lastName)
  Test.check<Extends<{ staffFullName: { firstName: string } }, StaffFindUniqueWhere>, 0, Test.Pass>(),
]);

// Wrong type in composite field should fail
Test.checks([
  Test.check<Extends<{ staffFullName: { firstName: number; lastName: string } }, StaffFindUniqueWhere>, 0, Test.Pass>(),
]);
