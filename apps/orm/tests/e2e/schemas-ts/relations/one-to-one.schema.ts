import { f, model } from '../../../../src/schema';

export const UserOptional = model('UserOptional', {
  id: f.record().id(),
  email: f.email().unique(),
  name: f.string(),
  profile: f.reverse('ProfileOptional').optional(),
});

export const ProfileOptional = model('ProfileOptional', {
  id: f.record().id(),
  bio: f.string().optional(),
  userId: f.record().optional().nullable(),
  user: f.relation('UserOptional').optional().field('userId'),
});

export const UserRequired = model('UserRequired', {
  id: f.record().id(),
  email: f.email().unique(),
  name: f.string(),
  profile: f.reverse('ProfileRequired'),
});

export const ProfileRequired = model('ProfileRequired', {
  id: f.record().id(),
  bio: f.string().optional(),
  avatarUrl: f.string().optional(),
  userId: f.record(),
  user: f.relation('UserRequired').field('userId'),
});

export const UserSingleSided = model('UserSingleSided', {
  id: f.record().id(),
  name: f.string(),
});

export const ProfileSingleSided = model('ProfileSingleSided', {
  id: f.record().id(),
  bio: f.string().optional(),
  userId: f.record().optional().nullable(),
  user: f.relation('UserSingleSided').optional().field('userId'),
});
