/**
 * E2E Tests: Many-to-Many Bidirectional - Include
 *
 * Schema: many-to-many.cerial
 * Tests including from either side of n-n relation.
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

describe('E2E Many-to-Many Bidirectional: Include', () => {
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

  describe('include from student side', () => {
    test('should include courses when querying student', async () => {
      const course1 = await client.db.Course.create({
        data: { name: 'Math', code: `M-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'Science', code: `S-${uniqueId()}` },
      });

      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: { connect: [course1.id, course2.id] },
        },
      });

      const result = await client.db.Student.findOne({
        where: { id: student.id },
        include: { courses: true },
      });

      expect(result?.courses).toHaveLength(2);
      expect(result?.courses?.map((c) => c.name).sort()).toEqual(['Math', 'Science']);
    });

    test('should return empty array when student has no courses', async () => {
      const student = await client.db.Student.create({
        data: { name: 'No Courses', email: uniqueEmail() },
      });

      const result = await client.db.Student.findOne({
        where: { id: student.id },
        include: { courses: true },
      });

      expect(result?.courses).toEqual([]);
    });
  });

  describe('include from course side', () => {
    test('should include students when querying course', async () => {
      const student1 = await client.db.Student.create({
        data: { name: 'Alice', email: uniqueEmail('a') },
      });
      const student2 = await client.db.Student.create({
        data: { name: 'Bob', email: uniqueEmail('b') },
      });

      const course = await client.db.Course.create({
        data: {
          name: 'Course',
          code: `C-${uniqueId()}`,
          students: { connect: [student1.id, student2.id] },
        },
      });

      const result = await client.db.Course.findOne({
        where: { id: course.id },
        include: { students: true },
      });

      expect(result?.students).toHaveLength(2);
      expect(result?.students?.map((s) => s.name).sort()).toEqual(['Alice', 'Bob']);
    });
  });

  describe('include with orderBy and limit', () => {
    test('should order and limit included courses', async () => {
      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: {
            create: [
              { name: 'Zebra', code: `Z-${uniqueId()}` },
              { name: 'Alpha', code: `A-${uniqueId()}` },
              { name: 'Middle', code: `M-${uniqueId()}` },
            ],
          },
        },
      });

      const result = await client.db.Student.findOne({
        where: { id: student.id },
        include: {
          courses: {
            orderBy: { name: 'asc' },
            limit: 2,
          },
        },
      });

      expect(result?.courses).toHaveLength(2);
      expect(result?.courses?.[0]?.name).toBe('Alpha');
      expect(result?.courses?.[1]?.name).toBe('Middle');
    });
  });

  describe('include in findMany', () => {
    test('should include relations for multiple students', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Shared Course', code: `S-${uniqueId()}` },
      });

      await client.db.Student.create({
        data: {
          name: 'S1',
          email: uniqueEmail('s1'),
          courses: { connect: [course.id] },
        },
      });
      await client.db.Student.create({
        data: { name: 'S2', email: uniqueEmail('s2') }, // No courses
      });

      const students = await client.db.Student.findMany({
        include: { courses: true },
        orderBy: { name: 'asc' },
      });

      expect(students[0]?.courses).toHaveLength(1);
      expect(students[1]?.courses).toHaveLength(0);
    });
  });

  describe('nested include', () => {
    test('should support nested include (student.courses.students)', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });

      const student1 = await client.db.Student.create({
        data: {
          name: 'Student 1',
          email: uniqueEmail('s1'),
          courses: { connect: [course.id] },
        },
      });
      await client.db.Student.create({
        data: {
          name: 'Student 2',
          email: uniqueEmail('s2'),
          courses: { connect: [course.id] },
        },
      });

      const result = await client.db.Student.findOne({
        where: { id: student1.id },
        include: {
          courses: {
            include: { students: true },
          },
        },
      });

      // Should see both students via the course
      expect(result?.courses?.[0]?.students).toHaveLength(2);
    });
  });
});
