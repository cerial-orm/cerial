import { f, model, object } from '../../../../src/schema';

export const AnyMeta = object('AnyMeta', {
  data: f.any(),
  label: f.string(),
});

export const AnyBasic = model('AnyBasic', {
  id: f.record().id(),
  name: f.string(),
  data: f.any(),
  items: f.any().array(),
});

export const AnyWithObject = model('AnyWithObject', {
  id: f.record().id(),
  name: f.string(),
  meta: f.object(AnyMeta),
});

export const AnyDecorated = model('AnyDecorated', {
  id: f.record().id(),
  defData: f.any().default('hello'),
  alwaysData: f.any().defaultAlways(42),
  readonlyData: f.any().readonly(),
  indexedData: f.any().index(),
  sortedItems: f.any().array().sort(),
  distinctItems: f.any().array().distinct(),
});

export const AnyUnique = model('AnyUnique', {
  id: f.record().id(),
  uniqueData: f.any().unique(),
});
