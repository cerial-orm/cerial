/**
 * Type checks for `extends` with pick and omit in the TypeScript builder.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * A pick or omit list is checked against the parent's own declared names, a clause carries one mode, and a
 * composite directive on the child may start from any name the child inherits.
 */

import { f, model, object } from '../../../../src/parser/builder';

const Base = model('Base', { id: f.record().id(), name: f.string(), age: f.int().optional() }, { abstract: true });
const Mid = model('Mid', { extra: f.int() }, { extends: Base.omit('age') });
const Address = object('Address', { street: f.string(), city: f.string() });

// Positive: own names, both modes, objects, a child of a child, and an inherited name in a directive.
export const accepted = [
  model('A', {}, { extends: Base }),
  model('B', {}, { extends: Base.pick('id', 'name') }),
  model('C', {}, { extends: Base.omit('age') }),
  model('D', {}, { extends: Mid.pick('extra') }),
  model('E', {}, { extends: Mid, unique: { name: 'byName', fields: ['name', 'extra'] } }),
  object('Home', {}, { extends: Address.pick('street') }),
];

// Negative: a name the parent does not declare.
// @ts-expect-error 'nope' is not a field of Base
Base.pick('nope');
// @ts-expect-error 'nope' is not a field of Base
Base.omit('age', 'nope');
// @ts-expect-error 'zip' is not a field of Address
Address.omit('zip');

// Negative: own names only. 'name' is Base's, so Mid cannot pick it.
// @ts-expect-error Mid declares only 'extra'
Mid.pick('name');

// Negative: one mode per clause.
// @ts-expect-error a picked reference has no omit
Base.pick('id').omit('name');
// @ts-expect-error an omitted reference has no pick
Base.omit('id').pick('name');

// Negative: a list needs a name, and the clause takes a handle.
// @ts-expect-error an empty list is not a filter
Base.pick();
// @ts-expect-error a name string is not a handle
model('F', {}, { extends: 'Base' });

// Negative: a directive may not name what the child does not have.
// @ts-expect-error 'age' was omitted by Mid's own clause
model('G', {}, { extends: Mid, unique: { name: 'u', fields: ['age'] } });
// @ts-expect-error 'ghost' is neither declared nor inherited
model('H', {}, { extends: Base, unique: { name: 'u', fields: ['ghost'] } });
