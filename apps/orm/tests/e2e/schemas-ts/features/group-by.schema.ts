import { enum as enumeration, f, literal, model, object, variant } from '../../../../src/schema';

export const GbStatus = enumeration('GbStatus', ['OPEN', 'SHIPPED', 'CANCELLED']);

export const GbTier = literal('GbTier', [variant.string('free'), variant.string('pro'), variant.string('team')]);

export const GbAddress = object('GbAddress', {
  city: f.string(),
  zip: f.string().optional(),
});

export const GbAuthor = model('GbAuthor', {
  id: f.record().id(),
  name: f.string(),
});

export const GbTag = model('GbTag', {
  id: f.record().id(),
  name: f.string(),
  orderIds: f.record().array(),
  orders: f.relation('GbOrder').array().field('orderIds'),
});

export const GbOrder = model('GbOrder', {
  id: f.record().id(),
  label: f.string(),
  region: f.string().optional(),
  nick: f.string().optional().nullable(),
  qty: f.int(),
  weight: f.float(),
  amount: f.number(),
  price: f.decimal(),
  bonus: f.decimal().optional(),
  units: f.int8(),
  paid: f.bool(),
  placed: f.date(),
  ttl: f.duration(),
  ref: f.uuid(),
  status: f.enum(GbStatus),
  tier: f.literal(GbTier),
  codes: f.string().array(),
  address: f.object(GbAddress),
  altAddress: f.object(GbAddress).optional(),
  authorId: f.record().optional(),
  author: f.relation('GbAuthor').field('authorId').optional(),
  tagIds: f.record().array(),
  tags: f.relation('GbTag').array().field('tagIds'),
});

export const GbLabel = model('GbLabel', {
  id: f.record().id(),
  name: f.string(),
  note: f.string().optional(),
});

export const GbBare = model('GbBare', {
  id: f.record().id(),
});
