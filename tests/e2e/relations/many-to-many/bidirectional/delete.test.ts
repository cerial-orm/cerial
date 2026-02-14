/**
 * E2E Tests: Many-to-Many Bidirectional - Delete
 *
 * Schema: many-to-many.cerial
 * Tests cleanup of both sides when record deleted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient, truncateTables,
  CerialClient,
  tables,
  testConfig,
  uniqueEmail,
  uniqueId,
} from '../../test-helper';

describe('E2E Many-to-Many Bidirectional: Delete', () => {
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

  describe('delete cleans up both sides', () => {
    test('should remove student from all courses when student deleted', async () => {
      const course1 = await client.db.Course.create({
        data: { name: 'C1', code: `C1-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'C2', code: `C2-${uniqueId()}` },
      });

      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: { connect: [course1.id, course2.id] },
        },
      });

      // Verify courses have student
      let c1 = await client.db.Course.findOne({ where: { id: course1.id } });
      let c2 = await client.db.Course.findOne({ where: { id: course2.id } });
      expect(c1?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
      expect(c2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);

      // Delete student
      await client.db.Student.deleteMany({
        where: { id: student.id },
      });

      // Courses should no longer have student
      c1 = await client.db.Course.findOne({ where: { id: course1.id } });
      c2 = await client.db.Course.findOne({ where: { id: course2.id } });
      expect(c1?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
      expect(c2?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
    });

    test('should remove course from all students when course deleted', async () => {
      const student1 = await client.db.Student.create({
        data: { name: 'S1', email: uniqueEmail('s1') },
      });
      const student2 = await client.db.Student.create({
        data: { name: 'S2', email: uniqueEmail('s2') },
      });

      const course = await client.db.Course.create({
        data: {
          name: 'Course',
          code: `C-${uniqueId()}`,
          students: { connect: [student1.id, student2.id] },
        },
      });

      // Verify students have course
      let s1 = await client.db.Student.findOne({ where: { id: student1.id } });
      let s2 = await client.db.Student.findOne({ where: { id: student2.id } });
      expect(s1?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
      expect(s2?.courseIds?.some((id) => id.equals(course.id))).toBe(true);

      // Delete course
      await client.db.Course.deleteMany({
        where: { id: course.id },
      });

      // Students should no longer have course
      s1 = await client.db.Student.findOne({ where: { id: student1.id } });
      s2 = await client.db.Student.findOne({ where: { id: student2.id } });
      expect(s1?.courseIds?.some((id) => id.equals(course.id))).toBe(false);
      expect(s2?.courseIds?.some((id) => id.equals(course.id))).toBe(false);
    });
  });

  describe('delete with no relations', () => {
    test('should delete student with no courses', async () => {
      const student = await client.db.Student.create({
        data: { name: 'Loner', email: uniqueEmail() },
      });

      await client.db.Student.deleteMany({
        where: { id: student.id },
      });

      expect(
        await client.db.Student.findOne({ where: { id: student.id } })
      ).toBeNull();
    });

    test('should delete course with no students', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Empty', code: `E-${uniqueId()}` },
      });

      await client.db.Course.deleteMany({
        where: { id: course.id },
      });

      expect(
        await client.db.Course.findOne({ where: { id: course.id } })
      ).toBeNull();
    });
  });

  describe('deleteMany cleanup', () => {
    test('should cleanup all relations when multiple students deleted', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });

      await client.db.Student.create({
        data: {
          name: 'Delete 1',
          email: uniqueEmail('d1'),
          courses: { connect: [course.id] },
        },
      });
      await client.db.Student.create({
        data: {
          name: 'Delete 2',
          email: uniqueEmail('d2'),
          courses: { connect: [course.id] },
        },
      });
      await client.db.Student.create({
        data: {
          name: 'Keep',
          email: uniqueEmail('k'),
          courses: { connect: [course.id] },
        },
      });

      // Delete students matching pattern
      await client.db.Student.deleteMany({
        where: { name: { startsWith: 'Delete' } },
      });

      // Course should only have 'Keep' student
      const updated = await client.db.Course.findOne({
        where: { id: course.id },
      });
      expect(updated?.studentIds).toHaveLength(1);
    });
  });
});
