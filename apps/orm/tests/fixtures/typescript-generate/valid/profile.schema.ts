import { f, literalField, model } from '../../../../src/schema';

export const Profile = model('Profile', {
  id: f.record().id(),
  role: literalField('Role'),
  age: f.int().optional(),
});
