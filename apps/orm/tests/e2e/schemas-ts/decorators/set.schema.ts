import { f, model, object } from '../../../../src/schema';

export const SetBasic = model('SetBasic', {
  id: f.record().id(),
  name: f.string(),
  tags: f.string().array().set(),
  numbers: f.int().array().set(),
  uuids: f.uuid().array().set(),
});

export const SetDecimal = model('SetDecimal', {
  id: f.record().id(),
  name: f.string(),
  prices: f.decimal().array().set(),
});

export const SetBag = object('SetBag', {
  tags: f.string().array().set(),
  nums: f.int().array(),
});

export const SetNested = model('SetNested', {
  id: f.record().id(),
  name: f.string(),
  bag: f.object(SetBag).optional(),
  strictBag: f.object(SetBag),
});
