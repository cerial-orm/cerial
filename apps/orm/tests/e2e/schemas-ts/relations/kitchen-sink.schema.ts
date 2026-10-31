import { f, model } from '../../../../src/schema';

export const KitchenSinkUser = model('KitchenSinkUser', {
  id: f.record().id(),
  email: f.email().unique(),
  name: f.string(),
  profile: f.reverse('KitchenSinkProfile').optional(),
  posts: f.reverse('KitchenSinkPost').array(),
  tagIds: f.record().array(),
  tags: f.relation('KitchenSinkTag').array().field('tagIds'),
  settingsId: f.record().optional().nullable(),
  settings: f.relation('KitchenSinkSettings').optional().field('settingsId'),
  badgeIds: f.record().array(),
  badges: f.relation('KitchenSinkBadge').array().field('badgeIds'),
});

export const KitchenSinkProfile = model('KitchenSinkProfile', {
  id: f.record().id(),
  bio: f.string().optional(),
  userId: f.record(),
  user: f.relation('KitchenSinkUser').field('userId'),
});

export const KitchenSinkPost = model('KitchenSinkPost', {
  id: f.record().id(),
  title: f.string(),
  authorId: f.record(),
  author: f.relation('KitchenSinkUser').field('authorId'),
});

export const KitchenSinkTag = model('KitchenSinkTag', {
  id: f.record().id(),
  name: f.string().unique(),
  userIds: f.record().array(),
  users: f.relation('KitchenSinkUser').array().field('userIds'),
});

export const KitchenSinkSettings = model('KitchenSinkSettings', {
  id: f.record().id(),
  theme: f.string(),
  userId: f.record().optional().nullable(),
  user: f.relation('KitchenSinkUser').optional().field('userId').onDelete('Cascade'),
});

export const KitchenSinkBadge = model('KitchenSinkBadge', {
  id: f.record().id(),
  name: f.string().unique(),
});
