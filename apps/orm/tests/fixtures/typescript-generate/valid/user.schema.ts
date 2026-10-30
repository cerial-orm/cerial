import { enum as enumeration, f, model, object } from '../../../../src/schema';

export const Role = enumeration('Role', ['ADMIN', 'MEMBER']);

export const Address = object('Address', { city: f.string(), zip: f.string().nullable() });

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
  address: f.object('Address').optional(),
});
