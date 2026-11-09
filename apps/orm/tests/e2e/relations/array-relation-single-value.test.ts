/**
 * E2E: one id in `connect` and one object in `create` on an array relation
 *
 * A single value is a list of one, in create and in update, as `disconnect` and `set` already take it. Each
 * case reads both sides back, so a link written to the parent only (or to neither) fails it. Student and
 * Course are a true N:N pair; Blogger.labels is a one-way Record[] with no other side to sync.
 */

import { describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { setupDataTypeTests } from '../data-types/test-factory';
import { tables } from '../test-helper';

const loose = (value: unknown): never => value as never;
const ids = (list: ReadonlyArray<{ toString(): string }> | undefined): string[] =>
  (list ?? []).map((i) => i.toString().replace(/^\w+:/, ''));

describe('E2E: a single value on an array relation', () => {
  const { getClient } = setupDataTypeTests([...tables.manyToMany, ...tables.manyToOneDirectional]);

  const seedCourses = async (): Promise<void> => {
    const { db } = getClient();
    await db.Course.create({ data: { id: 'c1', name: 'c1', code: 'C1' } });
    await db.Course.create({ data: { id: 'c2', name: 'c2', code: 'C2' } });
  };
  const student = async (id: string) => getClient().db.Student.findOne({ where: { id } });
  const course = async (id: string) => getClient().db.Course.findOne({ where: { id } });

  describe('create', () => {
    test('connect with one id links both sides', async () => {
      await seedCourses();
      await getClient().db.Student.create({
        data: loose({ id: 's1', name: 's1', email: 's1@x.com', courses: { connect: 'c1' } }),
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['c1']);
      expect(ids((await course('c1'))?.studentIds)).toEqual(['s1']);
      expect(ids((await course('c2'))?.studentIds)).toEqual([]);
    });

    test('connect with one CerialId links both sides', async () => {
      await seedCourses();
      await getClient().db.Student.create({
        data: loose({ id: 's1', name: 's1', email: 's1@x.com', courses: { connect: new CerialId('c2') } }),
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['c2']);
      expect(ids((await course('c2'))?.studentIds)).toEqual(['s1']);
    });

    test('connect with a list of one still links both sides', async () => {
      await seedCourses();
      await getClient().db.Student.create({
        data: loose({ id: 's1', name: 's1', email: 's1@x.com', courses: { connect: ['c1'] } }),
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['c1']);
      expect(ids((await course('c1'))?.studentIds)).toEqual(['s1']);
    });

    test('create with one object creates the row and links both sides', async () => {
      await getClient().db.Student.create({
        data: loose({
          id: 's1',
          name: 's1',
          email: 's1@x.com',
          courses: { create: { id: 'cn', name: 'cn', code: 'CN' } },
        }),
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['cn']);
      expect(ids((await course('cn'))?.studentIds)).toEqual(['s1']);
    });

    test('one created object and one connected id together link both sides', async () => {
      await seedCourses();
      await getClient().db.Student.create({
        data: loose({
          id: 's1',
          name: 's1',
          email: 's1@x.com',
          courses: { create: { id: 'cn', name: 'cn', code: 'CN' }, connect: 'c1' },
        }),
      });

      expect(ids((await student('s1'))?.courseIds).sort()).toEqual(['c1', 'cn']);
      expect(ids((await course('c1'))?.studentIds)).toEqual(['s1']);
      expect(ids((await course('cn'))?.studentIds)).toEqual(['s1']);
    });

    test('from the other side: connect with one id', async () => {
      await getClient().db.Student.create({ data: { id: 's1', name: 's1', email: 's1@x.com' } });
      await getClient().db.Course.create({
        data: loose({ id: 'c1', name: 'c1', code: 'C1', students: { connect: 's1' } }),
      });

      expect(ids((await course('c1'))?.studentIds)).toEqual(['s1']);
      expect(ids((await student('s1'))?.courseIds)).toEqual(['c1']);
    });

    test('a one-way array relation takes one id and one object', async () => {
      const { db } = getClient();
      await db.Label.create({ data: { id: 'l1', name: 'l1' } });
      await db.Blogger.create({
        data: loose({
          id: 'b1',
          name: 'b1',
          labels: { connect: 'l1', create: { id: 'l2', name: 'l2' } },
        }),
      });

      expect(ids((await db.Blogger.findOne({ where: { id: 'b1' } }))?.labelIds).sort()).toEqual(['l1', 'l2']);
      expect(await db.Label.count({ id: 'l2' })).toBe(1);
    });

    test('an upsert create path links both sides from one id', async () => {
      await seedCourses();
      await getClient().db.Student.upsert({
        where: { id: 's1' },
        create: loose({ id: 's1', name: 's1', email: 's1@x.com', courses: { connect: 'c1' } }),
        update: { name: 's1' },
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['c1']);
      expect(ids((await course('c1'))?.studentIds)).toEqual(['s1']);
    });
  });

  describe('update', () => {
    test('create with one object links both sides', async () => {
      await getClient().db.Student.create({ data: { id: 's1', name: 's1', email: 's1@x.com' } });
      await getClient().db.Student.updateUnique({
        where: { id: 's1' },
        data: loose({ courses: { create: { id: 'cn', name: 'cn', code: 'CN' } } }),
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['cn']);
      expect(ids((await course('cn'))?.studentIds)).toEqual(['s1']);
    });

    test('create with one object keeps links that already exist', async () => {
      await seedCourses();
      await getClient().db.Student.create({
        data: loose({ id: 's1', name: 's1', email: 's1@x.com', courses: { connect: ['c1'] } }),
      });
      await getClient().db.Student.updateUnique({
        where: { id: 's1' },
        data: loose({ courses: { create: { id: 'cn', name: 'cn', code: 'CN' } } }),
      });

      expect(ids((await student('s1'))?.courseIds).sort()).toEqual(['c1', 'cn']);
      expect(ids((await course('c1'))?.studentIds)).toEqual(['s1']);
      expect(ids((await course('cn'))?.studentIds)).toEqual(['s1']);
    });

    test('connect with one id links both sides', async () => {
      await seedCourses();
      await getClient().db.Student.create({ data: { id: 's1', name: 's1', email: 's1@x.com' } });
      await getClient().db.Student.updateUnique({
        where: { id: 's1' },
        data: loose({ courses: { connect: 'c2' } }),
      });

      expect(ids((await student('s1'))?.courseIds)).toEqual(['c2']);
      expect(ids((await course('c2'))?.studentIds)).toEqual(['s1']);
    });
  });

  describe('invalid single values are refused naming the field', () => {
    test.each([
      ['connect with an object', { connect: { nope: 1 } }],
      ['connect with a boolean', { connect: true }],
      ['create with a string', { create: 'x' }],
    ])('create: %s writes nothing', async (_label, courses) => {
      await seedCourses();
      const call = async (): Promise<void> => {
        await getClient().db.Student.create({
          data: loose({ id: 's1', name: 's1', email: 's1@x.com', courses }),
        });
      };

      await expect(call()).rejects.toThrow(/courses/);
      expect(await student('s1')).toBeNull();
      expect(ids((await course('c1'))?.studentIds)).toEqual([]);
    });

    test('update: connect with a boolean changes nothing', async () => {
      await seedCourses();
      await getClient().db.Student.create({ data: { id: 's1', name: 's1', email: 's1@x.com' } });
      const call = async (): Promise<void> => {
        await getClient().db.Student.updateUnique({
          where: { id: 's1' },
          data: loose({ courses: { connect: true } }),
        });
      };

      await expect(call()).rejects.toThrow(/courses/);
      expect(ids((await student('s1'))?.courseIds)).toEqual([]);
    });
  });
});
