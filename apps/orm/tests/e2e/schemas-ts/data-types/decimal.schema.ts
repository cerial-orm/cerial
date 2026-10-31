import { e, f, model, object, tuple } from '../../../../src/schema';

export const DecimalBasic = model('DecimalBasic', {
  id: f.record().id(),
  name: f.string(),
  price: f.decimal(),
  discount: f.decimal().optional(),
  tax: f.decimal().nullable(),
  amounts: f.decimal().array(),
});

export const DecimalDecorated = model('DecimalDecorated', {
  id: f.record().id(),
  name: f.string(),
  defaultPrice: f.decimal().default(99.99),
  alwaysPrice: f.decimal().defaultAlways(0),
});

export const DecimalInfo = object('DecimalInfo', {
  amount: f.decimal(),
  fee: f.decimal().optional(),
});

export const DecimalPair = tuple('DecimalPair', [e.decimal(), e.decimal().nullable()]);

export const DecimalWithObject = model('DecimalWithObject', {
  id: f.record().id(),
  name: f.string(),
  pricing: f.object(DecimalInfo),
});

export const DecimalWithTuple = model('DecimalWithTuple', {
  id: f.record().id(),
  name: f.string(),
  pair: f.tuple(DecimalPair),
});
