/**
 * E2E Tests: Many-to-Many Bidirectional - Nested Create
 *
 * Schema: many-to-many.cerial
 * Tests creating related records inline with bidirectional sync.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
  uniqueId,
} from '../../../test-helper';

describe('E2E Many-to-Many Bidirectional: Nested Create', () => {
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

  describe('nested create from student side', () => {
    test('should create student with nested courses', async () => {
      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: {
            create: [
              { name: 'Math', code: `MATH-${uniqueId()}` },
              { name: 'Science', code: `SCI-${uniqueId()}` },
            ],
          },
        },
      });

      expect(student.courseIds).toHaveLength(2);

      // Verify courses were created
      const courses = await client.db.Course.findMany({});
      expect(courses).toHaveLength(2);

      // Verify bidirectional sync
      courses.forEach((course) => {
        expect(course.studentIds.some((id) => id.equals(student.id))).toBe(true);
      });
    });
  });

  describe('nested create from course side', () => {
    test('should create course with nested students', async () => {
      const course = await client.db.Course.create({
        data: {
          name: 'Course',
          code: `C-${uniqueId()}`,
          students: {
            create: [
              { name: 'Student 1', email: uniqueEmail('s1') },
              { name: 'Student 2', email: uniqueEmail('s2') },
            ],
          },
        },
      });

      expect(course.studentIds).toHaveLength(2);

      // Verify students were created
      const students = await client.db.Student.findMany({});
      expect(students).toHaveLength(2);

      // Verify bidirectional sync
      students.forEach((student) => {
        expect(student.courseIds.some((id) => id.equals(course.id))).toBe(true);
      });
    });
  });

  describe('mixed create and connect', () => {
    test('should create student with both new and existing courses', async () => {
      // Create existing course
      const existingCourse = await client.db.Course.create({
        data: { name: 'Existing', code: `EX-${uniqueId()}` },
      });

      // Create student with both create and connect
      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: {
            create: [{ name: 'New Course', code: `NEW-${uniqueId()}` }],
            connect: [existingCourse.id],
          },
        },
      });

      expect(student.courseIds).toHaveLength(2);
      expect(student.courseIds.some((id) => id.equals(existingCourse.id))).toBe(true);

      // Verify existing course has student
      const updatedExisting = await client.db.Course.findOne({
        where: { id: existingCourse.id },
      });
      expect(updatedExisting?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
    });
  });
});
