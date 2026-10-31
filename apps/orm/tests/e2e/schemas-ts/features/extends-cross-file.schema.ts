import { f, model } from '../../../../src/schema';
import { ExtBaseAdmin, ExtBaseEntity, ExtBaseUserFull } from './extends-model.schema';

export const ExtCrossUser = model(
  'ExtCrossUser',
  {
    email: f.email().unique(),
    username: f.string().unique(),
    displayName: f.string(),
    bio: f.string().optional(),
  },
  { extends: ExtBaseEntity },
);

export const ExtCrossAdmin = model(
  'ExtCrossAdmin',
  {
    department: f.string(),
    budget: f.float().optional(),
    teamSize: f.int().optional(),
  },
  { extends: ExtBaseAdmin },
);

export const ExtCrossModerator = model(
  'ExtCrossModerator',
  {
    email: f.email().unique(),
    name: f.string(),
    warningCount: f.int().default(0),
    lastWarning: f.date().optional(),
  },
  { extends: ExtBaseEntity.pick('id', 'createdAt') },
);

export const ExtCrossPremium = model(
  'ExtCrossPremium',
  {
    loyaltyPoints: f.int().default(0),
    referralCode: f.string().optional(),
  },
  { extends: ExtBaseUserFull },
);

export const ExtCrossProfile = model(
  'ExtCrossProfile',
  {
    userId: f.record(),
    bio: f.string().optional(),
    avatar: f.string().optional(),
    tags: f.string().array(),
    metadata: f.int().optional(),
    owner: f.record(),
    followers: f.record().array(),
    following: f.record().array(),
  },
  { extends: ExtBaseEntity },
);

export const ExtCrossPrivate = model(
  'ExtCrossPrivate',
  {
    email: f.email().unique(),
    name: f.string(),
    publicBio: f.string().default('No bio'),
  },
  { extends: ExtBaseEntity },
);
