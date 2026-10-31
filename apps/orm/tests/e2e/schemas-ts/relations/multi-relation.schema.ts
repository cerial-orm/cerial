import { f, model } from '../../../../src/schema';

export const Writer = model('Writer', {
  id: f.record().id(),
  name: f.string(),
  authoredDocs: f.reverse('Document').array().key('author'),
  reviewedDocs: f.reverse('Document').array().key('reviewer'),
});

export const Document = model('Document', {
  id: f.record().id(),
  title: f.string(),
  authorId: f.record(),
  author: f.relation('Writer').field('authorId').key('author'),
  reviewerId: f.record().optional().nullable(),
  reviewer: f.relation('Writer').optional().field('reviewerId').key('reviewer'),
});
