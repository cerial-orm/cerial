import { f, model } from '../../../../src/schema';

export const Person = model('Person', {
  id: f.record().id(),
  name: f.string(),
  mentorId: f.record().optional().nullable(),
  mentor: f.relation('Person').optional().field('mentorId'),
});

export const Assistant = model('Assistant', {
  id: f.record().id(),
  name: f.string(),
  assistsId: f.record().optional().nullable(),
  assists: f.relation('Assistant').optional().field('assistsId').key('assist'),
  assistedBy: f.reverse('Assistant').optional().key('assist'),
});

export const EmployeeSingleSided = model('EmployeeSingleSided', {
  id: f.record().id(),
  name: f.string(),
  managerId: f.record().optional().nullable(),
  manager: f.relation('EmployeeSingleSided').optional().field('managerId'),
});

export const EmployeeWithReports = model('EmployeeWithReports', {
  id: f.record().id(),
  name: f.string(),
  managerId: f.record().optional().nullable(),
  manager: f.relation('EmployeeWithReports').optional().field('managerId').key('manages'),
  directReports: f.reverse('EmployeeWithReports').array().key('manages'),
});

export const Friend = model('Friend', {
  id: f.record().id(),
  name: f.string(),
  friendIds: f.record().array(),
  friends: f.relation('Friend').array().field('friendIds'),
});

export const SocialUser = model('SocialUser', {
  id: f.record().id(),
  name: f.string(),
  followingIds: f.record().array(),
  following: f.relation('SocialUser').array().field('followingIds'),
});

export const CategoryTree = model('CategoryTree', {
  id: f.record().id(),
  name: f.string(),
  parentId: f.record().optional().nullable(),
  parent: f.relation('CategoryTree').optional().field('parentId').key('hierarchy'),
  children: f.reverse('CategoryTree').array().key('hierarchy'),
});
