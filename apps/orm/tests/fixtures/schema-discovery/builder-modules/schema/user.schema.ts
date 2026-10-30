import { f, model, object } from '../../../../../src/parser/builder';

export const Address = object('Address', { city: f.string() });

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
  address: f.object('Address'),
});

export const notADeclaration = { name: 'User' };
export const count = 3;
