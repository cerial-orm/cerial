/**
 * Type checks for tuple `extends` in the TypeScript builder.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * Names are checked against the parent's named elements. A position is any number, because tracking
 * which positions exist needs variadic tuple arithmetic; an out-of-range one is refused when the
 * schema is resolved.
 */

import { e, tuple } from '../../../../src/parser/builder';

const Named = tuple('Named', { name: e.string(), age: e.int(), secret: e.bool().private() });
const Positional = tuple('Positional', [e.string(), e.int()]);
const Child = tuple('Child', { extra: e.float() }, { extends: Named.omit('age') });

// Positive: names, positions, a mix, an empty body, and appended elements.
export const accepted = [
  tuple('A', {}, { extends: Named.pick('name', 'age') }),
  tuple('B', {}, { extends: Named.omit('secret') }),
  tuple('C', [], { extends: Positional.pick(0, 1) }),
  tuple('D', [], { extends: Positional.omit(1) }),
  tuple('E', {}, { extends: Named.pick('name', 2) }),
  tuple('F', [e.bool()], { extends: Positional.pick(0) }),
  tuple('G', { more: e.bool() }, { extends: Named }),
  // Leaving a private element out of a pick list is legal, and so is picking it
  tuple('H', {}, { extends: Named.pick('name') }),
  tuple('I', {}, { extends: Named.pick('secret') }),
  // A tuple that extends one can itself be extended and see the inherited names
  tuple('J', { tail: e.int() }, { extends: Child }),
];

// Negative: a name the parent does not declare.
// @ts-expect-error 'missing' is not an element of Named
Named.pick('missing');
// @ts-expect-error 'missing' is not an element of Named
Named.omit('name', 'missing');

// Negative: a positional parent has no names.
// @ts-expect-error Positional declares no named elements
Positional.pick('name');

// Negative: a position is a number, never a numeric string.
// @ts-expect-error positions are numbers
Positional.pick('0');

// Negative: pick and omit are exclusive per clause.
// @ts-expect-error a filtered reference has neither method
Named.pick('name').omit('age');
// @ts-expect-error a filtered reference has neither method
Named.omit('age').pick('name');

// Negative: a private element cannot be redeclared, plain or filtered.
// @ts-expect-error 'secret' is private on Named
tuple('K', { secret: e.bool() }, { extends: Named });
// @ts-expect-error 'secret' is private on Named, a filter that keeps it changes nothing
tuple('L', { secret: e.bool() }, { extends: Named.pick('secret', 'name') });
// @ts-expect-error 'secret' stays private for a descendant
tuple('M', { secret: e.bool() }, { extends: Child });
