import { e, enum as enumeration, f, literal, model, object, tuple, variant } from '../../../../src/schema';

export const NmGrade = enumeration('NmGrade', ['LOW', 'MID', 'HIGH']);

export const NmCode = literal('NmCode', [variant.string('a1'), variant.string('b2'), variant.int(7)]);

export const NmLeaf = object('NmLeaf', {
  grade: f.enum(NmGrade),
  code: f.literal(NmCode).optional(),
});

export const NmMid = object('NmMid', {
  label: f.string(),
  leaf: f.object(NmLeaf),
});

export const NmTop = object('NmTop', {
  title: f.string(),
  mid: f.object(NmMid),
});

export const NmWithLeaf = tuple('NmWithLeaf', [e.string().named('label'), e.object(NmLeaf)]);

export const NmNamedLeaf = tuple('NmNamedLeaf', {
  tag: e.string(),
  leaf: e.object(NmLeaf),
});

export const NmOuter = tuple('NmOuter', [e.tuple(NmWithLeaf), e.int()]);

export const NmHoldsTuple = object('NmHoldsTuple', {
  entry: f.tuple(NmWithLeaf),
});

export const NmHoldsHolder = object('NmHoldsHolder', {
  holder: f.object(NmHoldsTuple),
});

export const NmObjectDoc = model('NmObjectDoc', {
  id: f.record().id(),
  name: f.string(),
  leaf: f.object(NmLeaf).optional(),
  mid: f.object(NmMid).optional(),
  top: f.object(NmTop).optional(),
  leaves: f.object(NmLeaf).array(),
  tops: f.object(NmTop).array(),
});

export const NmTupleDoc = model('NmTupleDoc', {
  id: f.record().id(),
  name: f.string(),
  withLeaf: f.tuple(NmWithLeaf).optional(),
  named: f.tuple(NmNamedLeaf).optional(),
  outer: f.tuple(NmOuter).optional(),
  holds: f.object(NmHoldsTuple).optional(),
  deepHolds: f.object(NmHoldsHolder).optional(),
  withLeaves: f.tuple(NmWithLeaf).array(),
  nameds: f.tuple(NmNamedLeaf).array(),
});
