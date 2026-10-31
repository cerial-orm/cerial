import { f, model } from '../../../../src/schema';

export const BasicsUser = model('BasicsUser', {
  id: f.record().id(),
  email: f.email().unique(),
  name: f.string(),
  age: f.int().optional().nullable(),
  isActive: f.bool(),
  createdAt: f.date().createdAt(),
  nicknames: f.string().array(),
  scores: f.int().array(),
  loginDates: f.date().array(),
  profileId: f.record().optional().nullable(),
  profile: f.relation('BasicsProfile').optional().field('profileId'),
  tagIds: f.record().array(),
  tags: f.relation('BasicsTag').array().field('tagIds'),
  posts: f.reverse('BasicsPost').array(),
});

export const BasicsProfile = model('BasicsProfile', {
  id: f.record().id(),
  bio: f.string().optional().nullable(),
  avatarUrl: f.string().optional(),
  userId: f.record().optional().nullable(),
  user: f.relation('BasicsUser').optional().field('userId'),
});

export const BasicsPost = model('BasicsPost', {
  id: f.record().id(),
  title: f.string(),
  body: f.string().optional(),
  authorId: f.record(),
  author: f.relation('BasicsUser').field('authorId'),
});

export const BasicsTag = model('BasicsTag', {
  id: f.record().id(),
  name: f.string().unique(),
  userIds: f.record().array(),
  users: f.relation('BasicsUser').array().field('userIds'),
});
