import { e, f, model, object, tuple } from '../../../../src/schema';

export const UuidInfo = object('UuidInfo', {
  label: f.string(),
  trackingId: f.uuid(),
  optionalId: f.uuid().optional(),
  autoGenId: f.uuid().uuid(),
});

export const UuidPair = tuple('UuidPair', [e.uuid(), e.uuid()]);

export const UuidBasic = model('UuidBasic', {
  id: f.record().id(),
  name: f.string(),
  token: f.uuid(),
  optionalToken: f.uuid().optional(),
  nullableToken: f.uuid().optional().nullable(),
  tags: f.uuid().array(),
});

export const UuidDecorated = model('UuidDecorated', {
  id: f.record().id(),
  name: f.string(),
  autoId: f.uuid().uuid(),
  autoV4: f.uuid().uuid4(),
  autoV7: f.uuid().uuid7(),
  optAutoId: f.uuid().optional().uuid(),
});

export const UuidWithObject = model('UuidWithObject', {
  id: f.record().id(),
  name: f.string(),
  meta: f.object(UuidInfo),
  optMeta: f.object(UuidInfo).optional(),
});

export const UuidWithTuple = model('UuidWithTuple', {
  id: f.record().id(),
  name: f.string(),
  pair: f.tuple(UuidPair),
  optPair: f.tuple(UuidPair).optional(),
});
