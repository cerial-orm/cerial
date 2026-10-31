import { f, model, object } from '../../../../src/schema';

export const ReadonlyAddress = object('ReadonlyAddress', {
  street: f.string(),
  city: f.string().readonly(),
  zip: f.string().optional(),
});

export const ReadonlyMeta = object('ReadonlyMeta', {
  label: f.string().readonly(),
  payload: f.int(),
});

export const ReadonlyTest = model('ReadonlyTest', {
  id: f.record().id(),
  name: f.string(),
  code: f.string().readonly(),
  score: f.int().optional().readonly(),
  tags: f.string().array(),
  createdBy: f.string().readonly().default('system'),
  address: f.object(ReadonlyAddress),
  meta: f.object(ReadonlyMeta).optional(),
});

export const ReadonlyRecord = model('ReadonlyRecord', {
  id: f.record().id(),
  name: f.string(),
  authorId: f.record().optional().readonly(),
  author: f.relation('ReadonlyTest').optional().field('authorId'),
});
