import { f, model } from '../../../../src/schema';

export const PnOwner = model('PnOwner', {
  id: f.record().id(),
  title: f.string(),
  inc_title: f.string(),
  rev_create_posts: f.string().optional(),
  items: f.reverse('PnItem').array(),
  tagIds: f.record().array(),
  tags: f.relation('PnTag').array().field('tagIds').key('a'),
  tag0Id: f.record().optional(),
  tags0: f.relation('PnTag').optional().field('tag0Id').key('b'),
  posts_set: f.reverse('PnPost').array(),
});

export const PnItem = model('PnItem', {
  id: f.record().id(),
  title: f.string(),
  ownerId: f.record(),
  owner: f.relation('PnOwner').field('ownerId'),
});

export const PnTag = model('PnTag', {
  id: f.record().id(),
  label: f.string(),
  ownersA: f.reverse('PnOwner').array().key('a'),
  ownersB: f.reverse('PnOwner').array().key('b'),
});

export const PnPost = model('PnPost', {
  id: f.record().id(),
  body: f.string(),
  ownerId: f.record().optional(),
  owner: f.relation('PnOwner').optional().field('ownerId'),
});
