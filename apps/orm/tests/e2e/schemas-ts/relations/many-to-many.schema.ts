import { f, model } from '../../../../src/schema';

export const Student = model('Student', {
  id: f.record().id(),
  name: f.string(),
  email: f.email().unique(),
  courseIds: f.record().array(),
  courses: f.relation('Course').array().field('courseIds'),
});

export const Course = model('Course', {
  id: f.record().id(),
  name: f.string(),
  code: f.string().unique(),
  studentIds: f.record().array(),
  students: f.relation('Student').array().field('studentIds'),
});
