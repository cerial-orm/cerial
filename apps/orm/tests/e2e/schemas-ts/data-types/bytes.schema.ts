import { e, f, model, object, tuple } from '../../../../src/schema';

export const BytesBasic = model('BytesBasic', {
  id: f.record().id(),
  name: f.string(),
  payload: f.bytes(),
  metadata: f.bytes().optional(),
  tag: f.bytes().nullable(),
  chunks: f.bytes().array(),
});

export const BytesInfo = object('BytesInfo', {
  body: f.bytes(),
  extra: f.bytes().optional(),
});

export const BytesPair = tuple('BytesPair', [e.bytes(), e.bytes().nullable()]);

export const BytesWithObject = model('BytesWithObject', {
  id: f.record().id(),
  name: f.string(),
  details: f.object(BytesInfo),
});

export const BytesWithTuple = model('BytesWithTuple', {
  id: f.record().id(),
  name: f.string(),
  pair: f.tuple(BytesPair),
});
