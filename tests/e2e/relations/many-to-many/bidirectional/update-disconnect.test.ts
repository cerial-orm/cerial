/**
 * E2E Tests: Many-to-Many Bidirectional - Update Disconnect
 *
 * Schema: many-to-many.cerial
 * Tests removing from relation with bidirectional sync.
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

describe('E2E Many-to-Many Bidirectional: Update Disconnect', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToMany);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('disconnect from relation', () => {
    test('should remove course from student with bidirectional sync', async () => {
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

      expect(student.courseIds).toHaveLength(2);

      // Disconnect course1
      const updated = await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { disconnect: [course1.id] },
        },
      });

      // Student should only have course2
      expect(updated[0]?.courseIds?.some((id) => id.equals(course1.id))).toBe(false);
      expect(updated[0]?.courseIds?.some((id) => id.equals(course2.id))).toBe(true);

      // Verify bidirectional sync - course1 should not have student
      const c1 = await client.db.Course.findOne({ where: { id: course1.id } });
      expect(c1?.studentIds?.some((id) => id.equals(student.id))).toBe(false);

      // course2 should still have student
      const c2 = await client.db.Course.findOne({ where: { id: course2.id } });
      expect(c2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
    });

    test('should remove student from course with bidirectional sync', async () => {
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

      // Disconnect student1
      await client.db.Course.updateMany({
        where: { id: course.id },
        data: {
          students: { disconnect: [student1.id] },
        },
      });

      // Verify bidirectional sync
      const s1 = await client.db.Student.findOne({ where: { id: student1.id } });
      const s2 = await client.db.Student.findOne({ where: { id: student2.id } });

      expect(s1?.courseIds?.some((id) => id.equals(course.id))).toBe(false);
      expect(s2?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
    });
  });

  describe('disconnect all', () => {
    test('should disconnect all courses from student', async () => {
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

      // Disconnect all
      const updated = await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { disconnect: [course1.id, course2.id] },
        },
      });

      expect(updated[0]?.courseIds).toEqual([]);

      // Neither course should have student
      const c1 = await client.db.Course.findOne({ where: { id: course1.id } });
      const c2 = await client.db.Course.findOne({ where: { id: course2.id } });

      expect(c1?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
      expect(c2?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
    });
  });

  describe('connect and disconnect in same update', () => {
    test('should handle both connect and disconnect', async () => {
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
          courses: { connect: [course1.id] },
        },
      });

      // Remove course1, add course2
      const updated = await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: {
            connect: [course2.id],
            disconnect: [course1.id],
          },
        },
      });

      expect(updated[0]?.courseIds?.some((id) => id.equals(course1.id))).toBe(false);
      expect(updated[0]?.courseIds?.some((id) => id.equals(course2.id))).toBe(true);

      // Verify bidirectional sync
      const c1 = await client.db.Course.findOne({ where: { id: course1.id } });
      const c2 = await client.db.Course.findOne({ where: { id: course2.id } });

      expect(c1?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
      expect(c2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
    });
  });
});
