import { f, model } from '../../../../src/schema';

export const Profile = model('Profile', {
  id: f.record().id(),
  role: f.enum('Role'),
  age: f.int().optional(),
});
