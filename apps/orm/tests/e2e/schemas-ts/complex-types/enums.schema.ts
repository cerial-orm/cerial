import { enum as enumeration, f, literal, model, object, variant } from '../../../../src/schema';

export const Role = enumeration('Role', ['ADMIN', 'USER', 'MODERATOR']);

export const Color = enumeration('Color', ['RED', 'GREEN', 'BLUE']);

export const Severity = enumeration('Severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export const EnumBasic = model('EnumBasic', {
  id: f.record().id(),
  name: f.string(),
  role: f.enum(Role),
  optRole: f.enum(Role).optional(),
  nullRole: f.enum(Role).optional().nullable(),
  roles: f.enum(Role).array(),
});

export const EnumDefaults = model('EnumDefaults', {
  id: f.record().id(),
  label: f.string(),
  role: f.enum(Role).default('ADMIN'),
  severity: f.enum(Severity).default('LOW'),
});

export const EnumMultiple = model('EnumMultiple', {
  id: f.record().id(),
  title: f.string(),
  role: f.enum(Role),
  color: f.enum(Color),
  severity: f.enum(Severity),
});

export const EnumAddress = object('EnumAddress', {
  city: f.string(),
  severity: f.enum(Severity),
});

export const EnumWithObject = model('EnumWithObject', {
  id: f.record().id(),
  name: f.string(),
  address: f.object(EnumAddress),
  optAddress: f.object(EnumAddress).optional(),
});

export const RoleOrCustom = literal('RoleOrCustom', [variant.literal(Role), variant.string('custom')]);

export const EnumLiteralRef = model('EnumLiteralRef', {
  id: f.record().id(),
  visibility: f.literal(RoleOrCustom),
});

export const EnumUnique = model('EnumUnique', {
  id: f.record().id(),
  role: f.enum(Role).unique(),
});
