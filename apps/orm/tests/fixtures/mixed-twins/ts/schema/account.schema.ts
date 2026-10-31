import { e, enum as enumeration, f, literal, model, object, tuple, variant } from 'cerial/schema';
import { Address, Level, Point, Purchase, Role } from './purchase.schema';

export const Account = model('Account', {
  id: f.record('int').id(),
  name: f.string(),
  address: f.object(() => Address),
  spot: f.tuple(() => Point),
  tier: f.literal(() => Level),
  role: f.enum(() => Role),
  purchases: f.reverse(() => Purchase).array(),
});

export const Meta = object('Meta', { note: f.string(), weight: f.int() });
export const Pair = tuple('Pair', [e.int(), e.int()]);
export const Priority = literal('Priority', [variant.string('low'), variant.string('high')]);
export const Status = enumeration('Status', ['OPEN', 'CLOSED']);

export const Ticket = model('Ticket', {
  id: f.record('int').id(),
  title: f.string(),
  purchase: f.relation(() => Purchase).optional(),
});
