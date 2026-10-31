import { f, model } from '../../../../src/schema';

export const Staff = model(
  'Staff',
  {
    id: f.record().id(),
    firstName: f.string(),
    lastName: f.string(),
    department: f.string(),
    email: f.email().unique(),
    age: f.int().optional(),
  },
  {
    unique: { name: 'staffFullName', fields: ['firstName', 'lastName'] },
    index: { name: 'staffDeptName', fields: ['department', 'firstName'] },
  },
);
