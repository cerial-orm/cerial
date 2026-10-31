/**
 * Type checks for the record id type names `f.record` accepts.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * The schema validator refuses a record id type outside int, number, string, uuid and a reference to a
 * tuple, object or literal. The factory refuses the same names at compile time.
 */

import { f, tuple, e } from '../../../../src/parser/builder';

const Pair = tuple('Pair', [e.int(), e.int()]);

// Positive: every primitive id type, a union, a reference and the untyped form.
export const accepted = [
  f.record(),
  f.record('int'),
  f.record('number'),
  f.record('string'),
  f.record('uuid'),
  f.record('string', 'int'),
  f.record('uuid', 'int'),
  f.record(Pair),
];

// Negative: a name the schema refuses.
// @ts-expect-error float is not a record id type; the schema refuses it
f.record('float');
// @ts-expect-error bool is not a record id type
f.record('bool');
// @ts-expect-error one refused name among valid ones is still refused
f.record('string', 'bool');
