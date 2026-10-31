import { f, model } from '../../../../../../src/schema';
import { User } from './user.schema';

export const Post = model('Post', {
  id: f.record().id(),
  title: f.string(),
  author: f.relation(() => User).optional(),
});
