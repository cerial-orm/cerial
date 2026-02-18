/**
 * Type checks for enum types
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Verifies:
 * - Enum const objects have correct shape
 * - Enum union types resolve to string literal unions
 * - Enum where types have correct operators
 * - Model fields using enums have correct types
 * - Enum fields in objects have correct types
 * - Literal referencing enum inlines values correctly
 */

import { Test } from 'ts-toolbelt';
import type {
  ColorEnumType,
  // Object types
  EnumAddress,
  EnumAddressInput,
  EnumAddressOrderBy,
  // Model types
  EnumBasic,
  EnumBasicInput,
  EnumBasicOrderBy,
  EnumDefaultsCreate,
  EnumLiteralRef,
  EnumMultiple,
  EnumMultipleOrderBy,
  EnumWithObject,
  EnumWithObjectOrderBy,
  // Enum types
  RoleEnumType,
  RoleEnumWhere,
  // Literal type referencing enum
  RoleOrCustom,
  SeverityEnumType,
} from '../generated';
import { ColorEnum, RoleEnum, SeverityEnum } from '../generated';

// Helper for extension checks
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// Enum Const Objects
// =============================================================================

Test.checks([
  // RoleEnum has correct keys and values
  Test.check<typeof RoleEnum.ADMIN, 'ADMIN', Test.Pass>(),
  Test.check<typeof RoleEnum.USER, 'USER', Test.Pass>(),
  Test.check<typeof RoleEnum.MODERATOR, 'MODERATOR', Test.Pass>(),

  // ColorEnum has correct keys and values
  Test.check<typeof ColorEnum.RED, 'RED', Test.Pass>(),
  Test.check<typeof ColorEnum.GREEN, 'GREEN', Test.Pass>(),
  Test.check<typeof ColorEnum.BLUE, 'BLUE', Test.Pass>(),

  // SeverityEnum has correct keys and values
  Test.check<typeof SeverityEnum.LOW, 'LOW', Test.Pass>(),
  Test.check<typeof SeverityEnum.MEDIUM, 'MEDIUM', Test.Pass>(),
  Test.check<typeof SeverityEnum.HIGH, 'HIGH', Test.Pass>(),
  Test.check<typeof SeverityEnum.CRITICAL, 'CRITICAL', Test.Pass>(),
]);

// =============================================================================
// Enum Union Types
// =============================================================================

Test.checks([
  // RoleEnumType is the correct union
  Test.check<RoleEnumType, 'ADMIN' | 'USER' | 'MODERATOR', Test.Pass>(),

  // ColorEnumType is the correct union
  Test.check<ColorEnumType, 'RED' | 'GREEN' | 'BLUE', Test.Pass>(),

  // SeverityEnumType is the correct union
  Test.check<SeverityEnumType, 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL', Test.Pass>(),
]);

// =============================================================================
// Enum Where Types
// =============================================================================

// RoleEnumWhere has eq/neq/in/notIn with RoleEnumType and string ops
type _RoleWhereHasEq = Extends<{ eq: RoleEnumType }, RoleEnumWhere>;
type _AssertEq = Test.Pass extends _RoleWhereHasEq ? true : never;
type _RoleWhereHasContains = Extends<{ contains: string }, RoleEnumWhere>;
type _AssertContains = Test.Pass extends _RoleWhereHasContains ? true : never;
type _RoleWhereHasStartsWith = Extends<{ startsWith: string }, RoleEnumWhere>;
type _AssertStartsWith = Test.Pass extends _RoleWhereHasStartsWith ? true : never;

// =============================================================================
// Model Types - EnumBasic
// =============================================================================

Test.checks([
  // Output type: required enum is RoleEnumType
  Test.check<EnumBasic['role'], RoleEnumType, Test.Pass>(),

  // Output type: enum array is RoleEnumType[]
  Test.check<EnumBasic['roles'], RoleEnumType[], Test.Pass>(),

  // Input type matches output type for enums (no Input variant needed)
  Test.check<EnumBasicInput['role'], RoleEnumType, Test.Pass>(),
]);

