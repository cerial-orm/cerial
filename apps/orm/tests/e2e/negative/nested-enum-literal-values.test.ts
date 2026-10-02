/**
 * E2E Tests: enum and literal values nested in objects and tuples
 *
 * A value outside the variant set is rejected before any query is sent, at depth 1, 2 and 3, through
 * object fields, tuple elements and the array forms of both, on create and on every update entry point.
 * The message names the permitted values and the dotted path from the model root.
 *
 * Schema: nested-membership.cerial
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const GRADE = "must be one of: 'LOW', 'MID', 'HIGH'";
const CODE = "must be one of: 'a1', 'b2', 7";

describe('Nested enum and literal values — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.nestedMembership);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.nestedMembership);
  });

  describe('objects', () => {
    test('create at depth 1 names the path and the permitted values', () => {
      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade, testing runtime guard
        client.db.NmObjectDoc.create({ data: { name: 'A', leaf: { grade: 'NOPE' } } });
      }).toThrow(`Invalid data: leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('create at depth 2', () => {
      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmObjectDoc.create({ data: { name: 'A', mid: { label: 'l', leaf: { grade: 'NOPE' } } } });
      }).toThrow(`mid.leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('create at depth 3', () => {
      expect(() => {
        client.db.NmObjectDoc.create({
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { name: 'A', top: { title: 't', mid: { label: 'l', leaf: { grade: 'NOPE' } } } },
        });
      }).toThrow(`top.mid.leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('create rejects a literal with mixed variants', () => {
      expect(() => {
        // @ts-expect-error — 8 is not a NmCode
        client.db.NmObjectDoc.create({ data: { name: 'A', leaf: { grade: 'LOW', code: 8 } } });
      }).toThrow(`leaf.code ${CODE} (received 8)`);
    });

    test('create in an array of objects names the index', () => {
      expect(() => {
        client.db.NmObjectDoc.create({
          data: {
            name: 'A',
            leaves: [
              { grade: 'LOW' },
              // @ts-expect-error — 'NOPE' is not a NmGrade
              { grade: 'NOPE' },
            ],
          },
        });
      }).toThrow(`leaves[1].grade ${GRADE} (received 'NOPE')`);
    });

    test('create in an array of objects at depth 3', () => {
      expect(() => {
        client.db.NmObjectDoc.create({
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { name: 'A', tops: [{ title: 't', mid: { label: 'l', leaf: { grade: 'NOPE' } } }] },
        });
      }).toThrow(`tops[0].mid.leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('updateUnique rejects a partial merge at depth 1, 2 and 3 and leaves the record untouched', async () => {
      const created = await client.db.NmObjectDoc.create({
        data: { name: 'A', top: { title: 't', mid: { label: 'l', leaf: { grade: 'LOW' } } } },
      });

      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmObjectDoc.updateUnique({ where: { id: created.id }, data: { leaf: { grade: 'NOPE' } } });
      }).toThrow(`Invalid data: leaf.grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmObjectDoc.updateUnique({ where: { id: created.id }, data: { mid: { leaf: { grade: 'NOPE' } } } });
      }).toThrow(`mid.leaf.grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmObjectDoc.updateUnique({
          where: { id: created.id },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { top: { mid: { leaf: { grade: 'NOPE' } } } },
        });
      }).toThrow(`top.mid.leaf.grade ${GRADE} (received 'NOPE')`);

      const after = await client.db.NmObjectDoc.findUnique({ where: { id: created.id } });
      expect(after?.top?.mid.leaf.grade).toBe('LOW');
    });

    test('updateMany rejects a bad nested value', async () => {
      await client.db.NmObjectDoc.create({ data: { name: 'A', leaf: { grade: 'LOW' } } });

      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmObjectDoc.updateMany({ where: { name: 'A' }, data: { leaf: { grade: 'NOPE' } } });
      }).toThrow(`leaf.grade ${GRADE} (received 'NOPE')`);

      expect((await client.db.NmObjectDoc.findOne({ where: { name: 'A' } }))?.leaf?.grade).toBe('LOW');
    });

    test('upsert rejects a bad nested value in the create half and in the update half', () => {
      expect(() => {
        client.db.NmObjectDoc.upsert({
          where: { name: 'A' },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          create: { name: 'A', leaf: { grade: 'NOPE' } },
          update: { name: 'A' },
        });
      }).toThrow(`leaf.grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmObjectDoc.upsert({
          where: { name: 'A' },
          create: { name: 'A' },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          update: { leaf: { grade: 'NOPE' } },
        });
      }).toThrow(`leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('updateMany rejects a bad value in { push } and { set } on an array of objects', () => {
      expect(() => {
        client.db.NmObjectDoc.updateMany({
          where: { name: 'A' },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { leaves: { push: { grade: 'NOPE' } } },
        });
      }).toThrow(`leaves.push[0].grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmObjectDoc.updateMany({
          where: { name: 'A' },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { leaves: { set: [{ grade: 'NOPE' }] } },
        });
      }).toThrow(`leaves[0].grade ${GRADE} (received 'NOPE')`);
    });

    test('valid values at depth 3 are stored and read back', async () => {
      const created = await client.db.NmObjectDoc.create({
        data: { name: 'A', top: { title: 't', mid: { label: 'l', leaf: { grade: 'HIGH', code: 7 } } } },
      });
      expect(created.top?.mid.leaf).toEqual({ grade: 'HIGH', code: 7 });

      await client.db.NmObjectDoc.updateUnique({
        where: { id: created.id },
        data: { top: { title: 't', mid: { label: 'l', leaf: { grade: 'MID' } } } },
      });
      const after = await client.db.NmObjectDoc.findUnique({ where: { id: created.id } });
      expect(after?.top?.mid.leaf.grade).toBe('MID');
    });
  });

  describe('tuples', () => {
    test('create, array form: an object element holding an enum', () => {
      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', withLeaf: ['x', { grade: 'NOPE' }] } });
      }).toThrow(`Invalid data: withLeaf[1].grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', named: ['t', { grade: 'NOPE' }] } });
      }).toThrow(`named[1].grade ${GRADE} (received 'NOPE')`);
    });

    test('create, object form by index and by name', () => {
      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', withLeaf: { 0: 'x', 1: { grade: 'NOPE' } } } });
      }).toThrow(`withLeaf.1.grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', named: { tag: 't', leaf: { grade: 'NOPE' } } } });
      }).toThrow(`named.leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('create at depth 2: a tuple in a tuple', () => {
      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', outer: [['x', { grade: 'NOPE' }], 1] } });
      }).toThrow(`outer[0][1].grade ${GRADE} (received 'NOPE')`);
    });

    test('create at depth 2 and 3: a tuple inside one and two objects', () => {
      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', holds: { entry: ['x', { grade: 'NOPE' }] } } });
      }).toThrow(`holds.entry[1].grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmTupleDoc.create({
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { name: 'A', deepHolds: { holder: { entry: ['x', { grade: 'NOPE' }] } } },
        });
      }).toThrow(`deepHolds.holder.entry[1].grade ${GRADE} (received 'NOPE')`);
    });

    test('create in an array of tuples names the index', () => {
      expect(() => {
        client.db.NmTupleDoc.create({
          data: {
            name: 'A',
            withLeaves: [
              ['x', { grade: 'LOW' }],
              // @ts-expect-error — 'NOPE' is not a NmGrade
              ['y', { grade: 'NOPE' }],
            ],
          },
        });
      }).toThrow(`withLeaves[1][1].grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        // @ts-expect-error — 'NOPE' is not a NmGrade
        client.db.NmTupleDoc.create({ data: { name: 'A', nameds: [{ tag: 't', leaf: { grade: 'NOPE' } }] } });
      }).toThrow(`nameds[0].leaf.grade ${GRADE} (received 'NOPE')`);
    });

    test('updateUnique rejects a per-element update and a full replacement, leaving the record untouched', async () => {
      const created = await client.db.NmTupleDoc.create({
        data: { name: 'A', named: { tag: 't', leaf: { grade: 'LOW' } } },
      });

      expect(() => {
        client.db.NmTupleDoc.updateUnique({
          where: { id: created.id },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { named: { leaf: { grade: 'NOPE' } } },
        });
      }).toThrow(`Invalid data: named.leaf.grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmTupleDoc.updateUnique({
          where: { id: created.id },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { named: ['t', { grade: 'NOPE' }] },
        });
      }).toThrow(`named[1].grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmTupleDoc.updateUnique({
          where: { id: created.id },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { outer: { 0: { 1: { grade: 'NOPE' } } } },
        });
      }).toThrow(`outer.0.1.grade ${GRADE} (received 'NOPE')`);

      expect(() => {
        client.db.NmTupleDoc.updateUnique({
          where: { id: created.id },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { deepHolds: { holder: { entry: { 1: { grade: 'NOPE' } } } } },
        });
      }).toThrow(`deepHolds.holder.entry.1.grade ${GRADE} (received 'NOPE')`);

      const after = await client.db.NmTupleDoc.findUnique({ where: { id: created.id } });
      expect(after?.named).toEqual(['t', { grade: 'LOW' }]);
    });

    test('updateMany rejects a bad value pushed to an array of tuples', () => {
      expect(() => {
        client.db.NmTupleDoc.updateMany({
          where: { name: 'A' },
          // @ts-expect-error — 'NOPE' is not a NmGrade
          data: { withLeaves: { push: ['x', { grade: 'NOPE' }] } },
        });
      }).toThrow(`withLeaves.push[0][1].grade ${GRADE} (received 'NOPE')`);
    });

    test('valid values are stored and read back in every form', async () => {
      const created = await client.db.NmTupleDoc.create({
        data: {
          name: 'A',
          withLeaf: { 0: 'x', 1: { grade: 'HIGH', code: 7 } },
          named: { tag: 't', leaf: { grade: 'MID' } },
          holds: { entry: ['x', { grade: 'LOW' }] },
          withLeaves: [
            ['x', { grade: 'LOW' }],
            ['y', { grade: 'HIGH' }],
          ],
        },
      });
      expect(created.withLeaf).toEqual(['x', { grade: 'HIGH', code: 7 }]);
      expect(created.named).toEqual(['t', { grade: 'MID' }]);
      expect(created.holds?.entry).toEqual(['x', { grade: 'LOW' }]);
      expect(created.withLeaves).toEqual([
        ['x', { grade: 'LOW' }],
        ['y', { grade: 'HIGH' }],
      ]);

      await client.db.NmTupleDoc.updateUnique({
        where: { id: created.id },
        data: { named: { leaf: { grade: 'LOW' } } },
      });
      const after = await client.db.NmTupleDoc.findUnique({ where: { id: created.id } });
      expect(after?.named).toEqual(['t', { grade: 'LOW' }]);
    });
  });
});
