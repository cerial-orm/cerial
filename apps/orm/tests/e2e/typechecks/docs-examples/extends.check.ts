/** Every TypeScript example on docs/schema/typescript/extends.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { e, enum as enumeration, f, literal, model, object, tuple, variant } from '../../../../src/schema';

export const Entity = model(
  'Entity',
  {
    id: f.record().id().private(),
    createdAt: f.date().createdAt().private(),
    updatedAt: f.date().updatedAt(),
  },
  { abstract: true },
);

export const BaseUser = model(
  'BaseUser',
  {
    email: f.email().unique(),
    name: f.string(),
    isActive: f.bool().default(true),
  },
  { abstract: true, extends: Entity },
);

export const User = model('User', { age: f.int().optional() }, { extends: BaseUser });

export const Admin = model('Admin', { level: f.int().default(1) }, { extends: BaseUser.omit('isActive') });

export const Moderator = model(
  'Moderator',
  {
    email: f.email().unique(),
    name: f.string(),
  },
  { extends: Entity.pick('id', 'createdAt') },
);

export const Base = model('Base', { id: f.record().id(), name: f.string() }, { abstract: true });

export const Typo = model(
  'Typo',
  { extra: f.string() },
  // @ts-expect-error Base has no field called nme
  { extends: Base.omit('nme') },
);

export const Locked = model('Locked', { id: f.record().id().private() }, { abstract: true });

export const Overrides = model(
  'Overrides',
  // @ts-expect-error id is private in Locked
  { id: f.record().id() },
  { extends: Locked },
);

export const BaseAddress = object('BaseAddress', {
  street: f.string(),
  city: f.string(),
  country: f.string().default('US'),
});

export const Apartment = object('Apartment', { unit: f.string().optional() }, { extends: BaseAddress });

export const CityAddress = object(
  'CityAddress',
  { district: f.string().optional() },
  { extends: BaseAddress.pick('city', 'country') },
);

export const SimpleAddress = object(
  'SimpleAddress',
  { region: f.string().optional() },
  { extends: BaseAddress.omit('country') },
);

export const Pair = tuple('Pair', [e.string(), e.int()]);

export const Triple = tuple('Triple', [e.bool()], { extends: Pair });

export const FirstTwo = tuple('FirstTwo', [], { extends: Pair.pick(0, 1) });

export const WithoutSecond = tuple('WithoutSecond', [], { extends: Pair.omit(1) });

export const Person = tuple('Person', { name: e.string(), age: e.int() });

export const JustName = tuple('JustName', {}, { extends: Person.pick('name') });

export const NoAge = tuple('NoAge', {}, { extends: Person.omit('age') });

export const BaseRole = enumeration('BaseRole', ['ADMIN', 'USER', 'MODERATOR']);

export const ExtendedRole = enumeration('ExtendedRole', ['SUPERADMIN', 'GUEST'], { extends: BaseRole });

export const CoreRole = enumeration('CoreRole', [], { extends: BaseRole.pick('ADMIN', 'USER') });

export const NonAdminRole = enumeration('NonAdminRole', [], { extends: BaseRole.omit('ADMIN') });

export const BasePriority = literal('BasePriority', [
  variant.string('low'),
  variant.string('medium'),
  variant.string('high'),
]);

export const ExtendedPriority = literal('ExtendedPriority', [variant.string('critical')], {
  extends: BasePriority,
});

export const LowOrHigh = literal('LowOrHigh', [], { extends: BasePriority.pick("'low'", "'high'") });

export const NotMedium = literal('NotMedium', [], { extends: BasePriority.omit("'medium'") });

export const BaseMixed = literal('BaseMixed', [
  variant.string('active'),
  variant.string('inactive'),
  variant.bool(true),
  variant.bool(false),
]);

export const OnlyBools = literal('OnlyBools', [], { extends: BaseMixed.pick('true', 'false') });

export const NoBools = literal('NoBools', [], { extends: BaseMixed.omit('true', 'false') });

export const Source = object('Source', {
  a: f.string(),
  b: f.string(),
  c: f.string(),
});

export const Narrow = object('Narrow', { p: f.string() }, { extends: Source.pick('a', 'b') });

export const Narrower = object('Narrower', { r: f.string().optional() }, { extends: Narrow.omit('p') });

export const Slim = object('Slim', { s: f.string() }, { extends: Source.omit('c') });

export const Slimmer = object('Slimmer', { t: f.string().optional() }, { extends: Slim.pick('s') });

export const Wide = object('Wide', { a: f.string(), b: f.string(), c: f.string() });

export const Mixed = object(
  'Mixed',
  { d: f.string() },
  // @ts-expect-error a clause is a pick or an omit, not both
  { extends: Wide.pick('a', 'b').omit('b') },
);
