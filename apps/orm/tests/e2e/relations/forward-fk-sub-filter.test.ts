/**
 * E2E: a filter through a forward relation on the related model's own foreign key
 *
 * `{ mentor: { mentorId: x } }` filters by the related row's foreign key, so the operand is converted by the
 * model that owns the key and matches what `{ mentorId: x }` matches on that model. It threw "Cannot parse
 * number as RecordId without table context" for operand forms that hold at the top level.
 *
 * Schema: self-referential.cerial. Person.mentorId and SocialUser.followingIds are foreign keys of the model
 * the relation points at, because the relation is to the same model. The expected rows of each case are the
 * rows pointing at whatever the model's own filter selects.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import type { CerialId } from 'cerial';
import { tables } from '../test-helper';
import { setupDataTypeTests } from '../data-types/test-factory';

const loose = (value: unknown): never => value as never;

describe('E2E: a forward relation filtered by the related row’s foreign key', () => {
  const { getClient } = setupDataTypeTests([...tables.selfRefOneToOne, ...tables.selfRefSingleSidedArray]);

  describe('a single foreign key', () => {
    // m1 and m2 have no mentor; a and b are mentored by m1, c by m2, d by nobody, e by a
    const seed = async (): Promise<{ m1: CerialId; m2: CerialId }> => {
      const { db } = getClient();
      const m1 = (await db.Person.create({ data: { name: 'm1' } })).id;
      const m2 = (await db.Person.create({ data: { name: 'm2' } })).id;
      const a = (await db.Person.create({ data: { name: 'a', mentorId: m1 } })).id;
      await db.Person.create({ data: { name: 'b', mentorId: m1 } });
      await db.Person.create({ data: { name: 'c', mentorId: m2 } });
      await db.Person.create({ data: { name: 'd' } });
      await db.Person.create({ data: { name: 'e', mentorId: a } });

      return { m1, m2 };
    };
    const names = async (where: unknown): Promise<string[]> =>
      (await getClient().db.Person.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((p) => p.name);
    /** The people whose mentor is selected by the model's own filter on `mentorId` */
    const expected = async (shape: unknown): Promise<string[]> => {
      const mentors = (await getClient().db.Person.findMany({ where: loose({ mentorId: shape }) })).map((p) => p.id);
      const all = await getClient().db.Person.findMany({ orderBy: { name: 'asc' } });

      return all.filter((p) => p.mentorId && mentors.some((m) => m.equals(p.mentorId!))).map((p) => p.name);
    };

    test('a negated deleteMany through the relation removes the rows that do not match and spares the one that does', async () => {
      const { m1 } = await seed();
      expect(await getClient().db.Person.deleteMany({ where: loose({ NOT: { mentor: { mentorId: m1 } } }) })).toBe(6);
      expect(await names({})).toEqual(['e']);
    });

    test('updateMany through the relation changes only the matching row', async () => {
      const { m1 } = await seed();
      await getClient().db.Person.updateMany({ where: loose({ mentor: { mentorId: m1 } }), data: { name: 'e2' } });
      expect(await names({})).toEqual(['a', 'b', 'c', 'd', 'e2', 'm1', 'm2']);
    });

    test.each(['CerialId', 'string', 'RecordId'])('an id given as %s selects the same people', async (form) => {
      const { m1 } = await seed();
      const operand = form === 'CerialId' ? m1 : form === 'string' ? m1.toString() : new RecordId('person', m1.id);
      expect(await names({ mentorId: operand })).toEqual(['a', 'b']);
      expect(await names({ mentor: { mentorId: operand } })).toEqual(['e']);
    });

    test('every operator selects the people pointing at what the model’s own filter selects', async () => {
      const { m1, m2 } = await seed();
      const shapes: unknown[] = [
        m1,
        m1.toString(),
        { eq: m1 },
        { neq: m1 },
        { in: [m1, m2] },
        { in: [m2] },
        { notIn: [m2] },
        { isNone: true },
        { isNone: false },
      ];
      for (const shape of shapes) expect(await names({ mentor: { mentorId: shape } })).toEqual(await expected(shape));
    });

    test('NOT and OR keep the same meaning', async () => {
      const { m1 } = await seed();
      const positive = await names({ mentor: { mentorId: m1 } });
      const all = await names({});
      expect(await names({ NOT: { mentor: { mentorId: m1 } } })).toEqual(all.filter((n) => !positive.includes(n)));
      expect(await names({ OR: [{ mentor: { mentorId: m1 } }, { name: 'd' }] })).toEqual(['d', 'e']);
    });

    test('a count through the relation agrees with findMany', async () => {
      const { m1 } = await seed();
      expect(await getClient().db.Person.count(loose({ mentor: { mentorId: m1 } }))).toBe(1);
    });
  });

  describe('an array foreign key', () => {
    // x follows nobody; y follows x; z follows x and y; w follows y; v follows z
    const seed = async (): Promise<{ x: CerialId; y: CerialId }> => {
      const { db } = getClient();
      const x = (await db.SocialUser.create({ data: { name: 'x', followingIds: [] } })).id;
      const y = (await db.SocialUser.create({ data: { name: 'y', followingIds: [x] } })).id;
      const z = (await db.SocialUser.create({ data: { name: 'z', followingIds: [x, y] } })).id;
      await db.SocialUser.create({ data: { name: 'w', followingIds: [y] } });
      await db.SocialUser.create({ data: { name: 'v', followingIds: [z] } });

      return { x, y };
    };
    const names = async (where: unknown): Promise<string[]> =>
      (await getClient().db.SocialUser.findMany({ where: loose(where), orderBy: { name: 'asc' } })).map((u) => u.name);

    test('some, none and every through the relation, with has on the related row’s array', async () => {
      const { x } = await seed();
      // the users following someone who follows x (y and z): z follows y, w follows y, v follows z
      expect(await names({ following: { some: { followingIds: { has: x } } } })).toEqual(['v', 'w', 'z']);
      expect(await names({ following: { none: { followingIds: { has: x } } } })).toEqual(['x', 'y']);
    });

    test.each(['has', 'hasAny', 'hasAll'])('%s accepts a CerialId, a string and a RecordId', async (op) => {
      const { x } = await seed();
      const forms = [x, x.toString(), new RecordId('social_user', x.id)];
      for (const form of forms) {
        const shape = { [op]: op === 'has' ? form : [form] };
        expect(await names({ following: { some: { followingIds: shape } } })).toEqual(['v', 'w', 'z']);
      }
    });
  });
});
