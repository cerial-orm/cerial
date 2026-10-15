/**
 * Type checks for @unique enum and literal fields in FindUniqueWhere
 *
 * This file is verified with `tsc --noEmit`, NOT executed at runtime.
 * Run: bun run typecheck
 *
 * These fields used to type as `unknown`, so any value compiled.
 */

import type { EnumUniqueFindUniqueWhere, LiteralUniqueFindUniqueWhere } from '../../generated';

export const enumInside: EnumUniqueFindUniqueWhere = { role: 'ADMIN' };
export const literalInside: LiteralUniqueFindUniqueWhere = { status: 'active' };

// @ts-expect-error - 'OWNER' is not a member of the Role enum
export const enumOutside: EnumUniqueFindUniqueWhere = { role: 'OWNER' };

// @ts-expect-error - 'archived' is not a member of the Status literal
export const literalOutside: LiteralUniqueFindUniqueWhere = { status: 'archived' };
