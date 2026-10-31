/** Every TypeScript example on docs/schema/typescript/relations.mdx, in one file. Generated from the page by hand; keep the two in step. */
import { f, model } from '../../../../src/schema';

export const User = model('User', {
  id: f.record().id(),
  name: f.string(),
  posts: f.reverse(() => Post).array(),
});

export const Post = model('Post', {
  id: f.record().id(),
  title: f.string(),
  author: f.relation(User),
});

export const Account = model('Account', {
  id: f.record().id(),
  // @ts-expect-error the reverse side has no foreign key to name
  logins: f.reverse(() => Login).field('accountId'),
});

export const Login = model('Login', {
  id: f.record().id(),
  account: f.relation(Account),
});

export const Person = model('Person', {
  id: f.record().id(),
  profile: f.reverse(() => Profile).optional(),
});

export const Profile = model('Profile', {
  id: f.record().id(),
  bio: f.string().optional(),
  person: f.relation(Person).optional(),
});

export const Student = model('Student', {
  id: f.record().id(),
  name: f.string(),
  courses: f.relation(() => Course).array(),
});

export const Course = model('Course', {
  id: f.record().id(),
  title: f.string(),
  students: f.relation(Student).array(),
});

export const Employee = model('Employee', {
  id: f.record().id(),
  name: f.string(),
  approvedBy: f.record().optional(),
  approver: f
    .relation(() => Employee)
    .optional()
    .field('approvedBy'),
});

export const Staff = model('Staff', {
  id: f.record().id(),
});

export const Article = model('Article', {
  id: f.record().id(),
  writer: f.relation(Staff).field('writerId'),
});

export const Folder = model('Folder', {
  id: f.record().id(),
  name: f.string(),
  parent: f
    .relation(() => Folder)
    .optional()
    .key('tree'),
  children: f
    .reverse(() => Folder)
    .array()
    .key('tree'),
});

export const Team = model('Team', {
  id: f.record().id(),
  members: f.reverse(() => Member).array(),
});

export const Member = model('Member', {
  id: f.record().id(),
  team: f.relation(Team).optional().onDelete('SetNull'),
});

export const Board = model('Board', {
  id: f.record().id(),
});

export const CascadePin = model('CascadePin', {
  id: f.record().id(),
  board: f.relation(Board).optional().onDelete('Cascade'),
});

export const NullPin = model('NullPin', {
  id: f.record().id(),
  board: f.relation(Board).optional().onDelete('SetNull'),
});

export const NonePin = model('NonePin', {
  id: f.record().id(),
  board: f.relation(Board).optional().onDelete('SetNone'),
});

export const RestrictPin = model('RestrictPin', {
  id: f.record().id(),
  board: f.relation(Board).optional().onDelete('Restrict'),
});

export const NoActionPin = model('NoActionPin', {
  id: f.record().id(),
  board: f.relation(Board).optional().onDelete('NoAction'),
});

export const Org = model('Org', {
  id: f.record().id(),
});

export const Seat = model('Seat', {
  id: f.record().id(),
  // @ts-expect-error a required relation cascades and takes no rule
  org: f.relation(Org).onDelete('Cascade'),
});

export const Invoice = model('Invoice', {
  id: f.record().id(),
  customer: f.relation('Customer'),
});
