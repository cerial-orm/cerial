import { e, enum as enumeration, f, literal, model, object, tuple, variant } from 'cerial/schema';
import { Account, Meta, Pair, Priority, Status } from './account.schema';

export const Address = object('Address', { street: f.string(), city: f.string() });
export const Point = tuple('Point', { x: e.float(), y: e.float() });
export const Level = literal('Level', [variant.string('basic'), variant.string('premium')]);
export const Role = enumeration('Role', ['ADMIN', 'USER']);

export const Purchase = model('Purchase', {
  id: f.record('int').id(),
  account: f.relation(() => Account),
  meta: f.object(() => Meta),
  pair: f.tuple(() => Pair),
  priority: f.literal(() => Priority),
  status: f.enum(() => Status),
});
