import { f, model } from '../../../../src/schema';

export const RoOwner = model('RoOwner', {
  id: f.record().id(),
  label: f.string(),
  dt: f.date().optional(),
  du: f.duration().optional(),
  uu: f.uuid().optional(),
  de: f.decimal().optional(),
  kits: f.reverse('RoKit').array(),
});

export const RoKit = model('RoKit', {
  id: f.record().id(),
  name: f.string(),
  ownerId: f.record().optional(),
  owner: f.relation('RoOwner').optional().field('ownerId'),
});

export const RoTag = model('RoTag', {
  id: f.record().id(),
  label: f.string(),
  dt: f.date().optional(),
  du: f.duration().optional(),
  uu: f.uuid().optional(),
  de: f.decimal().optional(),
  itemIds: f.record().array(),
  items: f.relation('RoItem').array().field('itemIds'),
});

export const RoItem = model('RoItem', {
  id: f.record().id(),
  name: f.string(),
  tagIds: f.record().array(),
  tags: f.relation('RoTag').array().field('tagIds'),
});
