import { e, f, model, object, tuple } from '../../../../src/schema';

export const WoRefBox = object('WoRefBox', {
  ref: f.record().optional(),
  refs: f.record().array(),
});

export const WoList = object('WoList', {
  n: f.int().optional(),
  tags: f.int().array(),
});

export const WoNode = object('WoNode', {
  n: f.int().optional(),
  when: f.date().optional(),
  child: f.object('WoNode').optional(),
});

export const WoDuo = tuple('WoDuo', [e.int(), e.string()]);

export const WoWithList = tuple('WoWithList', [e.int(), e.object(WoList)]);

export const WoHolder = model('WoHolder', {
  id: f.record().id(),
  name: f.string(),
  box: f.object(WoRefBox).optional(),
  lists: f.object(WoList).array(),
  duo: f.tuple(WoDuo).optional(),
  duos: f.tuple(WoDuo).array(),
  withList: f.tuple(WoWithList).optional(),
  node: f.object(WoNode).optional(),
});

export const WoPost = model('WoPost', {
  id: f.record().id(),
  name: f.string(),
  tagIds: f.record().array(),
  tags: f.relation('WoTag').array().field('tagIds'),
});

export const WoTag = model('WoTag', {
  id: f.record().id(),
  name: f.string(),
  posts: f.reverse('WoPost').array(),
});
