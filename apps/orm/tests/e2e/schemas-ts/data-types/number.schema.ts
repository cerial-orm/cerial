import { e, f, model, object, tuple } from '../../../../src/schema';

export const NumberInfo = object('NumberInfo', {
  views: f.number(),
  downloads: f.number().optional(),
  rating: f.number().default(0),
});

export const NumberCoord = tuple('NumberCoord', [e.number(), e.number(), e.number().nullable()]);

export const NumberBasic = model('NumberBasic', {
  id: f.record().id(),
  name: f.string(),
  price: f.number(),
  rating: f.number().optional(),
  weight: f.number().nullable(),
  scores: f.number().array(),
});

export const NumberDecorated = model('NumberDecorated', {
  id: f.record().id(),
  name: f.string(),
  score: f.number().default(0),
  multiplier: f.number().defaultAlways(1),
});

export const NumberWithObject = model('NumberWithObject', {
  id: f.record().id(),
  name: f.string(),
  stats: f.object(NumberInfo),
  optStats: f.object(NumberInfo).optional(),
});

export const NumberWithTuple = model('NumberWithTuple', {
  id: f.record().id(),
  name: f.string(),
  coord: f.tuple(NumberCoord),
  optCoord: f.tuple(NumberCoord).optional(),
});