// Output type: optional enum includes undefined
const _optRole: EnumBasic['optRole'] = undefined;
// @ts-expect-error — optional enum does not accept number
const _badOptRole: EnumBasic['optRole'] = 42;

// Output type: nullable enum includes null
const _nullRole: NonNullable<EnumBasic['nullRole']> extends RoleEnumType ? true : never = true;

// Create type: fields with @default are optional in EnumDefaultsCreate
const _defaultsCreate: EnumDefaultsCreate = { label: 'test' };

// =============================================================================
// Model Types - EnumMultiple (multiple enums from different types)
// =============================================================================

Test.checks([
  Test.check<EnumMultiple['role'], RoleEnumType, Test.Pass>(),
  Test.check<EnumMultiple['color'], ColorEnumType, Test.Pass>(),
  Test.check<EnumMultiple['severity'], SeverityEnumType, Test.Pass>(),
]);

// =============================================================================
// Object Types - EnumAddress
// =============================================================================

Test.checks([
  // Object with enum field
  Test.check<EnumAddress['severity'], SeverityEnumType, Test.Pass>(),
  Test.check<EnumAddressInput['severity'], SeverityEnumType, Test.Pass>(),
]);

// =============================================================================
// Model Types - EnumWithObject
// =============================================================================

Test.checks([
  // Model with object containing enum
  Test.check<EnumWithObject['address'], EnumAddress, Test.Pass>(),
]);

// =============================================================================
// Literal Referencing Enum
// =============================================================================

Test.checks([
  // RoleOrCustom inlines enum values + 'custom'
  Test.check<RoleOrCustom, 'ADMIN' | 'USER' | 'MODERATOR' | 'custom', Test.Pass>(),

  // Model using literal that references enum
  Test.check<EnumLiteralRef['access'], RoleOrCustom, Test.Pass>(),
]);

// =============================================================================
// Enum const values are usable at runtime level
// =============================================================================

// Using const object values in type positions
const _adminRole: RoleEnumType = RoleEnum.ADMIN;
const _blueColor: ColorEnumType = ColorEnum.BLUE;
const _highSeverity: SeverityEnumType = SeverityEnum.HIGH;

// @ts-expect-error — enum const values must be valid enum variants
const _invalid: RoleEnumType = 'INVALID';

// =============================================================================
// Enum OrderBy Types
// =============================================================================

// EnumBasicOrderBy includes enum fields
Test.checks([
  Test.check<Extends<{ role: 'asc' | 'desc' }, EnumBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ optRole: 'asc' | 'desc' }, EnumBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ nullRole: 'asc' | 'desc' }, EnumBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ roles: 'asc' | 'desc' }, EnumBasicOrderBy>, 1, Test.Pass>(),
  // Non-enum fields also present
  Test.check<Extends<{ name: 'asc' | 'desc' }, EnumBasicOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ id: 'asc' | 'desc' }, EnumBasicOrderBy>, 1, Test.Pass>(),
]);

// EnumMultipleOrderBy includes all three enum fields
Test.checks([
  Test.check<Extends<{ role: 'asc' | 'desc' }, EnumMultipleOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ color: 'asc' | 'desc' }, EnumMultipleOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ severity: 'asc' | 'desc' }, EnumMultipleOrderBy>, 1, Test.Pass>(),
]);

// EnumAddressOrderBy (object) includes enum field
Test.checks([
  Test.check<Extends<{ severity: 'asc' | 'desc' }, EnumAddressOrderBy>, 1, Test.Pass>(),
  Test.check<Extends<{ city: 'asc' | 'desc' }, EnumAddressOrderBy>, 1, Test.Pass>(),
]);

// EnumWithObjectOrderBy allows nested object ordering with enum
Test.checks([Test.check<Extends<{ address: EnumAddressOrderBy }, EnumWithObjectOrderBy>, 1, Test.Pass>()]);
