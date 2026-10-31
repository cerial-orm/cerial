import { f, model, object } from '../../../../src/schema';

export const TimestampInfo = object('TimestampInfo', {
  label: f.string(),
  createdAt: f.date().createdAt(),
  updatedAt: f.date().updatedAt(),
});

export const TimestampTest = model('TimestampTest', {
  id: f.record().id(),
  name: f.string(),
  createdAt: f.date().createdAt(),
  updatedAt: f.date().updatedAt(),
  accessedAt: f.date().now(),
  meta: f.object(TimestampInfo).optional(),
});
