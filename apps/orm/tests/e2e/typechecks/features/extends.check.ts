/**
 * Type checks for the extends (inheritance) feature
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * Tests:
 * - Model inheritance: inherited fields, own fields, Create/Update/Where/Select/OrderBy
 * - Abstract model absence: ExtBaseEntity, ExtBaseUser should NOT generate types
 * - Pick/omit inheritance: field inclusion/exclusion
 * - Override inheritance: field type preservation with different defaults
 * - Object inheritance: inherited + own fields, pick, omit
 * - Tuple inheritance: element appending, multi-level
 * - Enum inheritance: extend, pick, omit
 * - Literal inheritance: extend, pick, omit
 * - Deep inheritance: 5-6 levels
 */

import type { CerialId } from 'cerial';
import { Test } from 'ts-toolbelt';
import type {
  // Object types
  ExtAddress,
  ExtAddressWhere,
  ExtAdmin,
  ExtAdminCreate,
  ExtAdminOrderBy,
  ExtAdminSelect,
  ExtAdminWhere,
  // Tuple types
  ExtBasePair,
  ExtBaseRoleEnumType,
  ExtCityAddress,
  ExtCityAddressWhere,
  ExtCoreRoleEnumType,
  ExtExtendedLevel,
  // Literal types
  ExtExtendedPriority,
  // Enum types
  ExtExtendedRoleEnum,
  ExtExtendedRoleEnumType,
  ExtL5VeryDeep,
  ExtL5VeryDeepCreate,
  ExtL5VeryDeepOrderBy,
  ExtL5VeryDeepWhere,
  ExtModerator,
  ExtModeratorCreate,
  ExtModeratorOrderBy,
  ExtModeratorSelect,
  ExtModeratorWhere,
  ExtNonAdminRoleEnumType,
  ExtQuad,
  ExtSimpleAddress,
  ExtSimpleAddressWhere,
  ExtSuperAdmin,
  ExtSuperAdminCreate,
  ExtSuperAdminOrderBy,
  ExtSuperAdminWhere,
  ExtTriple,
  // Model types
  ExtUser,
  ExtUserCreate,
  ExtUserOrderBy,
  ExtUserSelect,
  ExtUserUpdate,
  ExtUserWhere,
} from '../../generated';

const { checks, check } = Test;

// Helper: 1 if K is a key of T (required OR optional), 0 otherwise
type HasKey<T, K extends string | number> = K extends keyof T ? 1 : 0;

// Helper: check if types are equal
type IsEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? 1 : 0) : 0;

// Helper: check if A extends B
type Extends<A, B> = A extends B ? 1 : 0;

// =============================================================================
// 1. ExtUser — Model with full inheritance from abstract ExtBaseUser
// =============================================================================

// Inherited fields from ExtBaseUser (which inherits from ExtBaseEntity)
checks([
  // 1: id is CerialId<string> (from ExtBaseEntity)
  check<ExtUser['id'], CerialId<string>, Test.Pass>(),
  // 2: email is string (from ExtBaseUser)
  check<ExtUser['email'], string, Test.Pass>(),
  // 3: name is string (from ExtBaseUser)
  check<ExtUser['name'], string, Test.Pass>(),
  // 4: isActive is boolean (from ExtBaseUser)
  check<ExtUser['isActive'], boolean, Test.Pass>(),
  // 5: createdAt is optional Date (from ExtBaseEntity)
  check<HasKey<ExtUser, 'createdAt'>, 1, Test.Pass>(),
  // 6: updatedAt is optional Date (from ExtBaseEntity)
  check<HasKey<ExtUser, 'updatedAt'>, 1, Test.Pass>(),
]);

// Own fields
checks([
  // 7: age is optional number (own field)
  check<HasKey<ExtUser, 'age'>, 1, Test.Pass>(),
  // 8: role is string (own field)
  check<ExtUser['role'], string, Test.Pass>(),
]);

