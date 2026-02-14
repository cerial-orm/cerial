/**
 * E2E Tests: Many-to-Many Bidirectional - Sync Verification
 *
 * Schema: many-to-many.cerial
 * Tests that bidirectional sync maintains consistency.
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

describe('E2E Many-to-Many Bidirectional: Sync Verification', () => {
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

      expect(studentView?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
      expect(courseView?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
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
      expect(updatedStudent?.courseIds?.some((id) => id.equals(c1.id))).toBe(false);
      expect(updatedStudent?.courseIds?.some((id) => id.equals(c2.id))).toBe(true);
      expect(updatedStudent?.courseIds?.some((id) => id.equals(c3.id))).toBe(true);

      // Verify from course side
      const updatedC1 = await client.db.Course.findOne({ where: { id: c1.id } });
      const updatedC2 = await client.db.Course.findOne({ where: { id: c2.id } });
      const updatedC3 = await client.db.Course.findOne({ where: { id: c3.id } });

      expect(updatedC1?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
      expect(updatedC2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
      expect(updatedC3?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
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

      expect(s?.courseIds?.some((id) => id.equals(course.id))).toBe(true);
      expect(c?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
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
      expect(updated?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
      expect(updated?.studentIds).toEqual([]);
    });
  });
});
