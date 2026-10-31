import { e, f, model, object, tuple } from '../../../../src/schema';

export const DurationBasic = model('DurationBasic', {
  id: f.record().id(),
  name: f.string(),
  ttl: f.duration(),
  expiry: f.duration().optional(),
  cooldown: f.duration().nullable(),
  intervals: f.duration().array(),
});

export const DurationDecorated = model('DurationDecorated', {
  id: f.record().id(),
  name: f.string(),
  defaultTtl: f.duration().default('1h'),
  alwaysTtl: f.duration().defaultAlways('30m'),
});

export const DurationInfo = object('DurationInfo', {
  expires: f.duration(),
  grace: f.duration().optional(),
});

export const DurationPair = tuple('DurationPair', [e.duration(), e.duration().nullable()]);

export const DurationWithObject = model('DurationWithObject', {
  id: f.record().id(),
  name: f.string(),
  timing: f.object(DurationInfo),
});

export const DurationWithTuple = model('DurationWithTuple', {
  id: f.record().id(),
  name: f.string(),
  pair: f.tuple(DurationPair),
});
