import { f, model } from '../../../../src/schema';

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
