/** Every TypeScript example on docs/schema/typescript/enums-literals.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { e, enum as enumeration, f, literal, model, object, tuple, variant } from '../../../../src/schema';

export const Role = enumeration('Role', ['ADMIN', 'USER', 'MODERATOR']);

export const Member = model('Member', {
  id: f.record().id(),
  role: f.enum(Role),
  backup: f.enum(Role).optional(),
  muted: f.enum(Role).optional().nullable(),
  roles: f.enum(Role).array(),
  fallback: f.enum(Role).default('USER'),
});

// @ts-expect-error enum values are strings
export const Levels = enumeration('Levels', [1, 2]);

export const Status = literal('Status', [
  variant.string('active'),
  variant.string('inactive'),
  variant.string('pending'),
]);

export const Priority = literal('Priority', [variant.int(1), variant.int(2), variant.int(3)]);

export const Ratio = literal('Ratio', [variant.float(0.5), variant.float(1.5), variant.float(2.5)]);

export const Mixed = literal('Mixed', [
  variant.string('low'),
  variant.string('high'),
  variant.int(1),
  variant.int(2),
  variant.bool(true),
]);

export const Ticket = model('Ticket', {
  id: f.record().id(),
  status: f.literal(Status),
  priority: f.literal(Priority),
  ratio: f.literal(Ratio),
  tag: f.literal(Mixed),
  history: f.literal(Status).array(),
  next: f.literal(Status).optional(),
  state: f.literal(Status).default('active'),
});

export const Payload = literal('Payload', [variant.broadType('String'), variant.broadType('Int')]);

export const Stamp = literal('Stamp', [
  variant.broadType('Float'),
  variant.broadType('Bool'),
  variant.broadType('Date'),
]);

export const Coord = tuple('Coord', { x: e.float(), y: e.float() });

export const Point = object('Point', {
  label: f.string(),
  weight: f.int(),
});

export const Access = enumeration('Access', ['ADMIN', 'USER']);

export const Shape = literal('Shape', [variant.string('none'), variant.tuple(Coord), variant.object(Point)]);

export const Visibility = literal('Visibility', [variant.literal(Access), variant.string('custom')]);

export const Level = literal('Level', [variant.string('low'), variant.string('high')]);

export const Mode = enumeration('Mode', ['ON', 'OFF']);

export const Setting = object('Setting', {
  level: f.literal(Level),
  mode: f.enum(Mode),
});

export const Switch = tuple('Switch', [e.literal(Level), e.literal(Mode)]);
