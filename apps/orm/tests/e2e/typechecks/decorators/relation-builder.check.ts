/**
 * Type checks for the relation builder's cardinality and `@onDelete` rules.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * A required relation auto-cascades and the schema refuses `@onDelete` on it, as on an array relation, so
 * the method is absent from those builders and present once the relation is optional or nullable.
 */

import type { RelationBuilder } from '../../../../src/parser/builder';

declare const required: RelationBuilder;

// Positive: optional or nullable, singular, in either chain order.
export const allowed = [
  required.optional().onDelete('SetNull'),
  required.optional().key('tree').onDelete('Cascade'),
  required.key('tree').optional().onDelete('SetNone'),
  required.nullable().onDelete('Restrict'),
  required.optional().private().onDelete('NoAction'),
  required.optional().onDelete('Cascade').key('tree'),
];

// Negative: absent from a required relation, and from anything chained from one without .optional().
// @ts-expect-error a required relation auto-cascades, so @onDelete is not on its chain
required.onDelete('Cascade');
// @ts-expect-error still required after .key()
required.key('tree').onDelete('Cascade');
// @ts-expect-error still required after .private()
required.private().onDelete('Cascade');
// @ts-expect-error an array relation auto-cleans up, so @onDelete is not on its chain
required.array().onDelete('Cascade');
// @ts-expect-error an optional relation turned array is still an array relation
required.optional().array();
// @ts-expect-error the schema has no optional array relation, so .optional() is gone after .array()
required.array().optional();
// @ts-expect-error onDelete takes only the registry's actions
required.optional().onDelete('Nope');
