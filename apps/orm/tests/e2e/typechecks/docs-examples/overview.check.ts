/** Every TypeScript example on docs/schema/typescript/overview.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { f, model } from '../../../../src/schema';
import type { Handle } from '../../../../src/schema';

export const User = model('User', {
  id: f.record().id(),
  email: f.email().unique(),
  name: f.string(),
  age: f.int().optional(),
  posts: f.reverse(() => Post).array(),
});

export const Post = model('Post', {
  id: f.record().id(),
  title: f.string(),
  author: f.relation(() => User),
});

export const Folder = model('Folder', {
  id: f.record().id(),
  name: f.string(),
  parentId: f.record().optional(),
  parent: f
    .relation(() => Folder)
    .optional()
    .field('parentId'),
  children: f.reverse(() => Folder).array(),
});

export const Category: Handle<'Category', string> = model('Category', {
  id: f.record().id(),
  name: f.string(),
  parentId: f.record().optional(),
  parent: f
    .relation((): Handle<'Category', string> => Category)
    .optional()
    .field('parentId'),
});
