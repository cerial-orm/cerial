/**
 * E2E Tests: Many-to-Many Bidirectional - Upsert
 *
 * Schema: many-to-many.cerial
 * - Student: id, name, email (@unique), courseIds (Record[]), courses (Relation[] @field)
 * - Course: id, name, code (@unique), studentIds (Record[]), students (Relation[] @field)
 *
 * Both sides have Record[] + Relation[] (true N:N with bidirectional sync).
 * Tests upsert with connect from both sides, bidirectional sync verification,
 * disconnect, include, and idempotent connect.
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
} from '../../../test-helper';

describe('E2E Many-to-Many Bidirectional: Upsert', () => {
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

  // ==========================================================================
  // Connect from Student side (PK side for courseIds)
  // ==========================================================================

  describe('connect courses on Student upsert', () => {
    test('connects courses on create path with bidirectional sync', async () => {
      const course1 = await client.db.Course.create({
        data: { name: 'Math', code: `MATH-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'Science', code: `SCI-${uniqueId()}` },
      });

      const email = uniqueEmail('sc');
      const result = await client.db.Student.upsert({
        where: { email },
        create: {
          name: 'Student',
          email,
          courses: { connect: [course1.id, course2.id] },
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Student');
      expect(result!.courseIds.some((id) => id.equals(course1.id))).toBe(true);
      expect(result!.courseIds.some((id) => id.equals(course2.id))).toBe(true);

      // Verify bidirectional sync: courses should have studentIds
      const updatedC1 = await client.db.Course.findOne({ where: { id: course1.id } });
      const updatedC2 = await client.db.Course.findOne({ where: { id: course2.id } });
      expect(updatedC1?.studentIds?.some((id) => id.equals(result!.id))).toBe(true);
      expect(updatedC2?.studentIds?.some((id) => id.equals(result!.id))).toBe(true);
    });

    test('connects additional courses on update path with bidirectional sync', async () => {
      const course1 = await client.db.Course.create({
        data: { name: 'C1', code: `C1-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'C2', code: `C2-${uniqueId()}` },
      });

      const email = uniqueEmail('su');
      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email,
          courses: { connect: [course1.id] },
        },
      });

      const result = await client.db.Student.upsert({
        where: { email },
        create: { name: 'Not This', email },
        update: {
          courses: { connect: [course2.id] },
        },
      });

      expect(result).toBeDefined();
      // Should have both courses
      expect(result!.courseIds.some((id) => id.equals(course1.id))).toBe(true);
      expect(result!.courseIds.some((id) => id.equals(course2.id))).toBe(true);

      // Verify bidirectional sync for new course
      const updatedC2 = await client.db.Course.findOne({ where: { id: course2.id } });
      expect(updatedC2?.studentIds?.some((id) => id.equals(student.id))).toBe(true);
    });
  });

  // ==========================================================================
  // Connect from Course side (PK side for studentIds)
  // ==========================================================================

  describe('connect students on Course upsert', () => {
    test('connects students on create path with bidirectional sync', async () => {
      const student1 = await client.db.Student.create({
        data: { name: 'S1', email: uniqueEmail('s1') },
      });
      const student2 = await client.db.Student.create({
        data: { name: 'S2', email: uniqueEmail('s2') },
      });

      const code = `HIST-${uniqueId()}`;
      const result = await client.db.Course.upsert({
        where: { code },
        create: {
          name: 'History',
          code,
          students: { connect: [student1.id, student2.id] },
        },
        update: { name: 'Updated' },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('History');
      expect(result!.studentIds.some((id) => id.equals(student1.id))).toBe(true);
      expect(result!.studentIds.some((id) => id.equals(student2.id))).toBe(true);

      // Verify bidirectional sync
      const updatedS1 = await client.db.Student.findOne({ where: { id: student1.id } });
      const updatedS2 = await client.db.Student.findOne({ where: { id: student2.id } });
      expect(updatedS1?.courseIds?.some((id) => id.equals(result!.id))).toBe(true);
      expect(updatedS2?.courseIds?.some((id) => id.equals(result!.id))).toBe(true);
    });

    test('connects additional students on update path', async () => {
      const student1 = await client.db.Student.create({
        data: { name: 'S1', email: uniqueEmail('s1') },
      });
      const student2 = await client.db.Student.create({
        data: { name: 'S2', email: uniqueEmail('s2') },
      });

      const code = `C-${uniqueId()}`;
      await client.db.Course.create({
        data: {
          name: 'Course',
          code,
          students: { connect: [student1.id] },
        },
      });

      const result = await client.db.Course.upsert({
        where: { code },
        create: { name: 'Not This', code },
        update: {
          students: { connect: [student2.id] },
        },
      });

      expect(result).toBeDefined();
      expect(result!.studentIds.some((id) => id.equals(student1.id))).toBe(true);
      expect(result!.studentIds.some((id) => id.equals(student2.id))).toBe(true);
    });
  });

  // ==========================================================================
  // Disconnect
  // ==========================================================================

  describe('disconnect on upsert update path', () => {
    test('disconnects courses from student with bidirectional sync', async () => {
      const course1 = await client.db.Course.create({
        data: { name: 'C1', code: `C1-${uniqueId()}` },
      });
      const course2 = await client.db.Course.create({
        data: { name: 'C2', code: `C2-${uniqueId()}` },
      });

      const email = uniqueEmail('dc');
      const student = await client.db.Student.create({
        data: {
          name: 'Student',
          email,
          courses: { connect: [course1.id, course2.id] },
        },
      });

      const result = await client.db.Student.upsert({
        where: { email },
        create: { name: 'Not This', email },
        update: {
          courses: { disconnect: [course1.id] },
        },
      });

      expect(result).toBeDefined();
      // Should only have course2
      expect(result!.courseIds.some((id) => id.equals(course1.id))).toBe(false);
      expect(result!.courseIds.some((id) => id.equals(course2.id))).toBe(true);

      // Verify bidirectional sync: course1 should no longer have this student
      const updatedC1 = await client.db.Course.findOne({ where: { id: course1.id } });
      expect(updatedC1?.studentIds?.some((id) => id.equals(student.id))).toBe(false);
    });
  });

  // ==========================================================================
  // Idempotent connect
  // ==========================================================================

  describe('idempotent connect', () => {
    test('connecting already-connected course does not duplicate', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });

      const email = uniqueEmail('idem');
      await client.db.Student.create({
        data: {
          name: 'Student',
          email,
          courses: { connect: [course.id] },
        },
      });

      const result = await client.db.Student.upsert({
        where: { email },
        create: { name: 'Not This', email },
        update: {
          courses: { connect: [course.id] },
        },
      });

      expect(result).toBeDefined();
      expect(result!.courseIds).toHaveLength(1);
    });
  });

  // ==========================================================================
  // Create-only (no update) with relations
  // ==========================================================================

  describe('create-only with relations', () => {
    test('creates student with courses, returns existing unchanged', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Course', code: `C-${uniqueId()}` },
      });

      const email = uniqueEmail('co');
      const student = await client.db.Student.create({
        data: {
          name: 'Original',
          email,
          courses: { connect: [course.id] },
        },
      });

      const result = await client.db.Student.upsert({
        where: { email },
        create: {
          name: 'Should Not See',
          email,
        },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Original');
      // Courses should be preserved
      expect(result!.courseIds.some((id) => id.equals(course.id))).toBe(true);
    });
  });

  // ==========================================================================
  // Include
  // ==========================================================================

  describe('include', () => {
    test('includes courses in student upsert result', async () => {
      const course = await client.db.Course.create({
        data: { name: 'Included Course', code: `IC-${uniqueId()}` },
      });

      const email = uniqueEmail('inc');
      await client.db.Student.create({
        data: {
          name: 'Student',
          email,
          courses: { connect: [course.id] },
        },
      });

      const result = await client.db.Student.upsert({
        where: { email },
        create: { name: 'Not This', email },
        update: { name: 'Updated' },
        include: { courses: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated');
      expect(Array.isArray((result as any).courses)).toBe(true);
      expect((result as any).courses.length).toBe(1);
      expect((result as any).courses[0].name).toBe('Included Course');
    });

    test('includes students in course upsert result', async () => {
      const student = await client.db.Student.create({
        data: { name: 'Included Student', email: uniqueEmail('is') },
      });

      const code = `IC-${uniqueId()}`;
      await client.db.Course.create({
        data: {
          name: 'Course',
          code,
          students: { connect: [student.id] },
        },
      });

      const result = await client.db.Course.upsert({
        where: { code },
        create: { name: 'Not This', code },
        update: { name: 'Updated Course' },
        include: { students: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('Updated Course');
      expect(Array.isArray((result as any).students)).toBe(true);
      expect((result as any).students.length).toBe(1);
      expect((result as any).students[0].name).toBe('Included Student');
    });

    test('includes empty courses array on student create path', async () => {
      const email = uniqueEmail('empty');
      const result = await client.db.Student.upsert({
        where: { email },
        create: { name: 'New Student', email },
        update: { name: 'Updated' },
        include: { courses: true },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('New Student');
      expect(Array.isArray((result as any).courses)).toBe(true);
      expect((result as any).courses.length).toBe(0);
    });
  });
});
