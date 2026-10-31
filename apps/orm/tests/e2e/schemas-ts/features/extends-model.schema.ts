import { f, model } from '../../../../src/schema';

export const ExtBaseEntity = model(
  'ExtBaseEntity',
  {
    id: f.record().id().private(),
    createdAt: f.date().createdAt().private(),
    updatedAt: f.date().updatedAt(),
  },
  { abstract: true },
);

export const ExtBaseUser = model(
  'ExtBaseUser',
  {
    email: f.email().unique(),
    name: f.string(),
    isActive: f.bool().default(true),
  },
  { abstract: true, extends: ExtBaseEntity },
);

export const ExtUser = model(
  'ExtUser',
  {
    age: f.int().optional(),
    role: f.string().default('user'),
  },
  { extends: ExtBaseUser },
);

export const ExtAdmin = model(
  'ExtAdmin',
  {
    level: f.int().default(1),
    permissions: f.string().array(),
  },
  { extends: ExtBaseUser.omit('isActive') },
);

export const ExtModerator = model(
  'ExtModerator',
  {
    email: f.email().unique(),
    name: f.string(),
    bannedUntil: f.date().optional(),
    notes: f.string().optional(),
  },
  { extends: ExtBaseEntity.pick('id', 'createdAt') },
);

export const ExtSuperAdmin = model(
  'ExtSuperAdmin',
  {
    role: f.string().default('superadmin'),
    level: f.int().default(99),
    canDeleteUsers: f.bool().default(true),
  },
  { extends: ExtBaseUser },
);

export const ExtBaseUserFull = model(
  'ExtBaseUserFull',
  {
    age: f.int().optional(),
    role: f.string().default('user'),
  },
  { abstract: true, extends: ExtBaseUser },
);

export const ExtPremiumUser = model(
  'ExtPremiumUser',
  {
    subscriptionTier: f.string().default('basic'),
    subscriptionEnd: f.date().optional(),
  },
  { extends: ExtBaseUserFull },
);

export const ExtBaseAdmin = model(
  'ExtBaseAdmin',
  {
    level: f.int().default(1),
    permissions: f.string().array(),
  },
  { abstract: true, extends: ExtBaseUser.omit('isActive') },
);

export const ExtSystemAdmin = model(
  'ExtSystemAdmin',
  {
    systemAccess: f.bool().default(false),
    auditLog: f.string().array(),
  },
  { extends: ExtBaseAdmin },
);

export const ExtPrivateUser = model(
  'ExtPrivateUser',
  {
    email: f.email().unique().private(),
    name: f.string().private(),
    publicBio: f.string().optional(),
  },
  { extends: ExtBaseEntity },
);

export const ExtProfile = model(
  'ExtProfile',
  {
    userId: f.record(),
    bio: f.string().optional(),
    avatar: f.string().optional(),
    tags: f.string().array(),
    metadata: f.int().optional(),
  },
  { extends: ExtBaseEntity },
);

export const ExtEmptyChild = model('ExtEmptyChild', {}, { extends: ExtBaseEntity });
