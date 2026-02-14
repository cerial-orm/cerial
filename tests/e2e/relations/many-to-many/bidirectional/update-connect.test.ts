/**
 * E2E Tests: Many-to-Many Bidirectional - Update Connect
 *
 * Schema: many-to-many.cerial
 * Tests adding to relation with bidirectional sync.
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

describe('E2E Many-to-Many Bidirectional: Update Connect', () => {
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

  describe('add to relation via update', () => {
    test('should add courses to student with bidirectional sync', async () => {
      const student = await client.db.Student.create({
        data: { name: 'Student', email: uniqueEmail() },
      });
      const course1 = await client.db.Course.create({
        data: { name: 'C1', code: `C1-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'C2', code: `C2-${uniqueId()}` },
      });

      expect(student.courseIds).toEqual([]);

      // Add courses
      const updated = await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { connect: [course1.id, course2.id] },
        },
      });

      expect(updated[0]?.courseIds?.some((id) => id.equals(course1.id))).toBe(true);
      expect(updated[0]?.courseIds?.some((id) => id.equals(course2.id))).toBe(true);

      // Verify bidirectional sync
      const c1 = await client.db.Course.findOne({ where: { id: course1.id } });
      const c2 = await client.db.Course.findOne({ where: { id: course2.id } });

      expect(c1?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
      expect(c2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
    });

    test('should add students to course with bidirectional sync', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });
      const student1 = await client.db.Student.create({
        data: { name: 'S1', email: uniqueEmail('s1') },
      });
      const student2 = await client.db.Student.create({
        data: { name: 'S2', email: uniqueEmail('s2') },
      });

      // Add students
      await client.db.Course.updateMany({
        where: { id: course.id },
        data: {
          students: { connect: [student1.id, student2.id] },
        },
      });

      // Verify bidirectional sync
      const s1 = await client.db.Student.findOne({ where: { id: student1.id } });
      const s2 = await client.db.Student.findOne({ where: { id: student2.id } });

      expect(s1?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
      expect(s2?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
    });
  });

  describe('add to existing relation', () => {
    test('should add more courses to student with existing courses', async () => {
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

      expect(student.courseIds).toHaveLength(1);

      // Add another course
      const updated = await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { connect: [course2.id] },
        },
      });

      expect(updated[0]?.courseIds).toHaveLength(2);
      expect(updated[0]?.courseIds?.some((id) => id.equals(course1.id))).toBe(true);
      expect(updated[0]?.courseIds?.some((id) => id.equals(course2.id))).toBe(true);
    });
  });

  describe('idempotent connect', () => {
    test('should handle connecting already connected record', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });

      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: { connect: [course.id] },
        },
      });

      // Connect same course again
      const updated = await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { connect: [course.id] },
        },
      });

      // Should still have one entry (no duplicates)
      expect(updated[0]?.courseIds).toHaveLength(1);
    });
  });
});
