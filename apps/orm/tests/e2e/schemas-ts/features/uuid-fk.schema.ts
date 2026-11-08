import { f, model } from '../../../../src/schema';

export const UuidFkTarget = model('UuidFkTarget', {
  id: f.record('uuid').id(),
  label: f.string(),
  owners: f.reverse('UuidFkOwner').array(),
});

export const UuidFkOwner = model('UuidFkOwner', {
  id: f.record().id(),
  targetId: f.record(),
  target: f.relation('UuidFkTarget').field('targetId'),
  note: f.string(),
});

export const UuidFkOptional = model('UuidFkOptional', {
  id: f.record().id(),
  targetId: f.record().nullable().optional(),
  target: f.relation('UuidFkTarget').optional().field('targetId'),
  note: f.string(),
});

export const UuidFkMulti = model('UuidFkMulti', {
  id: f.record().id(),
  targetIds: f.record().array(),
  targets: f.relation('UuidFkTarget').array().field('targetIds'),
  note: f.string(),
});
