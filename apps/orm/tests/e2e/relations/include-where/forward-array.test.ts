/**
 * E2E Tests: include where on a forward array relation (Student.courses, Course.students)
 *
 * The join condition is `id INSIDE $parent.<ids>`; the filter narrows that set.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { seedStudentsAndCourses } from './helpers';

const TABLES = tables.manyToMany;

describe('E2E include where: forward array relation', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await seedStudentsAndCourses(client);
  });

  const names = (rows: { name: string }[] | undefined) => rows?.map((r) => r.name).sort();

  test('matches some related rows', async () => {
    const ann = await client.db.Student.findOne({
      where: { name: 'Ann' },
      include: { courses: { where: { name: { in: ['Math', 'Bio'] } } } },
    });

    expect(names(ann?.courses)).toEqual(['Bio', 'Math']);
  });

  test('matches none: an empty array', async () => {
    const ann = await client.db.Student.findOne({
      where: { name: 'Ann' },
      include: { courses: { where: { name: 'Chemistry' } } },
    });

    expect(ann?.courses).toEqual([]);
  });

  test('matches all: the same rows as no filter', async () => {
    const ann = await client.db.Student.findOne({
      where: { name: 'Ann' },
      include: { courses: { where: { code: { in: ['M1', 'A1', 'B1'] } } } },
    });

    expect(names(ann?.courses)).toEqual(['Art', 'Bio', 'Math']);
  });

  test('each parent keeps only its own rows that match', async () => {
    const students = await client.db.Student.findMany({
      orderBy: { name: 'asc' },
      include: { courses: { where: { name: 'Math' } } },
    });

    expect(students.map((s) => [s.name, names(s.courses)])).toEqual([
      ['Ann', ['Math']],
      ['Ben', ['Math']],
      ['Cy', []],
    ]);
  });

  test('a filter never reaches a course the student is not linked to', async () => {
    const cy = await client.db.Student.findOne({
      where: { name: 'Cy' },
      include: { courses: { where: { name: { in: ['Math', 'Art', 'Bio'] } } } },
    });

    expect(names(cy?.courses)).toEqual(['Art']);
  });

  test('the same filter works from the other side of the relation', async () => {
    const math = await client.db.Course.findOne({
      where: { code: 'M1' },
      include: { students: { where: { name: { startsWith: 'B' } } } },
    });

    expect(names(math?.students)).toEqual(['Ben']);
  });

  test('OR and NOT inside the filter', async () => {
    const ann = await client.db.Student.findOne({
      where: { name: 'Ann' },
      include: { courses: { where: { OR: [{ name: 'Art' }, { NOT: { code: { in: ['M1', 'A1'] } } }] } } },
    });

    expect(names(ann?.courses)).toEqual(['Art', 'Bio']);
  });
});
