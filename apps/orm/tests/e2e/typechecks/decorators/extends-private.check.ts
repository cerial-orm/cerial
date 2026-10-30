/**
 * Type checks for `!!private` under `extends` in the TypeScript builder.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * Private stops a child redeclaring the field, however far up the chain it was declared and whether or not
 * an intermediate dropped it. It does not stop a child omitting it or leaving it out of a pick list, so
 * those positives matter as much as the negatives: a type that rejects them refuses legal schemas.
 */

import { f, model, object } from '../../../../src/parser/builder';

const Root = model(
  'Root',
  { id: f.record().id().private(), secret: f.string().private(), name: f.string(), age: f.int().optional() },
  { abstract: true },
);
// Level two drops `secret` and adds a private field of its own.
const Mid = model('Mid', { token: f.string().optional().private() }, { abstract: true, extends: Root.omit('secret') });
const Leaf = model('Leaf', { extra: f.int() }, { abstract: true, extends: Mid });
const Address = object('Address', { street: f.string().private(), city: f.string() });

// Positive: omitting a private field, picking without it, and picking it by name all compile.
export const accepted = [
  model('OmitsPrivate', {}, { extends: Root.omit('id', 'secret') }),
  model('PicksWithout', {}, { extends: Root.pick('name', 'age') }),
  model('PicksPrivate', {}, { extends: Root.pick('id', 'name') }),
  model('DeepOmit', {}, { extends: Leaf.omit('extra') }),
  // A non-private parent field is still overridable, and so is a name nobody reserves.
  model('OverridesPlain', { name: f.string().optional(), more: f.int() }, { extends: Root }),
  model('OverridesLeaf', { extra: f.string() }, { extends: Mid.pick('token') }),
  object('Town', { city: f.string().optional() }, { extends: Address }),
  // The mark survives every builder call that follows `.private()` and precedes it.
  model('Chained', { a: f.string().private().optional(), b: f.string().optional().private() }),
];

// Negative: redeclaring a private field, plain or filtered.
// @ts-expect-error 'id' is private on Root
model('A', { id: f.record().id() }, { extends: Root });
// @ts-expect-error 'id' is private on Root, a filter that keeps it changes nothing
model('B', { id: f.record().id() }, { extends: Root.pick('id', 'name') });
// @ts-expect-error 'secret' stays reserved when a filter that omits it is the extends clause
model('C', { secret: f.string() }, { extends: Root.omit('age') });

// Negative: transitive. `secret` was dropped at Mid and `id` is two levels up.
// @ts-expect-error 'secret' stays private for every descendant, though Mid dropped it
model('D', { secret: f.string() }, { extends: Mid });
// @ts-expect-error 'id' is private on Root, three levels up
model('E', { id: f.record().id() }, { extends: Leaf });
// @ts-expect-error 'token' is private on Mid
model('F', { token: f.string() }, { extends: Leaf.omit('extra') });

// Negative: an object redeclaring a private object field.
// @ts-expect-error 'street' is private on Address
object('Road', { street: f.string() }, { extends: Address });

// Negative: an inline parent, so the mark is read from the handle and not from a shared constant.
// @ts-expect-error 'name' is private on Named
model('G', { name: f.string() }, { extends: model('Named', { name: f.string().private() }) });