// ExtUserCreate — inherited + own fields
checks([
  // 9: email required in create
  check<HasKey<ExtUserCreate, 'email'>, 1, Test.Pass>(),
  // 10: name required in create
  check<HasKey<ExtUserCreate, 'name'>, 1, Test.Pass>(),
  // 11: age optional in create
  check<HasKey<ExtUserCreate, 'age'>, 1, Test.Pass>(),
  // 12: role optional in create (has @default)
  check<HasKey<ExtUserCreate, 'role'>, 1, Test.Pass>(),
  // 13: id optional in create
  check<HasKey<ExtUserCreate, 'id'>, 1, Test.Pass>(),
  // 14: isActive optional in create (has @default)
  check<HasKey<ExtUserCreate, 'isActive'>, 1, Test.Pass>(),
]);

// ExtUserUpdate — inherited + own fields
checks([
  // 15: all fields present in update
  check<HasKey<ExtUserUpdate, 'email'>, 1, Test.Pass>(),
  // 16
  check<HasKey<ExtUserUpdate, 'name'>, 1, Test.Pass>(),
  // 17
  check<HasKey<ExtUserUpdate, 'age'>, 1, Test.Pass>(),
  // 18
  check<HasKey<ExtUserUpdate, 'role'>, 1, Test.Pass>(),
  // 19
  check<HasKey<ExtUserUpdate, 'isActive'>, 1, Test.Pass>(),
]);

// ExtUserWhere — inherited + own fields
checks([
  // 20: inherited fields in where
  check<HasKey<ExtUserWhere, 'id'>, 1, Test.Pass>(),
  // 21
  check<HasKey<ExtUserWhere, 'email'>, 1, Test.Pass>(),
  // 22
  check<HasKey<ExtUserWhere, 'name'>, 1, Test.Pass>(),
  // 23
  check<HasKey<ExtUserWhere, 'isActive'>, 1, Test.Pass>(),
  // 24: own fields in where
  check<HasKey<ExtUserWhere, 'age'>, 1, Test.Pass>(),
  // 25
  check<HasKey<ExtUserWhere, 'role'>, 1, Test.Pass>(),
  // 26: logical operators
  check<HasKey<ExtUserWhere, 'AND'>, 1, Test.Pass>(),
  // 27
  check<HasKey<ExtUserWhere, 'OR'>, 1, Test.Pass>(),
  // 28
  check<HasKey<ExtUserWhere, 'NOT'>, 1, Test.Pass>(),
]);

// ExtUserSelect — inherited + own fields
checks([
  // 29
  check<HasKey<ExtUserSelect, 'id'>, 1, Test.Pass>(),
  // 30
  check<HasKey<ExtUserSelect, 'email'>, 1, Test.Pass>(),
  // 31
  check<HasKey<ExtUserSelect, 'name'>, 1, Test.Pass>(),
  // 32
  check<HasKey<ExtUserSelect, 'isActive'>, 1, Test.Pass>(),
  // 33
  check<HasKey<ExtUserSelect, 'age'>, 1, Test.Pass>(),
  // 34
  check<HasKey<ExtUserSelect, 'role'>, 1, Test.Pass>(),
]);

