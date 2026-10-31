/**
 * Type checks for `f.reverse`, the reverse side of a relation.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * A reverse relation stores no key and owns no deletion rule, so `.field()`, `.onDelete()` and
 * `.nullable()` are absent, and the schema has no optional array relation. `.key()` pairs it with its
 * forward side.
 */

import { f, model } from '../../../../src/parser/builder';

const Target = model('Target', { id: f.record().id() });
const reverse = f.reverse(() => Target);

// Positive: the key, array, optional and private forms.
export const allowed = [
  reverse.key('tree'),
  reverse.array().key('tree'),
  reverse.optional().key('tree'),
  reverse.private(),
  reverse.key('tree').optional().private(),
];

// Positive: the forward side keeps what the reverse side lacks.
export const forward = f
  .relation(() => Target)
  .optional()
  .field('ownerId')
  .onDelete('SetNull');

// Negative: nothing a reverse relation does not own.
// @ts-expect-error a reverse relation stores no key, so it has nothing to name
reverse.field('ownerId');
// @ts-expect-error the forward side owns the deletion rule
reverse.optional().onDelete('Cascade');
// @ts-expect-error @nullable is refused on a relation
reverse.nullable();
// @ts-expect-error the restriction survives chaining
reverse.key('tree').optional().nullable();
// @ts-expect-error the schema has no optional array relation, so .array() is gone after .optional()
reverse.optional().array();
// @ts-expect-error the schema has no optional array relation, so .optional() is gone after .array()
reverse.array().optional();
// @ts-expect-error @unique is for forward relations: a reverse one stores nothing
reverse.unique();
