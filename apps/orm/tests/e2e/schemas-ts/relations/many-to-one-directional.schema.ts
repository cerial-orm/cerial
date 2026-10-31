import { f, model } from '../../../../src/schema';

export const Blogger = model('Blogger', {
  id: f.record().id(),
  name: f.string(),
  labelIds: f.record().array(),
  labels: f.relation('Label').array().field('labelIds'),
});

export const Label = model('Label', {
  id: f.record().id(),
  name: f.string().unique(),
});
