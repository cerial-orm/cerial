import { f, model } from '../../../../../../src/schema';

export const Tag = model('Tag', {
  id: f.record().id(),
  label: f.string(),
});
