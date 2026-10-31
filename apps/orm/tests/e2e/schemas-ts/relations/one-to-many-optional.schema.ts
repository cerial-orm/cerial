import { f, model } from '../../../../src/schema';

export const Publisher = model('Publisher', {
  id: f.record().id(),
  name: f.string(),
  books: f.reverse('Book').array(),
});

export const Book = model('Book', {
  id: f.record().id(),
  title: f.string(),
  isbn: f.string().unique(),
  publisherId: f.record().optional().nullable(),
  publisher: f.relation('Publisher').optional().field('publisherId'),
});
