/**
 * E2E Tests: Many-to-Many Bidirectional - Sync Verification
 *
 * Schema: many-to-many.cerial
 * Tests that bidirectional sync maintains consistency.
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

describe('E2E Many-to-Many Bidirectional: Sync Verification', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.manyToMany);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('consistency verification', () => {
    test('both sides should always agree on relationship', async () => {
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

      // Verify from both sides
      const studentView = await client.db.Student.findOne({
        where: { id: student.id },
      });
      const courseView = await client.db.Course.findOne({
        where: { id: course.id },
      });

      expect(studentView?.courseIds).toContain(course.id);
      expect(courseView?.studentIds).toContain(student.id);
    });

    test('should maintain consistency after multiple operations', async () => {
      const c1 = await client.db.Course.create({
        data: { name: 'C1', code: `C1-${uniqueId()}` },
      });
      const c2 = await client.db.Course.create({
        data: { name: 'C2', code: `C2-${uniqueId()}` },
      });
      const c3 = await client.db.Course.create({
        data: { name: 'C3', code: `C3-${uniqueId()}` },
      });

      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email: uniqueEmail(),
          courses: { connect: [c1.id, c2.id] },
        },
      });

      // Add c3, remove c1
      await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: {
            connect: [c3.id],
            disconnect: [c1.id],
          },
        },
      });

      // Verify consistency
      const updatedStudent = await client.db.Student.findOne({
        where: { id: student.id },
      });
      expect(updatedStudent?.courseIds).not.toContain(c1.id);
      expect(updatedStudent?.courseIds).toContain(c2.id);
      expect(updatedStudent?.courseIds).toContain(c3.id);

      // Verify from course side
      const updatedC1 = await client.db.Course.findOne({ where: { id: c1.id } });
      const updatedC2 = await client.db.Course.findOne({ where: { id: c2.id } });
      const updatedC3 = await client.db.Course.findOne({ where: { id: c3.id } });

      expect(updatedC1?.studentIds).not.toContain(student.id);
      expect(updatedC2?.studentIds).toContain(student.id);
      expect(updatedC3?.studentIds).toContain(student.id);
    });
  });

  describe('symmetry verification', () => {
    test('adding from either side should be equivalent', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });
      const student = await client.db.Student.create({
        data: { name: 'Student', email: uniqueEmail() },
      });

      // Add via course side
      await client.db.Course.updateMany({
        where: { id: course.id },
        data: {
          students: { connect: [student.id] },
        },
      });

      // Verify both sides
      const s = await client.db.Student.findOne({ where: { id: student.id } });
      const c = await client.db.Course.findOne({ where: { id: course.id } });

      expect(s?.courseIds).toContain(course.id);
      expect(c?.studentIds).toContain(student.id);
    });
  });

  describe('no orphan IDs', () => {
    test('should not have orphan IDs after delete', async () => {
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

      // Delete student
      await client.db.Student.deleteMany({
        where: { id: student.id },
      });

      // Course should not reference deleted student
      const updated = await client.db.Course.findOne({
        where: { id: course.id },
      });
      expect(updated?.studentIds).not.toContain(student.id);
      expect(updated?.studentIds).toEqual([]);
    });
  });
});
