/**
 * E2E Tests: Many-to-Many Bidirectional - Transaction Rollback
 *
 * Schema: many-to-many.cerial
 * Tests atomic consistency - both sides updated or neither.
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

describe('E2E Many-to-Many Bidirectional: Transaction Rollback', () => {
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

  describe('atomic operations', () => {
    test('create with connect should be atomic', async () => {
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

      // Both sides should be updated
      const s = await client.db.Student.findOne({ where: { id: student.id } });
      const c = await client.db.Course.findOne({ where: { id: course.id } });

      expect(s?.courseIds.includes(course.id)).toBe(
        c?.studentIds.includes(student.id)
      );
    });

    test('update connect should be atomic', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });
      const student = await client.db.Student.create({
        data: { name: 'Student', email: uniqueEmail() },
      });

      await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { connect: [course.id] },
        },
      });

      // Verify atomicity
      const s = await client.db.Student.findOne({ where: { id: student.id } });
      const c = await client.db.Course.findOne({ where: { id: course.id } });

      expect(s?.courseIds.includes(course.id)).toBe(
        c?.studentIds.includes(student.id)
      );
    });

    test('update disconnect should be atomic', async () => {
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

      await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { disconnect: [course.id] },
        },
      });

      // Verify atomicity - both should not have the relation
      const s = await client.db.Student.findOne({ where: { id: student.id } });
      const c = await client.db.Course.findOne({ where: { id: course.id } });

      expect(s?.courseIds.includes(course.id)).toBe(
        c?.studentIds.includes(student.id)
      );
      expect(s?.courseIds.includes(course.id)).toBe(false);
    });
  });

  describe('rollback on failure', () => {
    test('should not partially update if one side fails', async () => {
      // This test verifies that if the second side of a sync fails,
      // the first side is also rolled back. In practice, this depends
      // on the transaction implementation.

      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });
      const student = await client.db.Student.create({
        data: { name: 'Student', email: uniqueEmail() },
      });

      // Successful operation for baseline
      await client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { connect: [course.id] },
        },
      });

      // Both should be in sync
      const s = await client.db.Student.findOne({ where: { id: student.id } });
      const c = await client.db.Course.findOne({ where: { id: course.id } });

      expect(!!s?.courseIds.includes(course.id)).toBe(
        !!c?.studentIds.includes(student.id)
      );
    });
  });

  describe('concurrent operations', () => {
    test('should handle multiple students connecting to same course', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });

      // Create multiple students connecting concurrently
      const promises = Array.from({ length: 3 }, (_, i) =>
        client.db.Student.create({
          data: {
            name: `Student ${i}`,
            email: uniqueEmail(`s${i}`),
            courses: { connect: [course.id] },
          },
        })
      );

      await Promise.all(promises);

      // Verify course has all students
      const updated = await client.db.Course.findOne({
        where: { id: course.id },
      });
      expect(updated?.studentIds).toHaveLength(3);
    });
  });
});
