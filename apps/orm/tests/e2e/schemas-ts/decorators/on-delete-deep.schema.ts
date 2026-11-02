import { f, model } from '../../../../src/schema';

export const DdRoot = model('DdRoot', {
  id: f.record().id(),
  name: f.string(),
  code: f.string().unique(),
  ones: f.reverse('DdOne').array(),
});

export const DdOne = model('DdOne', {
  id: f.record().id(),
  name: f.string(),
  rootId: f.record().optional().nullable(),
  root: f.relation('DdRoot').optional().field('rootId').onDelete('Cascade'),
  twos: f.reverse('DdTwo').array(),
  atTwoCascades: f.reverse('DdAtTwoCascade').array(),
  atTwoRestricts: f.reverse('DdAtTwoRestrict').array(),
  atTwoSetNulls: f.reverse('DdAtTwoSetNull').array(),
  atTwoSetNones: f.reverse('DdAtTwoSetNone').array(),
  atTwoNoActions: f.reverse('DdAtTwoNoAction').array(),
});

export const DdTwo = model('DdTwo', {
  id: f.record().id(),
  name: f.string(),
  oneId: f.record().optional().nullable(),
  one: f.relation('DdOne').optional().field('oneId').onDelete('Cascade'),
  atThreeCascades: f.reverse('DdAtThreeCascade').array(),
  atThreeRestricts: f.reverse('DdAtThreeRestrict').array(),
  atThreeSetNulls: f.reverse('DdAtThreeSetNull').array(),
  atThreeSetNones: f.reverse('DdAtThreeSetNone').array(),
  atThreeNoActions: f.reverse('DdAtThreeNoAction').array(),
});

export const DdAtTwoCascade = model('DdAtTwoCascade', {
  id: f.record().id(),
  name: f.string(),
  oneId: f.record().optional().nullable(),
  one: f.relation('DdOne').optional().field('oneId').onDelete('Cascade'),
});

export const DdAtTwoRestrict = model('DdAtTwoRestrict', {
  id: f.record().id(),
  name: f.string(),
  oneId: f.record().optional().nullable(),
  one: f.relation('DdOne').optional().field('oneId').onDelete('Restrict'),
});

export const DdAtTwoSetNull = model('DdAtTwoSetNull', {
  id: f.record().id(),
  name: f.string(),
  oneId: f.record().optional().nullable(),
  one: f.relation('DdOne').optional().field('oneId').onDelete('SetNull'),
});

export const DdAtTwoSetNone = model('DdAtTwoSetNone', {
  id: f.record().id(),
  name: f.string(),
  oneId: f.record().optional(),
  one: f.relation('DdOne').optional().field('oneId').onDelete('SetNone'),
});

export const DdAtTwoNoAction = model('DdAtTwoNoAction', {
  id: f.record().id(),
  name: f.string(),
  oneId: f.record().optional().nullable(),
  one: f.relation('DdOne').optional().field('oneId').onDelete('NoAction'),
});

export const DdAtThreeCascade = model('DdAtThreeCascade', {
  id: f.record().id(),
  name: f.string(),
  twoId: f.record().optional().nullable(),
  two: f.relation('DdTwo').optional().field('twoId').onDelete('Cascade'),
});

export const DdAtThreeRestrict = model('DdAtThreeRestrict', {
  id: f.record().id(),
  name: f.string(),
  twoId: f.record().optional().nullable(),
  two: f.relation('DdTwo').optional().field('twoId').onDelete('Restrict'),
});

export const DdAtThreeSetNull = model('DdAtThreeSetNull', {
  id: f.record().id(),
  name: f.string(),
  twoId: f.record().optional().nullable(),
  two: f.relation('DdTwo').optional().field('twoId').onDelete('SetNull'),
});

export const DdAtThreeSetNone = model('DdAtThreeSetNone', {
  id: f.record().id(),
  name: f.string(),
  twoId: f.record().optional(),
  two: f.relation('DdTwo').optional().field('twoId').onDelete('SetNone'),
});

export const DdAtThreeNoAction = model('DdAtThreeNoAction', {
  id: f.record().id(),
  name: f.string(),
  twoId: f.record().optional().nullable(),
  two: f.relation('DdTwo').optional().field('twoId').onDelete('NoAction'),
});

export const DdTree = model('DdTree', {
  id: f.record().id(),
  name: f.string(),
  parentId: f.record().optional().nullable(),
  parent: f.relation('DdTree').optional().field('parentId').onDelete('Cascade').key('tree'),
  children: f.reverse('DdTree').array().key('tree'),
});

export const DdPing = model('DdPing', {
  id: f.record().id(),
  name: f.string(),
  pongId: f.record().optional().nullable(),
  pong: f.relation('DdPong').optional().field('pongId').onDelete('Cascade').key('pingToPong'),
  pongs: f.reverse('DdPong').array().key('pongToPing'),
});

export const DdPong = model('DdPong', {
  id: f.record().id(),
  name: f.string(),
  pingId: f.record().optional().nullable(),
  ping: f.relation('DdPing').optional().field('pingId').onDelete('Cascade').key('pongToPing'),
  pings: f.reverse('DdPing').array().key('pingToPong'),
});
