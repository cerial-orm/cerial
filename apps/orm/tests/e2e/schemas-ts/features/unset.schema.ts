import { e, f, model, object, tuple } from '../../../../src/schema';
import type { Handle } from '../../../../src/schema';

export const UnsetAddress = object('UnsetAddress', {
  street: f.string(),
  city: f.string(),
  zip: f.string().optional(),
});

export const UnsetCoord = tuple('UnsetCoord', { lat: e.float(), lng: e.float() });

export const UnsetOptTuple = tuple('UnsetOptTuple', [e.string().named('label'), e.float().nullable()]);

export const UnsetInner = object('UnsetInner', {
  payload: f.string(),
  extra: f.string().optional(),
});

export const UnsetObjTuple = tuple('UnsetObjTuple', [e.string().named('tag'), e.object(UnsetInner)]);

export const UnsetDeepInner = object('UnsetDeepInner', {
  code: f.string(),
  note: f.string().optional(),
});

export const UnsetDeepMid = object('UnsetDeepMid', {
  label: f.string(),
  score: f.int().optional(),
  deep: f.object(UnsetDeepInner),
});

export const UnsetDeepOuter = object('UnsetDeepOuter', {
  title: f.string(),
  mid: f.object(UnsetDeepMid),
  desc: f.string().optional(),
});

export const UnsetDeepTuple = tuple('UnsetDeepTuple', [e.string().named('name'), e.object(UnsetDeepMid)]);

export const UnsetTreeNode: Handle = object('UnsetTreeNode', {
  payload: f.string(),
  extra: f.string().optional(),
  child: f.object(() => UnsetTreeNode).optional(),
});

export const UnsetRecursive = tuple('UnsetRecursive', [e.string().named('label'), e.self().nullable()]);

export const UnsetTest = model('UnsetTest', {
  id: f.record().id(),
  name: f.string(),
  bio: f.string().optional(),
  age: f.int().optional(),
  address: f.object(UnsetAddress),
  shipping: f.object(UnsetAddress).optional(),
  pos: f.tuple(UnsetCoord),
  backup: f.tuple(UnsetCoord).optional(),
  opt: f.tuple(UnsetOptTuple).optional(),
  tagged: f.tuple(UnsetObjTuple).optional(),
  nested: f.object(UnsetDeepOuter),
  optNested: f.object(UnsetDeepOuter).optional(),
  deepTuple: f.tuple(UnsetDeepTuple).optional(),
  tree: f.object(UnsetTreeNode).optional(),
  recursive: f.tuple(UnsetRecursive).optional(),
});
