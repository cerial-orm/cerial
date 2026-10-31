/**
 * Type checks for literal and enum `extends` in the TypeScript builder.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * A literal's pick or omit list is checked against the parent's variant identities: a string quoted, a
 * number or boolean as written, a broad type or reference by name. An enum's list takes its bare values.
 * A child of a complex parent is not a simple literal, so an object or tuple field cannot nest it.
 */

import { enum as enumeration, literal, object, f, tuple, e, variant } from '../../../../src/parser/builder';
import type { SimpleLiteralReference } from '../../../../src/parser/builder';

const Address = object('Address', { street: f.string() });
const Pair = tuple('Pair', [e.int(), e.int()]);
const Base = literal('Base', [
  variant.string('low'),
  variant.int(1),
  variant.float(2.5),
  variant.bool(true),
  variant.broadType('Int'),
  variant.object(Address),
  variant.tuple(() => Pair),
]);
const Role = enumeration('Role', ['ADMIN', 'USER']);
const Plain = literal('Plain', [variant.string('a')]);

// Positive: every kind by identity, both modes, a child of a child, and enum values.
export const accepted = [
  literal('A', [], { extends: Base.pick(`'low'`, '1', '2.5', 'true', 'Int', 'Address', 'Pair') }),
  literal('B', [], { extends: Base.omit(`'low'`, 'Address') }),
  literal('C', [variant.string('x')], { extends: literal('Mid', [variant.int(9)], { extends: Base }).pick('9') }),
  enumeration('E', [], { extends: Role.pick('ADMIN') }),
  enumeration('F', ['GUEST'], { extends: Role.omit('USER') }),
];

// Negative: a string variant is quoted, a bare name is not its identity.
// @ts-expect-error 'low' is written "'low'"
Base.pick('low');
// @ts-expect-error a number is written as its digits, not as a number
Base.pick(1);
// @ts-expect-error Base declares no variant 'high'
Base.omit(`'high'`);
// @ts-expect-error Base declares no variant 99
Base.pick('99');
// @ts-expect-error a bool is written 'true', and false is not a variant of Base
Base.pick('false');
// @ts-expect-error Role declares no GUEST
Role.pick('GUEST');
// @ts-expect-error an enum value is bare, never quoted
Role.pick(`'ADMIN'`);

// Negative: pick and omit are exclusive per clause.
// @ts-expect-error a filtered reference has neither method
Base.pick('1').omit('true');
// @ts-expect-error a filtered reference has neither method
Role.pick('ADMIN').omit('USER');

// Negative: a literal child is checked against its own declared variants, not the grandparent's.
const Child = literal('Child', [variant.string('own')], { extends: Base.pick('1') });
// @ts-expect-error 'low' belongs to Base, not Child's own variants
Child.pick(`'low'`);

// Simple: a child of a simple parent is nestable; a child of a complex one, filtered or not, is not.
export const nestable: SimpleLiteralReference[] = [
  literal('S1', [variant.string('b')], { extends: Plain }),
  literal('S2', [], { extends: Plain.pick(`'a'`) }),
  enumeration('S3', ['X'], { extends: Role }),
];
// @ts-expect-error inherits an objectRef from its parent
export const complexPlain: SimpleLiteralReference = literal('N1', [], { extends: Base });
// @ts-expect-error a filter does not track which variants survive
export const complexPicked: SimpleLiteralReference = literal('N2', [], { extends: Base.pick('1') });
// @ts-expect-error a complex child of a simple parent
export const complexOwn: SimpleLiteralReference = literal('N3', [variant.object(Address)], { extends: Plain });
