/**
 * E2E Tests: Many-to-Many Bidirectional - Create Operations
 *
 * Schema: many-to-many.cerial
 * - Student: id, name, email, courseIds (Record[]), courses (Relation[] @field)
 * - Course: id, name, code, studentIds (Record[]), students (Relation[] @field)
 *
 * Tests creating with connect and bidirectional sync.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
  uniqueId,
} from '../../test-helper';

describe('E2E Many-to-Many Bidirectional: Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToMany);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('create with connect', () => {
    test('should create student connecting to courses with bidirectional sync', async () => {
      // Create courses first
      const course1 = await client.db.Course.create({
        data: { name: 'Math', code: `MATH-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'Science', code: `SCI-${uniqueId()}` },
      });

      // Create student connecting to courses
      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: { connect: [course1.id, course2.id] },
        },
      });

      // Student should have courseIds
      expect(student.courseIds).toContain(course1.id);
      expect(student.courseIds).toContain(course2.id);

      // Courses should have studentIds (bidirectional sync)
      const updatedCourse1 = await client.db.Course.findOne({
        where: { id: course1.id },
      });
      const updatedCourse2 = await client.db.Course.findOne({
        where: { id: course2.id },
      });

      expect(updatedCourse1?.studentIds).toContain(student.id);
      expect(updatedCourse2?.studentIds).toContain(student.id);
    });

    test('should create course connecting to students with bidirectional sync', async () => {
      // Create students first
      const student1 = await client.db.Student.create({
        data: { name: 'S1', email: uniqueEmail('s1') },
      });
      const student2 = await client.db.Student.create({
        data: { name: 'S2', email: uniqueEmail('s2') },
      });

      // Create course connecting to students
      const course = await client.db.Course.create({
        data: {
          name: 'History',
          code: `HIST-${uniqueId()}`,
          students: { connect: [student1.id, student2.id] },
        },
      });

      // Course should have studentIds
      expect(course.studentIds).toContain(student1.id);
      expect(course.studentIds).toContain(student2.id);

      // Students should have courseIds (bidirectional sync)
      const updatedStudent1 = await client.db.Student.findOne({
        where: { id: student1.id },
      });
      const updatedStudent2 = await client.db.Student.findOne({
        where: { id: student2.id },
      });

      expect(updatedStudent1?.courseIds).toContain(course.id);
      expect(updatedStudent2?.courseIds).toContain(course.id);
    });
  });

  describe('create without relation', () => {
    test('should create student without courses', async () => {
      const student = await client.db.Student.create({
        data: {
          name: 'No Courses',
          email: uniqueEmail(),
        },
      });

      expect(student.courseIds).toEqual([]);
    });

    test('should create course without students', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Empty Course', code: `EMP-${uniqueId()}` },
      });

      expect(course.studentIds).toEqual([]);
    });
  });
});
