import { enum as enumeration, f, model, object } from 'cerial/schema';

const LIMIT = 5;
const ROLES = ['ADMIN', 'USER'] as const;

export const Role = enumeration('Role', ROLES);

export const Address = object('Address', { city: f.string().default(`none`) });

export const Plain = model('Plain', {
  id: f.record().id(),
  offset: f.int().default(-1),
  limit: f.int().default(LIMIT),
  note: f.string().optional().nullable().default(null),
  address: f.object(Address).optional(),
  later: f.object(() => Address).optional(),
});
