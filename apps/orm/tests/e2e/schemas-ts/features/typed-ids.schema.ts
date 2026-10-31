import { e, f, model, object, tuple } from '../../../../src/schema';

export const IdCoord = tuple('IdCoord', [e.float(), e.float()]);

export const IdMetricKey = object('IdMetricKey', {
  service: f.string(),
  timestamp: f.int(),
});

export const IntIdModel = model('IntIdModel', {
  id: f.record('int').id(),
  name: f.string(),
});

export const NumberIdModel = model('NumberIdModel', {
  id: f.record('number').id(),
  label: f.string(),
});

export const StringIdModel = model('StringIdModel', {
  id: f.record('string').id(),
  payload: f.string(),
});

export const UuidIdModel = model('UuidIdModel', {
  id: f.record('uuid').id(),
  data: f.string(),
});

export const TupleIdModel = model('TupleIdModel', {
  id: f.record(IdCoord).id(),
  city: f.string(),
});

export const ObjectIdModel = model('ObjectIdModel', {
  id: f.record(IdMetricKey).id(),
  payload: f.float(),
});

export const UnionIdModel = model('UnionIdModel', {
  id: f.record('string', 'int').id(),
  label: f.string(),
});

export const IntUnionIdModel = model('IntUnionIdModel', {
  id: f.record('int', 'uuid').id(),
  label: f.string(),
});

export const FkTargetIntId = model('FkTargetIntId', {
  id: f.record('int').id(),
  label: f.string(),
  children: f.reverse('FkChildModel').array(),
});

export const FkChildModel = model('FkChildModel', {
  id: f.record().id(),
  parentId: f.record(),
  parent: f.relation('FkTargetIntId').field('parentId'),
  note: f.string(),
});

export const StandaloneRefModel = model('StandaloneRefModel', {
  id: f.record().id(),
  externalRef: f.record('int'),
  externalRefs: f.record('int').array(),
  label: f.string(),
});
