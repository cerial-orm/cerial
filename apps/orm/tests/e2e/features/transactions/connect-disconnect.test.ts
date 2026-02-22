/**
 * E2E Tests: Transactions - Connect/Disconnect
 *
 * Schema: many-to-many.cerial
 * - Student: id Record @id, name String, email Email @unique, courseIds Record[], courses Relation[] @field(courseIds) @model(Course)
 * - Course: id Record @id, name String, code String @unique, studentIds Record[], students Relation[] @field(studentIds) @model(Student)
 *
 * Tests connect and disconnect relation operations within $transaction.
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

describe('E2E Transactions: Connect/Disconnect', () => {
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

  test('create with connect inside transaction', async () => {
    // Create course outside transaction
    const course = await client.db.Course.create({
      data: { name: 'Math', code: `MATH-${uniqueId()}` },
    });

    // Create student with connect inside transaction
    const [student] = await client.$transaction([
      client.db.Student.create({
        data: {
          name: 'Tx Student',
          email: uniqueEmail(),
          courses: { connect: [course.id] },
        },
      }),
    ]);

    expect(student).toBeDefined();
    expect(student.courseIds.some((id) => id.equals(course.id))).toBe(true);

    // Verify bidirectional sync
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
  });

  test('update with connect inside transaction', async () => {
    const student = await client.db.Student.create({
      data: { name: 'Student', email: uniqueEmail() },
    });
    const course = await client.db.Course.create({
      data: { name: 'Science', code: `SCI-${uniqueId()}` },
    });

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

    expect(updated[0]?.courseIds?.some((id) => id.equals(course.id))).toBe(true);

    // Verify bidirectional sync
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
  });

  test('update with disconnect inside transaction', async () => {
    // Create connected student+course
    const course = await client.db.Course.create({
      data: { name: 'History', code: `HIST-${uniqueId()}` },
    });

    const student = await client.db.Student.create({
      data: {
        name: 'Connected Student',
        email: uniqueEmail(),
        courses: { connect: [course.id] },
      },
    });

    // Verify connection established
    expect(student.courseIds.some((id) => id.equals(course.id))).toBe(true);

    // Disconnect inside transaction
    const [updated] = await client.$transaction([
      client.db.Student.updateMany({
        where: { id: student.id },
        data: {
          courses: { disconnect: [course.id] },
        },
      }),
    ]);

    expect(updated[0]?.courseIds?.some((id) => id.equals(course.id))).toBe(false);

    // Verify bidirectional sync - course should no longer reference student
    const updatedCourse = await client.db.Course.findOne({
      where: { id: course.id },
    });
    expect(updatedCourse?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
  });

  test('connect + independent query in transaction', async () => {
    const course = await client.db.Course.create({
      data: { name: 'Art', code: `ART-${uniqueId()}` },
    });

    const email = uniqueEmail();

    const [student, courses] = await client.$transaction([
      client.db.Student.create({
        data: {
          name: 'Multi-op Student',
          email,
          courses: { connect: [course.id] },
        },
      }),
      client.db.Course.findMany(),
    ]);

    // Student should be created with connection
    expect(student).toBeDefined();
    expect(student.courseIds.some((id) => id.equals(course.id))).toBe(true);

    // findMany should return at least the one course
    expect(courses.length).toBeGreaterThanOrEqual(1);
    expect(courses.some((c) => c.id.equals(course.id))).toBe(true);
  });
});
