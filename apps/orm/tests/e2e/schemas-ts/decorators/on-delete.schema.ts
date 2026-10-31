import { f, model } from '../../../../src/schema';

export const OnDeleteParent = model(
  'OnDeleteParent',
  {
    id: f.record().id().private(),
    name: f.string(),
  },
  { abstract: true },
);

export const OnDeleteProfile = model(
  'OnDeleteProfile',
  {
    id: f.record().id().private(),
    bio: f.string().optional(),
    userId: f.record().optional().nullable(),
  },
  { abstract: true },
);

export const UserCascade = model(
  'UserCascade',
  {
    profile: f.reverse('ProfileCascade').optional(),
  },
  { extends: OnDeleteParent },
);

export const ProfileCascade = model(
  'ProfileCascade',
  {
    user: f.relation('UserCascade').optional().field('userId').onDelete('Cascade'),
  },
  { extends: OnDeleteProfile },
);

export const UserNoAction = model(
  'UserNoAction',
  {
    profile: f.reverse('ProfileNoAction').optional(),
  },
  { extends: OnDeleteParent },
);

export const ProfileNoAction = model(
  'ProfileNoAction',
  {
    user: f.relation('UserNoAction').optional().field('userId').onDelete('NoAction'),
  },
  { extends: OnDeleteProfile },
);

export const UserRestrict = model(
  'UserRestrict',
  {
    profile: f.reverse('ProfileRestrict').optional(),
  },
  { extends: OnDeleteParent },
);

export const ProfileRestrict = model(
  'ProfileRestrict',
  {
    user: f.relation('UserRestrict').optional().field('userId').onDelete('Restrict'),
  },
  { extends: OnDeleteProfile },
);

export const UserSetNull = model(
  'UserSetNull',
  {
    email: f.email().unique(),
    profile: f.reverse('ProfileSetNull').optional(),
  },
  { extends: OnDeleteParent },
);

export const ProfileSetNull = model(
  'ProfileSetNull',
  {
    user: f.relation('UserSetNull').optional().field('userId').onDelete('SetNull'),
  },
  { extends: OnDeleteProfile },
);

export const Team = model('Team', { members: f.reverse('Member').array() }, { extends: OnDeleteParent });

export const Member = model('Member', {
  id: f.record().id(),
  name: f.string(),
  teamId: f.record().optional().nullable(),
  team: f.relation('Team').optional().field('teamId').onDelete('Cascade'),
});

export const Department = model(
  'Department',
  { employees: f.reverse('Employee').array() },
  { extends: OnDeleteParent },
);

export const Employee = model('Employee', {
  id: f.record().id(),
  name: f.string(),
  departmentId: f.record().optional().nullable(),
  department: f.relation('Department').optional().field('departmentId').onDelete('Restrict'),
});

export const UserSetNone = model(
  'UserSetNone',
  { profile: f.reverse('ProfileSetNone').optional() },
  { extends: OnDeleteParent },
);

export const ProfileSetNone = model('ProfileSetNone', {
  id: f.record().id(),
  bio: f.string().optional(),
  userId: f.record().optional(),
  user: f.relation('UserSetNone').optional().field('userId').onDelete('SetNone'),
});

export const TeamNoAction = model(
  'TeamNoAction',
  { members: f.reverse('MemberNoAction').array() },
  { extends: OnDeleteParent },
);

export const MemberNoAction = model('MemberNoAction', {
  id: f.record().id(),
  name: f.string(),
  teamId: f.record().optional().nullable(),
  team: f.relation('TeamNoAction').optional().field('teamId').onDelete('NoAction'),
});

export const TeamSetNull = model(
  'TeamSetNull',
  { members: f.reverse('MemberSetNull').array() },
  { extends: OnDeleteParent },
);

export const MemberSetNull = model('MemberSetNull', {
  id: f.record().id(),
  name: f.string(),
  teamId: f.record().optional().nullable(),
  team: f.relation('TeamSetNull').optional().field('teamId').onDelete('SetNull'),
});

export const OdFolder = model('OdFolder', {
  id: f.record().id(),
  name: f.string(),
  parentId: f.record().optional().nullable(),
  parent: f.relation('OdFolder').optional().field('parentId').onDelete('SetNull').key('tree'),
  children: f.reverse('OdFolder').array().key('tree'),
});

export const OdGrandparent = model(
  'OdGrandparent',
  { parents: f.reverse('OdParent').array() },
  { extends: OnDeleteParent },
);

export const OdParent = model('OdParent', {
  id: f.record().id(),
  name: f.string(),
  grandparentId: f.record().optional().nullable(),
  grandparent: f.relation('OdGrandparent').optional().field('grandparentId').onDelete('Cascade'),
  children: f.reverse('OdChild').array(),
});

export const OdChild = model('OdChild', {
  id: f.record().id(),
  name: f.string(),
  parentId: f.record().optional().nullable(),
  parent: f.relation('OdParent').optional().field('parentId').onDelete('Cascade'),
});
