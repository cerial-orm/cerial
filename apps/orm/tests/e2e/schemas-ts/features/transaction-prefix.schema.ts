import { f, model, object } from '../../../../src/schema';

export const TxpMeta = object('TxpMeta', {
  tag: f.string().optional(),
});

export const TxpAcct = model('TxpAcct', {
  id: f.record().id(),
  email: f.string().unique(),
  role: f.string(),
  credits: f.int(),
  meta: f.object(TxpMeta).flexible(),
  posts: f.reverse('TxpPost').array(),
});

export const TxpPost = model('TxpPost', {
  id: f.record().id(),
  title: f.string(),
  acctId: f.record(),
  acct: f.relation('TxpAcct').field('acctId'),
});
