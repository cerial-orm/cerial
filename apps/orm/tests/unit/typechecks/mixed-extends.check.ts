/**
 * Type checks for a TypeScript declaration extending a `.cerial` declaration through its handle.
 *
 * Verified with `tsc --noEmit`, NOT executed at runtime. Run: bun run typecheck
 *
 * `fixtures/handles.ts` is what `emitHandles` writes for `fixtures/mixed.cerial`; a test beside the
 * emitter keeps the two equal, so these checks see the shape a user's `cerial/handles.ts` really has.
 */

import { enum as enumeration, f, literal, model, object, tuple } from '../../../src/parser/builder';
import { Address, Base, Level, Point, Role } from './fixtures/handles';

// Positive: each kind accepts the members its `.cerial` declaration has, inherited ones included
export const accepted = [
  model('PicksFields', { extra: f.string() }, { extends: Base.pick('id', 'name', 'home') }),
  model('OmitsFields', { extra: f.string() }, { extends: Base.omit('email') }),
  object('PicksObject', { extra: f.string() }, { extends: Address.pick('street', 'city') }),
  object('OmitsObject', { extra: f.string() }, { extends: Address.omit('city') }),
  // A tuple element is reached by name or, for an unnamed one, by position
  tuple('PicksByName', [], { extends: Point.pick('x', 'y') }),
  tuple('PicksByIndex', [], { extends: Point.pick(0, 2) }),
  tuple('PicksMixed', [], { extends: Point.pick('x', 2) }),
  tuple('OmitsByName', [], { extends: Point.omit('y') }),
  enumeration('PicksValues', [], { extends: Role.pick('ADMIN') }),
  enumeration('OmitsValues', [], { extends: Role.omit('USER') }),
  literal('PicksVariants', [], { extends: Level.pick("'low'", 'Int') }),
  literal('OmitsVariants', [], { extends: Level.omit('1') }),
];

// Negative: a name the parent does not have is a compile error, for every kind
// @ts-expect-error -- 'nme' is not a field of Base
Base.pick('nme');
// @ts-expect-error -- 'nme' is not a field of Base
Base.omit('nme');
// @ts-expect-error -- the pick list of an extends clause is checked the same way
model('BadPick', { extra: f.string() }, { extends: Base.pick('id', 'nope') });
// @ts-expect-error -- 'zipcode' is not a field of Address
Address.pick('zipcode');
// @ts-expect-error -- 'z' is not an element of Point
Point.pick('z');
// @ts-expect-error -- 'z' is not an element of Point
Point.omit('z');
// @ts-expect-error -- 'OWNER' is not a value of Role
Role.pick('OWNER');
// @ts-expect-error -- "'high'" is not a variant of Level
Level.omit("'high'");

// The tuple position form types as an unrestricted number: `Point.pick('x', 1)` compiles. Whether the position exists
// (here 0 to 2) is checked by the schema validator when generation reads the declaration, not by tsc.
export const indexIsNotRangeChecked = tuple('FarIndex', [], { extends: Point.pick(9) });

// `!!private` stops a child redeclaring the field...
// @ts-expect-error -- 'secret' is private in Base, so a child cannot redeclare it
model('Redeclares', { secret: f.string() }, { extends: Base });
// @ts-expect-error -- still private when a pick list leaves it out
model('RedeclaresAfterPick', { secret: f.string() }, { extends: Base.pick('id') });
// @ts-expect-error -- 'zip' is private in Address
object('RedeclaresZip', { zip: f.string() }, { extends: Address });
// ...but not leaving it out: omitting it and picking without it both compile
export const leavesPrivateOut = [
  model('OmitsSecret', { extra: f.string() }, { extends: Base.omit('secret') }),
  model('PicksWithoutSecret', { extra: f.string() }, { extends: Base.pick('id', 'name') }),
  model('PicksSecret', { extra: f.string() }, { extends: Base.pick('secret') }),
  object('OmitsZip', { extra: f.string() }, { extends: Address.omit('zip') }),
];

// Composite directives: a field inherited from the `.cerial` parent is a valid key, a dotted path too
export const directives = [
  model('Indexed', { extra: f.string() }, { extends: Base, index: { name: 'byName', fields: ['name', 'extra'] } }),
  model('Unique', {}, { extends: Base, unique: { name: 'byEmail', fields: ['email', 'home.city'] } }),
  model('UniqueAfterOmit', {}, { extends: Base.omit('email'), unique: { name: 'byName', fields: ['name'] } }),
  model('UniquePicked', {}, { extends: Base.pick('id', 'home'), unique: [{ name: 'u', fields: ['home.street'] }] }),
];

// @ts-expect-error -- 'nope' is neither inherited nor declared
model('BadIndex', {}, { extends: Base, index: { name: 'bad', fields: ['nope'] } });
// @ts-expect-error -- the head of a dotted path must be a field too
model('BadDotted', {}, { extends: Base, unique: { name: 'bad', fields: ['nope.city'] } });
// @ts-expect-error -- 'email' was omitted from the parent, so the child no longer has it
model('OmittedKey', {}, { extends: Base.omit('email'), unique: { name: 'bad', fields: ['email'] } });
// @ts-expect-error -- 'email' was left out of the pick list
model('UnpickedKey', {}, { extends: Base.pick('id'), index: [{ name: 'bad', fields: ['email'] }] });