// ExtUserOrderBy — inherited + own fields
checks([
  // 35
  check<ExtUserOrderBy['id'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 36
  check<ExtUserOrderBy['email'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 37
  check<ExtUserOrderBy['name'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 38
  check<ExtUserOrderBy['isActive'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 39
  check<ExtUserOrderBy['age'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 40
  check<ExtUserOrderBy['role'], 'asc' | 'desc' | undefined, Test.Pass>(),
]);

// =============================================================================
// 2. Abstract model absence — ExtBaseEntity and ExtBaseUser have NO generated types
// =============================================================================

// Abstract models should NOT exist as types. We verify by checking that the
// concrete model types do NOT have extra fields that would indicate wrong
// merging, and that the barrel exports only contain concrete types.
// Since we can't import non-existent types, we verify absence via conditional types
// on the index exports. If these types existed, they would be assignable from {}.

// Instead we verify concrete models have the correct shape — proving abstracts
// were resolved at generation time, not as standalone types.

// 41: ExtUser has exactly the fields from abstract parents + own, no extra
type ExtUserKeys = keyof ExtUser;
type ExpectedExtUserKeys = 'id' | 'createdAt' | 'updatedAt' | 'email' | 'name' | 'isActive' | 'age' | 'role';
checks([check<IsEqual<ExtUserKeys, ExpectedExtUserKeys>, 1, Test.Pass>()]);

// =============================================================================
// 3. ExtAdmin — Omit inheritance (omits 'isActive' from ExtBaseUser)
// =============================================================================

// 42: ExtAdmin should NOT have isActive (omitted)
checks([check<HasKey<ExtAdmin, 'isActive'>, 0, Test.Pass>()]);

// 43: ExtAdmin should have inherited fields that weren't omitted
checks([
  check<ExtAdmin['id'], CerialId<string>, Test.Pass>(),
  // 44
  check<ExtAdmin['email'], string, Test.Pass>(),
  // 45
  check<ExtAdmin['name'], string, Test.Pass>(),
]);

// 46: ExtAdmin should have own fields
checks([
  check<ExtAdmin['level'], number, Test.Pass>(),
  // 47
  check<ExtAdmin['permissions'], string[], Test.Pass>(),
]);

// 48: ExtAdminCreate should NOT have isActive
checks([check<HasKey<ExtAdminCreate, 'isActive'>, 0, Test.Pass>()]);

// 49: ExtAdminWhere should NOT have isActive
checks([check<HasKey<ExtAdminWhere, 'isActive'>, 0, Test.Pass>()]);

// 50: ExtAdminSelect should NOT have isActive
checks([check<HasKey<ExtAdminSelect, 'isActive'>, 0, Test.Pass>()]);

// 51: ExtAdminOrderBy should NOT have isActive
checks([check<HasKey<ExtAdminOrderBy, 'isActive'>, 0, Test.Pass>()]);

// 52: ExtAdmin keys should be exactly right
type ExtAdminKeys = keyof ExtAdmin;
type ExpectedExtAdminKeys = 'id' | 'createdAt' | 'updatedAt' | 'email' | 'name' | 'level' | 'permissions';
checks([check<IsEqual<ExtAdminKeys, ExpectedExtAdminKeys>, 1, Test.Pass>()]);

// =============================================================================
// 4. ExtModerator — Pick inheritance (picks 'id', 'createdAt' from ExtBaseEntity, own 'email', 'name')
// =============================================================================

// 53: ExtModerator should have email and name (picked)
checks([
  check<ExtModerator['email'], string, Test.Pass>(),
  // 54
  check<ExtModerator['name'], string, Test.Pass>(),
]);

// 55: ExtModerator should have id (picked from ExtBaseEntity)
checks([check<HasKey<ExtModerator, 'id'>, 1, Test.Pass>()]);

// 56: ExtModerator should NOT have isActive (not in ExtBaseEntity, not picked)
checks([check<HasKey<ExtModerator, 'isActive'>, 0, Test.Pass>()]);

// 57: ExtModerator should have createdAt (picked from ExtBaseEntity)
checks([check<HasKey<ExtModerator, 'createdAt'>, 1, Test.Pass>()]);

// 58: ExtModerator should NOT have updatedAt (not picked from ExtBaseEntity)
checks([check<HasKey<ExtModerator, 'updatedAt'>, 0, Test.Pass>()]);

// 59: ExtModerator should have own fields
checks([
  check<HasKey<ExtModerator, 'bannedUntil'>, 1, Test.Pass>(),
  // 60
  check<HasKey<ExtModerator, 'notes'>, 1, Test.Pass>(),
]);

// 61: ExtModeratorCreate should have email and name (required)
checks([
  check<HasKey<ExtModeratorCreate, 'email'>, 1, Test.Pass>(),
  // 62
  check<HasKey<ExtModeratorCreate, 'name'>, 1, Test.Pass>(),
]);

// 63: ExtModeratorWhere should have id (inherited via pick)
checks([check<HasKey<ExtModeratorWhere, 'id'>, 1, Test.Pass>()]);

// 64: ExtModeratorSelect should have id (inherited via pick)
checks([check<HasKey<ExtModeratorSelect, 'id'>, 1, Test.Pass>()]);

// 65: ExtModeratorOrderBy should have createdAt (inherited via pick)
checks([check<HasKey<ExtModeratorOrderBy, 'createdAt'>, 1, Test.Pass>()]);

// 66: ExtModerator keys should be exactly right
type ExtModeratorKeys = keyof ExtModerator;
type ExpectedExtModeratorKeys = 'id' | 'createdAt' | 'email' | 'name' | 'bannedUntil' | 'notes';
checks([check<IsEqual<ExtModeratorKeys, ExpectedExtModeratorKeys>, 1, Test.Pass>()]);

// =============================================================================
// 5. ExtSuperAdmin — Override inheritance (multi-level, fields overridden)
// =============================================================================

// 68: ExtSuperAdmin role is string (overridden with different default, same type)
checks([check<ExtSuperAdmin['role'], string, Test.Pass>()]);

// 69: ExtSuperAdmin level is number (own field)
checks([check<ExtSuperAdmin['level'], number, Test.Pass>()]);

// 70: ExtSuperAdmin inherits isActive from ExtBaseUser chain
checks([check<ExtSuperAdmin['isActive'], boolean, Test.Pass>()]);

// 71: ExtSuperAdmin has canDeleteUsers (own field)
checks([check<ExtSuperAdmin['canDeleteUsers'], boolean, Test.Pass>()]);

// 72: ExtSuperAdmin has id from ExtBaseEntity
checks([check<ExtSuperAdmin['id'], CerialId<string>, Test.Pass>()]);

// 73: ExtSuperAdmin has email from ExtBaseUser
checks([check<ExtSuperAdmin['email'], string, Test.Pass>()]);

// 74: ExtSuperAdmin has name from ExtBaseUser
checks([check<ExtSuperAdmin['name'], string, Test.Pass>()]);

// 75: ExtSuperAdminCreate has all fields
checks([
  check<HasKey<ExtSuperAdminCreate, 'email'>, 1, Test.Pass>(),
  // 76
  check<HasKey<ExtSuperAdminCreate, 'name'>, 1, Test.Pass>(),
  // 77
  check<HasKey<ExtSuperAdminCreate, 'role'>, 1, Test.Pass>(),
  // 78
  check<HasKey<ExtSuperAdminCreate, 'level'>, 1, Test.Pass>(),
  // 79
  check<HasKey<ExtSuperAdminCreate, 'canDeleteUsers'>, 1, Test.Pass>(),
  // 80
  check<HasKey<ExtSuperAdminCreate, 'isActive'>, 1, Test.Pass>(),
]);

// 81: ExtSuperAdminWhere has all fields
checks([
  check<HasKey<ExtSuperAdminWhere, 'id'>, 1, Test.Pass>(),
  // 82
  check<HasKey<ExtSuperAdminWhere, 'email'>, 1, Test.Pass>(),
  // 83
  check<HasKey<ExtSuperAdminWhere, 'role'>, 1, Test.Pass>(),
  // 84
  check<HasKey<ExtSuperAdminWhere, 'level'>, 1, Test.Pass>(),
  // 85
  check<HasKey<ExtSuperAdminWhere, 'canDeleteUsers'>, 1, Test.Pass>(),
]);

// 86: ExtSuperAdminOrderBy has all fields
checks([
  check<ExtSuperAdminOrderBy['role'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 87
  check<ExtSuperAdminOrderBy['level'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 88
  check<ExtSuperAdminOrderBy['canDeleteUsers'], 'asc' | 'desc' | undefined, Test.Pass>(),
]);

// 89: ExtSuperAdmin keys should be exactly right
type ExtSuperAdminKeys = keyof ExtSuperAdmin;
type ExpectedExtSuperAdminKeys =
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'email'
  | 'name'
  | 'isActive'
  | 'role'
  | 'level'
  | 'canDeleteUsers';
checks([check<IsEqual<ExtSuperAdminKeys, ExpectedExtSuperAdminKeys>, 1, Test.Pass>()]);

// =============================================================================
// 6. Object inheritance — ExtAddress, ExtCityAddress, ExtSimpleAddress
// =============================================================================

// ExtAddress (extends ExtBaseAddress + own fields)
checks([
  // 90: inherited fields
  check<ExtAddress['street'], string, Test.Pass>(),
  // 91
  check<ExtAddress['city'], string, Test.Pass>(),
  // 92
  check<ExtAddress['zip'], string, Test.Pass>(),
  // 93
  check<ExtAddress['country'], string, Test.Pass>(),
  // 94: own fields
  check<HasKey<ExtAddress, 'apartment'>, 1, Test.Pass>(),
  // 95
  check<ExtAddress['coordinates'], number[], Test.Pass>(),
]);

// 96: ExtAddress keys
type ExtAddressKeys = keyof ExtAddress;
type ExpectedExtAddressKeys = 'street' | 'city' | 'zip' | 'country' | 'apartment' | 'coordinates';
checks([check<IsEqual<ExtAddressKeys, ExpectedExtAddressKeys>, 1, Test.Pass>()]);

// ExtCityAddress (pick city, country + own district)
checks([
  // 97
  check<ExtCityAddress['city'], string, Test.Pass>(),
  // 98
  check<ExtCityAddress['country'], string, Test.Pass>(),
  // 99: own field
  check<HasKey<ExtCityAddress, 'district'>, 1, Test.Pass>(),
]);

// 100: ExtCityAddress should NOT have street (not picked)
checks([check<HasKey<ExtCityAddress, 'street'>, 0, Test.Pass>()]);

// 101: ExtCityAddress should NOT have zip (not picked)
checks([check<HasKey<ExtCityAddress, 'zip'>, 0, Test.Pass>()]);

// 102: ExtCityAddress keys
type ExtCityAddressKeys = keyof ExtCityAddress;
type ExpectedExtCityAddressKeys = 'city' | 'country' | 'district';
checks([check<IsEqual<ExtCityAddressKeys, ExpectedExtCityAddressKeys>, 1, Test.Pass>()]);

// ExtSimpleAddress (omit country + own region)
checks([
  // 103: has inherited fields minus country
  check<ExtSimpleAddress['street'], string, Test.Pass>(),
  // 104
  check<ExtSimpleAddress['city'], string, Test.Pass>(),
  // 105
  check<ExtSimpleAddress['zip'], string, Test.Pass>(),
]);

// 106: ExtSimpleAddress should NOT have country (omitted)
checks([check<HasKey<ExtSimpleAddress, 'country'>, 0, Test.Pass>()]);

// 107: ExtSimpleAddress own field
checks([check<HasKey<ExtSimpleAddress, 'region'>, 1, Test.Pass>()]);

// 108: ExtSimpleAddress keys
type ExtSimpleAddressKeys = keyof ExtSimpleAddress;
type ExpectedExtSimpleAddressKeys = 'street' | 'city' | 'zip' | 'region';
checks([check<IsEqual<ExtSimpleAddressKeys, ExpectedExtSimpleAddressKeys>, 1, Test.Pass>()]);

// Object Where types reflect inheritance
checks([
  // 109: ExtAddressWhere has inherited + own
  check<HasKey<ExtAddressWhere, 'street'>, 1, Test.Pass>(),
  // 110
  check<HasKey<ExtAddressWhere, 'apartment'>, 1, Test.Pass>(),
  // 111
  check<HasKey<ExtAddressWhere, 'coordinates'>, 1, Test.Pass>(),
  // 112: ExtCityAddressWhere has picked + own
  check<HasKey<ExtCityAddressWhere, 'city'>, 1, Test.Pass>(),
  // 113
  check<HasKey<ExtCityAddressWhere, 'district'>, 1, Test.Pass>(),
  // 114: ExtCityAddressWhere does NOT have street
  check<HasKey<ExtCityAddressWhere, 'street'>, 0, Test.Pass>(),
  // 115: ExtSimpleAddressWhere does NOT have country
  check<HasKey<ExtSimpleAddressWhere, 'country'>, 0, Test.Pass>(),
  // 116: ExtSimpleAddressWhere has region
  check<HasKey<ExtSimpleAddressWhere, 'region'>, 1, Test.Pass>(),
]);

// =============================================================================
// 7. Tuple inheritance — ExtTriple, ExtQuad
// =============================================================================

// 117: ExtBasePair is [string, number]
checks([check<IsEqual<ExtBasePair, [string, number]>, 1, Test.Pass>()]);

// 118: ExtTriple extends ExtBasePair with appended boolean → [string, number, boolean]
checks([check<IsEqual<ExtTriple, [string, number, boolean]>, 1, Test.Pass>()]);

// 119: ExtQuad extends ExtTriple with appended number → [string, number, boolean, number]
checks([check<IsEqual<ExtQuad, [string, number, boolean, number]>, 1, Test.Pass>()]);

// 120: ExtTriple length is 3
checks([check<ExtTriple['length'], 3, Test.Pass>()]);

// 121: ExtQuad length is 4
checks([check<ExtQuad['length'], 4, Test.Pass>()]);

// 122: ExtTriple element types
checks([
  check<ExtTriple[0], string, Test.Pass>(),
  // 123
  check<ExtTriple[1], number, Test.Pass>(),
  // 124
  check<ExtTriple[2], boolean, Test.Pass>(),
]);

// 125: ExtQuad element types
checks([
  check<ExtQuad[0], string, Test.Pass>(),
  // 126
  check<ExtQuad[1], number, Test.Pass>(),
  // 127
  check<ExtQuad[2], boolean, Test.Pass>(),
  // 128
  check<ExtQuad[3], number, Test.Pass>(),
]);

// =============================================================================
// 8. Enum inheritance — ExtExtendedRole, ExtCoreRole, ExtNonAdminRole
// =============================================================================

// 129: ExtExtendedRoleEnumType includes all values (base + extended)
checks([
  check<Extends<'ADMIN', ExtExtendedRoleEnumType>, 1, Test.Pass>(),
  // 130
  check<Extends<'USER', ExtExtendedRoleEnumType>, 1, Test.Pass>(),
  // 131
  check<Extends<'MODERATOR', ExtExtendedRoleEnumType>, 1, Test.Pass>(),
  // 132
  check<Extends<'SUPERADMIN', ExtExtendedRoleEnumType>, 1, Test.Pass>(),
  // 133
  check<Extends<'GUEST', ExtExtendedRoleEnumType>, 1, Test.Pass>(),
]);

// 134: ExtExtendedRoleEnum const object has all keys
checks([
  check<HasKey<typeof ExtExtendedRoleEnum, 'ADMIN'>, 1, Test.Pass>(),
  // 135
  check<HasKey<typeof ExtExtendedRoleEnum, 'USER'>, 1, Test.Pass>(),
  // 136
  check<HasKey<typeof ExtExtendedRoleEnum, 'MODERATOR'>, 1, Test.Pass>(),
  // 137
  check<HasKey<typeof ExtExtendedRoleEnum, 'SUPERADMIN'>, 1, Test.Pass>(),
  // 138
  check<HasKey<typeof ExtExtendedRoleEnum, 'GUEST'>, 1, Test.Pass>(),
]);

// 139: ExtCoreRoleEnumType includes only picked values (ADMIN, USER)
checks([
  check<Extends<'ADMIN', ExtCoreRoleEnumType>, 1, Test.Pass>(),
  // 140
  check<Extends<'USER', ExtCoreRoleEnumType>, 1, Test.Pass>(),
]);

// 141: ExtCoreRoleEnumType does NOT include MODERATOR
checks([check<Extends<'MODERATOR', ExtCoreRoleEnumType>, 0, Test.Pass>()]);

// 142: ExtNonAdminRoleEnumType includes USER, MODERATOR but NOT ADMIN
checks([
  check<Extends<'USER', ExtNonAdminRoleEnumType>, 1, Test.Pass>(),
  // 143
  check<Extends<'MODERATOR', ExtNonAdminRoleEnumType>, 1, Test.Pass>(),
]);

// 144: ExtNonAdminRoleEnumType does NOT include ADMIN (omitted)
checks([check<Extends<'ADMIN', ExtNonAdminRoleEnumType>, 0, Test.Pass>()]);

// 145: ExtBaseRoleEnumType has exactly 3 values
checks([
  check<Extends<'ADMIN', ExtBaseRoleEnumType>, 1, Test.Pass>(),
  // 146
  check<Extends<'USER', ExtBaseRoleEnumType>, 1, Test.Pass>(),
  // 147
  check<Extends<'MODERATOR', ExtBaseRoleEnumType>, 1, Test.Pass>(),
]);

// 148: ExtBaseRoleEnumType does NOT include extended values
checks([check<Extends<'SUPERADMIN', ExtBaseRoleEnumType>, 0, Test.Pass>()]);

// =============================================================================
// 9. Literal inheritance — ExtExtendedPriority, ExtExtendedLevel
// =============================================================================

// 149: ExtExtendedPriority includes all priority values (base + extended)
checks([
  check<Extends<'low', ExtExtendedPriority>, 1, Test.Pass>(),
  // 150
  check<Extends<'medium', ExtExtendedPriority>, 1, Test.Pass>(),
  // 151
  check<Extends<'high', ExtExtendedPriority>, 1, Test.Pass>(),
  // 152
  check<Extends<'critical', ExtExtendedPriority>, 1, Test.Pass>(),
  // 153
  check<Extends<'urgent', ExtExtendedPriority>, 1, Test.Pass>(),
]);

// 154: ExtExtendedPriority does NOT include non-members
checks([check<Extends<'unknown', ExtExtendedPriority>, 0, Test.Pass>()]);

// 155: ExtExtendedLevel includes all numeric values (base + extended)
checks([
  check<Extends<1, ExtExtendedLevel>, 1, Test.Pass>(),
  // 156
  check<Extends<2, ExtExtendedLevel>, 1, Test.Pass>(),
  // 157
  check<Extends<3, ExtExtendedLevel>, 1, Test.Pass>(),
  // 158
  check<Extends<4, ExtExtendedLevel>, 1, Test.Pass>(),
  // 159
  check<Extends<5, ExtExtendedLevel>, 1, Test.Pass>(),
]);

// 160: ExtExtendedLevel does NOT include non-members
checks([check<Extends<6, ExtExtendedLevel>, 0, Test.Pass>()]);

// =============================================================================
// 10. Deep inheritance — ExtL5VeryDeep (5 levels deep)
// =============================================================================

// 161: ExtL5VeryDeep has fields from all ancestor levels
checks([
  // From ExtBaseEntity (L1)
  check<ExtL5VeryDeep['id'], CerialId<string>, Test.Pass>(),
  // 162
  check<HasKey<ExtL5VeryDeep, 'createdAt'>, 1, Test.Pass>(),
  // 163: From L2
  check<ExtL5VeryDeep['name'], string, Test.Pass>(),
  // 164
  check<HasKey<ExtL5VeryDeep, 'description'>, 1, Test.Pass>(),
  // 165
  check<ExtL5VeryDeep['tags'], string[], Test.Pass>(),
  // 166: From L3
  check<HasKey<ExtL5VeryDeep, 'metadata'>, 1, Test.Pass>(),
  // 167: From L4
  check<ExtL5VeryDeep['status'], string, Test.Pass>(),
  // 168
  check<ExtL5VeryDeep['priority'], number, Test.Pass>(),
  // 169: Own field
  check<ExtL5VeryDeep['archived'], boolean, Test.Pass>(),
]);

// 170: ExtL5VeryDeepCreate has the right fields
checks([
  check<HasKey<ExtL5VeryDeepCreate, 'name'>, 1, Test.Pass>(),
  // 171
  check<HasKey<ExtL5VeryDeepCreate, 'status'>, 1, Test.Pass>(),
  // 172
  check<HasKey<ExtL5VeryDeepCreate, 'archived'>, 1, Test.Pass>(),
]);

// 173: ExtL5VeryDeepWhere has all fields
checks([
  check<HasKey<ExtL5VeryDeepWhere, 'id'>, 1, Test.Pass>(),
  // 174
  check<HasKey<ExtL5VeryDeepWhere, 'name'>, 1, Test.Pass>(),
  // 175
  check<HasKey<ExtL5VeryDeepWhere, 'status'>, 1, Test.Pass>(),
  // 176
  check<HasKey<ExtL5VeryDeepWhere, 'priority'>, 1, Test.Pass>(),
  // 177
  check<HasKey<ExtL5VeryDeepWhere, 'archived'>, 1, Test.Pass>(),
]);

// 178: ExtL5VeryDeepOrderBy has all fields
checks([
  check<ExtL5VeryDeepOrderBy['name'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 179
  check<ExtL5VeryDeepOrderBy['status'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 180
  check<ExtL5VeryDeepOrderBy['priority'], 'asc' | 'desc' | undefined, Test.Pass>(),
  // 181
  check<ExtL5VeryDeepOrderBy['archived'], 'asc' | 'desc' | undefined, Test.Pass>(),
]);

// =============================================================================
// 11. Cross-checks: Create type assignability
// =============================================================================

// 182: Required-only create should be assignable to ExtUserCreate
type ExtUserRequiredOnly = { email: string; name: string };
checks([check<Extends<ExtUserRequiredOnly, ExtUserCreate>, 1, Test.Pass>()]);

// 183: Required + optional should be assignable
type ExtUserWithOptional = { email: string; name: string; age: number; role: string };
checks([check<Extends<ExtUserWithOptional, ExtUserCreate>, 1, Test.Pass>()]);

// 184: ExtAdmin required only (email + name)
type ExtAdminRequiredOnly = { email: string; name: string };
checks([check<Extends<ExtAdminRequiredOnly, ExtAdminCreate>, 1, Test.Pass>()]);

// 185: ExtModerator required only (email + name)
type ExtModRequiredOnly = { email: string; name: string };
checks([check<Extends<ExtModRequiredOnly, ExtModeratorCreate>, 1, Test.Pass>()]);

// 186: ExtSuperAdmin required only (email + name)
type ExtSuperRequiredOnly = { email: string; name: string };
checks([check<Extends<ExtSuperRequiredOnly, ExtSuperAdminCreate>, 1, Test.Pass>()]);

// =============================================================================
// 12. Enum type exact equality checks
// =============================================================================

// 187: ExtExtendedRoleEnumType is exactly the union
type ExpectedExtendedRole = 'ADMIN' | 'USER' | 'MODERATOR' | 'SUPERADMIN' | 'GUEST';
checks([check<IsEqual<ExtExtendedRoleEnumType, ExpectedExtendedRole>, 1, Test.Pass>()]);

// 188: ExtCoreRoleEnumType is exactly the union
type ExpectedCoreRole = 'ADMIN' | 'USER';
checks([check<IsEqual<ExtCoreRoleEnumType, ExpectedCoreRole>, 1, Test.Pass>()]);

// 189: ExtNonAdminRoleEnumType is exactly the union
type ExpectedNonAdminRole = 'USER' | 'MODERATOR';
checks([check<IsEqual<ExtNonAdminRoleEnumType, ExpectedNonAdminRole>, 1, Test.Pass>()]);

// =============================================================================
// 13. Literal type exact equality checks
// =============================================================================

// 190: ExtExtendedPriority exact union
type ExpectedExtPriority = 'low' | 'medium' | 'high' | 'critical' | 'urgent';
checks([check<IsEqual<ExtExtendedPriority, ExpectedExtPriority>, 1, Test.Pass>()]);

// 191: ExtExtendedLevel exact union
type ExpectedExtLevel = 1 | 2 | 3 | 4 | 5;
checks([check<IsEqual<ExtExtendedLevel, ExpectedExtLevel>, 1, Test.Pass>()]);

// =============================================================================
// 14. Tuple type exact equality checks
// =============================================================================

// 192: ExtBasePair exact type
checks([check<IsEqual<ExtBasePair, [string, number]>, 1, Test.Pass>()]);

// 193: ExtTriple exact type
checks([check<IsEqual<ExtTriple, [string, number, boolean]>, 1, Test.Pass>()]);

// 194: ExtQuad exact type
checks([check<IsEqual<ExtQuad, [string, number, boolean, number]>, 1, Test.Pass>()]);
