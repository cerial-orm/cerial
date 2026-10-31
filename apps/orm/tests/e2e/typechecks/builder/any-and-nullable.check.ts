/**
 * Type checks for `Any` and for which field factories take `@nullable`.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * `Any` takes neither `?` nor `@nullable` (TYPE any already accepts NONE and null), and an object or tuple
 * field takes no `@nullable` (SurrealDB cannot define sub-fields on a nullable parent). Literal and enum
 * fields keep it, so those positives guard against an over-wide restriction.
 */

import { f, object, tuple, e, literal, variant, enum as enumeration } from '../../../../src/parser/builder';

const Address = object('Address', { street: f.string() });
const Pair = tuple('Pair', [e.int(), e.int()]);
const Level = literal('Level', [variant.int(1), variant.int(2)]);
const Role = enumeration('Role', ['ADMIN', 'USER']);

// Positive: Any keeps everything else, and other types keep `?` and `@nullable`.
export const anyKept = [f.any().array(), f.any().private(), f.any().default(1)];
export const otherTypes = [f.string().optional(), f.string().nullable()];

// Negative: Any is neither optional nor nullable, in any order.
// @ts-expect-error Any? is blocked: TYPE any already accepts NONE
f.any().optional();
// @ts-expect-error Any @nullable is blocked: TYPE any already accepts null
f.any().nullable();
// @ts-expect-error the restriction survives chaining
f.any().array().nullable();
// @ts-expect-error the restriction survives chaining
f.any().private().optional();

// Positive: object and tuple fields keep `?` and `[]`; literal and enum fields keep `@nullable`.
export const compositeKept = [
  f.object(Address).optional(),
  f.object(Address).array(),
  f.tuple(Pair).optional(),
  f.literal(Level).nullable(),
  f.enum(Role).nullable(),
  f.literal(Level).optional().nullable(),
];

// Negative: an object or tuple field takes no @nullable, whichever factory built it.
// @ts-expect-error SurrealDB cannot define sub-fields on a nullable object parent
f.object(Address).nullable();
// @ts-expect-error SurrealDB cannot define sub-fields on a nullable tuple parent
f.tuple(Pair).nullable();
// @ts-expect-error the restriction survives chaining and optional
f.object(Address).optional().array().nullable();
// @ts-expect-error the restriction survives chaining
f.tuple(Pair).array().nullable();
