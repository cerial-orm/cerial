import { Test } from 'ts-toolbelt';
import { f, handle, model, object, tuple } from '../../../src/parser/builder';

const User = handle.model('User', { members: ['id', 'name', 'authorId'], id: ['int'] });
const Plain = handle.model('Plain', { members: ['id'], id: [] });
const NoId = handle.model('NoId', { members: ['a'] });
const Address = handle.object('Address', { members: ['street', 'city'] });
const Point = handle.tuple('Point', { members: ['x', 'y'], size: 3 });
const Role = handle.enum('Role', ['Admin', 'Guest']);
const Level = handle.literal('Level', { variants: ["'low'", '1', 'Int'], simple: true });
const Secret = handle.model('Secret', { members: ['id', 'token'], private: ['token'] });

type IdOfHandle<H> = H extends { readonly idType?: infer I } ? I : never;
type MembersOfHandle<H> = H extends { readonly memberNames?: infer M } ? M : never;
type NameOfHandle<H> = H extends { readonly name: infer N } ? N : never;

// Positive: names, member names and the id type are literal types
Test.check<NameOfHandle<typeof User>, 'User', Test.Pass>();
Test.check<MembersOfHandle<typeof User>, 'id' | 'name' | 'authorId', Test.Pass>();
Test.check<IdOfHandle<typeof User>, number, Test.Pass>();
Test.check<IdOfHandle<typeof Plain>, string, Test.Pass>();
Test.check<IdOfHandle<typeof NoId>, never, Test.Pass>();
Test.check<MembersOfHandle<typeof Address>, 'street' | 'city', Test.Pass>();
Test.check<MembersOfHandle<typeof Point>, 'x' | 'y', Test.Pass>();
Test.check<MembersOfHandle<typeof Role>, 'Admin' | 'Guest', Test.Pass>();
Test.check<MembersOfHandle<typeof Level>, "'low'" | '1' | 'Int', Test.Pass>();

// The same shape a builder's own handle has, so a later task can hand it to anything that takes one
const Local = model('Local', { id: f.record('int').id() });
Test.check<IdOfHandle<typeof Local>, IdOfHandle<typeof User>, Test.Pass>();

// Positive: what the pick and omit forms consume. A handle is a parent for each kind, pick and omit are
// checked against the member names, a tuple also takes a position, and a private member stays omittable
model('Child', { id: f.record('int').id() }, { extends: User });
model('Picked', { extra: f.string() }, { extends: User.pick('name') });
model('Omitted', { extra: f.string() }, { extends: User.omit('name') });
object('Home', { zip: f.string() }, { extends: Address.pick('street') });
tuple('Point3', [], { extends: Point.pick('x', 1) });
model('Hidden', { extra: f.string() }, { extends: Secret.omit('token') });

// Negative: a wrong member is a compile error for each kind
// @ts-expect-error -- 'nme' is not a field of User
User.pick('nme');
// @ts-expect-error -- 'nme' is not a field of User
User.omit('nme');
// @ts-expect-error -- 'zip' is not a field of Address
Address.pick('zip');
// @ts-expect-error -- 'z' is not an element of Point
Point.omit('z');
// @ts-expect-error -- a tuple takes a name or a position, not a string that is neither
Point.pick('0');
// @ts-expect-error -- 'Owner' is not a value of Role
Role.pick('Owner');
// @ts-expect-error -- "'high'" is not a variant of Level
Level.omit("'high'");

// Negative: a child cannot redeclare what the parent holds private
// @ts-expect-error -- 'token' is private in Secret
model('Redeclared', { token: f.string() }, { extends: Secret });

// Negative: the id type is not widened
// @ts-expect-error -- User's id is a number
const wrongId: IdOfHandle<typeof User> = 'a';
void wrongId;
