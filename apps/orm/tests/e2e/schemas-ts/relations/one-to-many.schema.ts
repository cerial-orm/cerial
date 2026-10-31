import { f, model } from '../../../../src/schema';

export const Author = model('Author', {
  id: f.record().id(),
  name: f.string(),
  email: f.email().unique(),
  posts: f.reverse('PostRequired').array(),
});

export const PostRequired = model('PostRequired', {
  id: f.record().id(),
  title: f.string(),
  body: f.string().optional().nullable(),
  authorId: f.record(),
  author: f.relation('Author').field('authorId'),
  createdAt: f.date().createdAt(),
});

export const Article = model('Article', {
  id: f.record().id(),
  title: f.string(),
});

export const Comment = model('Comment', {
  id: f.record().id(),
  text: f.string(),
  articleId: f.record().optional().nullable(),
  article: f.relation('Article').optional().field('articleId'),
});
