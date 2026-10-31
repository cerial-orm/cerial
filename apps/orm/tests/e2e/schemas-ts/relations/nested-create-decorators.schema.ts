import { f, model } from '../../../../src/schema';

export const NcHolder = model('NcHolder', {
  id: f.record().id(),
  name: f.string(),
  docId: f.record().optional(),
  doc: f.relation('NcDoc').optional().field('docId').key('single'),
  reverseDocs: f.reverse('NcDoc').array().key('rev'),
});

export const NcGroup = model('NcGroup', {
  id: f.record().id(),
  name: f.string(),
  docIds: f.record().array(),
  docs: f.relation('NcDoc').array().field('docIds'),
});

export const NcDoc = model('NcDoc', {
  id: f.record().id(),
  label: f.string(),
  note: f.string().default('fresh'),
  always: f.string().defaultAlways('reset'),
  createdAt: f.date().createdAt(),
  updatedAt: f.date().updatedAt(),
  seenAt: f.date().now(),
  token: f.uuid().uuid(),
  tokenV7: f.uuid().uuid7(),
  amount: f.decimal(),
  span: f.duration(),
  stamp: f.date(),
  tags: f.string().array(),
  groupIds: f.record().array(),
  groups: f.relation('NcGroup').array().field('groupIds'),
  singleHolders: f.reverse('NcHolder').array().key('single'),
  revHolderId: f.record().optional(),
  revHolder: f.relation('NcHolder').optional().field('revHolderId').key('rev'),
});
