/** Every TypeScript example on docs/schema/typescript/objects-tuples.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { e, f, model, object, tuple } from '../../../../src/schema';

export const Address = object('Address', {
  street: f.string(),
  city: f.string(),
  zipCode: f.string().optional(),
  internalNote: f.string().optional().private(),
});

export const Customer = model('Customer', {
  id: f.record().id(),
  name: f.string(),
  address: f.object(Address),
  shipping: f.object(Address).optional(),
  past: f.object(Address).array(),
});

export const Meta = object('Meta', {
  label: f.string(),
});

export const Document = model('Document', {
  id: f.record().id(),
  strictMeta: f.object(Meta),
  looseMeta: f.object(Meta).flexible(),
});

export const Pair = tuple('Pair', [e.string(), e.int()]);

export const Coordinate = tuple('Coordinate', { lat: e.float(), lng: e.float() });

export const Place = model('Place', {
  id: f.record().id(),
  location: f.tuple(Coordinate),
  backup: f.tuple(Coordinate).optional(),
  trail: f.tuple(Coordinate).array(),
});

export const Entry = tuple('Entry', [e.string().named('name'), e.int(), e.bool()]);

export const Doubled = tuple('Doubled', {
  // @ts-expect-error the key names the element, so drop .named()
  first: e.string().named('other'),
});

export const Reading = tuple('Reading', {
  label: e.string(),
  value: e.float().nullable(),
  taken: e.date().createdAt(),
  seen: e.date().updatedAt(),
  tier: e.int().default(1),
  hits: e.int().defaultAlways(7),
  secret: e.string().private(),
});

export const Refused = tuple('Refused', [
  // @ts-expect-error elements cannot be optional
  e.string().optional(),
]);

export const Spot = object('Spot', {
  street: f.string(),
  city: f.string(),
});

export const Inner = tuple('Inner', { x: e.int(), y: e.int() });

export const Outer = tuple('Outer', [e.string().named('label'), e.tuple(Inner), e.object(Spot)]);

export const Tree = tuple('Tree', [e.int(), e.self().nullable()]);
