/**
 * E2E Tests: Transactions - Many-to-Many Sync
 *
 * Schema: many-to-many.cerial
 * - Student: id Record @id, name String, email Email @unique, courseIds Record[], courses Relation[] @field(courseIds) @model(Course)
 * - Course: id Record @id, name String, code String @unique, studentIds Record[], students Relation[] @field(studentIds) @model(Student)
 *
 * Tests bidirectional many-to-many sync within $transaction.
 * Both sides define Record[] + Relation[] for full bidirectional sync.
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
} from '../../test-helper';

describe('E2E Transactions: Many-to-Many Sync', () => {
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

  test('bidirectional sync in create inside transaction', async () => {
    const course = await client.db.Course.create({
      data: { name: 'Physics', code: `PHY-${uniqueId()}` },
    });

    const [student] = await client.$transaction([
      client.db.Student.create({
        data: {
          name: 'Sync Student',
          email: uniqueEmail(),
          courses: { connect: [course.id] },
        },
      }),
    ]);

    // Student side: courseIds should contain the course
    expect(student.courseIds.some((id) => id.equals(course.id))).toBe(true);

    // Course side: studentIds should contain the student (bidirectional sync)
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
  });

  test('bidirectional sync in update inside transaction', async () => {
    const student = await client.db.Student.create({
      data: { name: 'Update Student', email: uniqueEmail() },
    });
    const course = await client.db.Course.create({
      data: { name: 'Chemistry', code: `CHEM-${uniqueId()}` },
    });

    // Verify no connection initially
    expect(student.courseIds).toEqual([]);

    // Connect via updateMany inside transaction
    const [updated] = await client.$transaction([
      client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { connect: [course.id] },
        },
      }),
    ]);

    // Student side should have the course
    expect(updated[0]?.courseIds?.some((id) => id.equals(course.id))).toBe(true);

    // Course side should have the student (bidirectional sync)
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
  });

  test('multiple bidirectional ops in same transaction', async () => {
    const course = await client.db.Course.create({
      data: { name: 'Biology', code: `BIO-${uniqueId()}` },
    });

    // Create 2 students connecting to the same course in one transaction
    const [student1, student2] = await client.$transaction([
      client.db.Student.create({
        data: {
          name: 'Student A',
          email: uniqueEmail('sa'),
          courses: { connect: [course.id] },
        },
      }),
      client.db.Student.create({
        data: {
          name: 'Student B',
          email: uniqueEmail('sb'),
          courses: { connect: [course.id] },
        },
      }),
    ]);

    // Both students should have the course
    expect(student1.courseIds.some((id) => id.equals(course.id))).toBe(true);
    expect(student2.courseIds.some((id) => id.equals(course.id))).toBe(true);

    // Course should have both students (bidirectional sync)
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student1.id))).toBe(true);
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student2.id))).toBe(true);
    expect(updatedCourse?.studentIds).toHaveLength(2);
  });

  test('bidirectional disconnect inside transaction', async () => {
    // Set up connected student + course
    const course = await client.db.Course.create({
      data: { name: 'Literature', code: `LIT-${uniqueId()}` },
    });

    const student = await client.db.Student.create({
      data: {
        name: 'Disconnect Student',
        email: uniqueEmail(),
        courses: { connect: [course.id] },
      },
    });

    // Verify connection exists on both sides
    expect(student.courseIds.some((id) => id.equals(course.id))).toBe(true);
    const courseBefore = await client.db.Course.findOne({ where: { id: course.id } });
    expect(courseBefore?.studentIds?.some((id) => id.equals(student.id))).toBe(true);

    // Disconnect inside transaction
    const [updated] = await client.$transaction([
      client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { disconnect: [course.id] },
        },
      }),
    ]);

    // Student side: courseIds should be empty
    expect(updated[0]?.courseIds?.some((id) => id.equals(course.id))).toBe(false);
    expect(updated[0]?.courseIds).toEqual([]);

    // Course side: studentIds should be empty (bidirectional sync)
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
    expect(updatedCourse?.studentIds).toEqual([]);
  });
});
