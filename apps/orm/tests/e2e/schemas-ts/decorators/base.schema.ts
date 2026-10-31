import { f, model } from '../../../../src/schema';

export const ArrayDecoratorTest = model('ArrayDecoratorTest', {
  id: f.record().id(),
  uniqueTags: f.string().array().distinct(),
  sortedScores: f.int().array().sort(),
  recentDates: f.date().array().sort('false'),
  uniqueSortedCategories: f.string().array().distinct().sort(),
  uniqueSortedPriorities: f.int().array().distinct().sort('false'),
  normalTags: f.string().array(),
  normalScores: f.int().array(),
});

export const ScalarArrays = model('ScalarArrays', {
  id: f.record().id(),
  emails: f.email().array(),
  flags: f.bool().array(),
});
