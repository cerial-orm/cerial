import { f, model } from '../../../../../../src/schema';
import { Slug } from '../shared/slug';
import { User } from '../users/user';

export const Post = model('Post', {
  id: f.record().id(),
  title: f.string(),
  slug: Slug,
  author: f.relation(() => User).optional(),
});
