import { f, model } from '../../../../src/schema';

export const Orphan = model('Orphan', {
  id: f.record().id(),
  owner: f.relation('Nobody'),
});
