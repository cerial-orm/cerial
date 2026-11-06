import { f, model } from '../../../../src/schema';

export const EmployeeNoAction = model('EmployeeNoAction', {
  id: f.record().id(),
  name: f.string(),
  managerId: f.record().optional().nullable(),
  manager: f.relation('EmployeeNoAction').optional().field('managerId').key('noActionManages').onDelete('NoAction'),
  directReports: f.reverse('EmployeeNoAction').array().key('noActionManages'),
});
