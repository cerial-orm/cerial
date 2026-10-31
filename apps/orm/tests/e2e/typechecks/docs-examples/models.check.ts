/** Every TypeScript example on docs/schema/typescript/models.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { e, f, model, object, tuple } from '../../../../src/schema';

export const IdCoord = tuple('IdCoord', [e.float(), e.float()]);

export const IdKey = object('IdKey', {
  service: f.string(),
  timestamp: f.int(),
});

export const PlainId = model('PlainId', {
  id: f.record().id(),
});

export const IntId = model('IntId', {
  id: f.record('int').id(),
});

export const NumberId = model('NumberId', {
  id: f.record('number').id(),
});

export const StringId = model('StringId', {
  id: f.record('string').id(),
});

export const UuidId = model('UuidId', {
  id: f.record('uuid').id(),
});

export const TupleId = model('TupleId', {
  id: f.record(IdCoord).id(),
});

export const ObjectId = model('ObjectId', {
  id: f.record(IdKey).id(),
});

export const UnionId = model('UnionId', {
  id: f.record('string', 'int').id(),
});

export const BadId = model('BadId', {
  // @ts-expect-error float is not a valid record id type
  id: f.record('float').id(),
});

export const Bookmarks = model('Bookmarks', {
  id: f.record().id(),
  externalRef: f.record('int'),
  externalRefs: f.record('int').array(),
});

export const Location = object('Location', {
  city: f.string(),
  zip: f.string(),
  street: f.string().optional(),
});

export const Warehouse = model(
  'Warehouse',
  {
    id: f.record().id(),
    name: f.string().index(),
    location: f.object(Location),
    ownerId: f.record(),
    slot: f.int(),
  },
  {
    unique: [
      { name: 'cityZip', fields: ['location.city', 'location.zip'] },
      { name: 'nameCity', fields: ['name', 'location.city'] },
    ],
    index: { name: 'ownerSlot', fields: ['ownerId', 'slot'] },
  },
);

export const Timestamped = model(
  'Timestamped',
  {
    id: f.record().id(),
    createdAt: f.date().createdAt(),
  },
  { abstract: true },
);
