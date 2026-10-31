import { f, model } from '../../../../src/schema';

export const User = model('User', {
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
  profile: f.relation('Profile').optional().field('profileId'),
  tagIds: f.record().array(),
  tags: f.relation('Tag').array().field('tagIds'),
  posts: f.reverse('Post').array(),
});

export const Profile = model('Profile', {
  id: f.record().id(),
  bio: f.string().optional().nullable(),
  avatarUrl: f.string().optional(),
  userId: f.record().optional().nullable(),
  user: f.relation('User').optional().field('userId'),
});

export const Post = model('Post', {
  id: f.record().id(),
  title: f.string(),
  body: f.string().optional(),
  authorId: f.record(),
  author: f.relation('User').field('authorId'),
});

export const Tag = model('Tag', {
  id: f.record().id(),
  name: f.string().unique(),
  userIds: f.record().array(),
  users: f.relation('User').array().field('userIds'),
});
