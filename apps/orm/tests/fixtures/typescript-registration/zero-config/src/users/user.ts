import { f, model } from '../../../../../../src/schema';

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
});
