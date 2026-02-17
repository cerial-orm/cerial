/**
 * E2E Tests: Many-to-Many Bidirectional - Create Operations
 *
 * Schema: many-to-many.cerial
 * - Student: id, name, email, courseIds (Record[]), courses (Relation[] @field)
 * - Course: id, name, code, studentIds (Record[]), students (Relation[] @field)
 *
 * Tests creating with connect and bidirectional sync.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
  uniqueId,
} from '../../test-helper';

describe('E2E Many-to-Many Bidirectional: Create', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToMany);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.manyToMany);
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
      expect(student.courseIds.some((id) => id.equals(course1.id))).toBe(true);
      expect(student.courseIds.some((id) => id.equals(course2.id))).toBe(true);

      // Courses should have studentIds (bidirectional sync)
      const updatedCourse1 = await client.db.Course.findOne({
        where: { id: course1.id },
      });
      const updatedCourse2 = await client.db.Course.findOne({
        where: { id: course2.id },
      });

      expect(updatedCourse1?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
      expect(updatedCourse2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
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
      expect(course.studentIds.some((id) => id.equals(student1.id))).toBe(true);
      expect(course.studentIds.some((id) => id.equals(student2.id))).toBe(true);

      // Students should have courseIds (bidirectional sync)
      const updatedStudent1 = await client.db.Student.findOne({
        where: { id: student1.id },
      });
      const updatedStudent2 = await client.db.Student.findOne({
        where: { id: student2.id },
      });

      expect(updatedStudent1?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
      expect(updatedStudent2?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
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
