/**
 * E2E Foreign keys to a Record(uuid) model
 *
 * A uuid string given for a foreign key is stored as the Uuid key the target row really has, so the
 * include finds the target, where eq, neq and in match exactly the named rows, and connect, disconnect and
 * set keep the same keys. A string that is not a uuid is refused naming the field.
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

const loose = (value: unknown): never => value as never;
const A = '0190c3f8-6c5d-7a3a-9d3a-00000000000a';
const B = '0190c3f8-6c5d-7a3a-9d3a-00000000000b';
const C = '0190c3f8-6c5d-7a3a-9d3a-00000000000c';

const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

describe('E2E Foreign keys to a Record(uuid) model', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.uuidFk);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.uuidFk);
    for (const [id, label] of [
      [A, 'a'],
      [B, 'b'],
      [C, 'c'],
    ] as const) {
      await client.db.UuidFkTarget.create({ data: loose({ id, label }) });
    }
  });

  describe('single foreign key', () => {
    beforeEach(async () => {
      await client.db.UuidFkOwner.create({ data: loose({ targetId: A, note: 'on-a' }) });
      await client.db.UuidFkOwner.create({ data: loose({ targetId: B, note: 'on-b' }) });
      await client.db.UuidFkOwner.create({ data: loose({ targetId: C, note: 'on-c' }) });
    });

    const notes = async (where: unknown) =>
      (await client.db.UuidFkOwner.findMany({ where: loose(where), orderBy: { note: 'asc' } })).map((r) => r.note);

    test('create from a uuid string stores a key the include resolves', async () => {
      const rows = await client.db.UuidFkOwner.findMany({ include: { target: true }, orderBy: { note: 'asc' } });
      expect(rows.map((r) => r.target?.label)).toEqual(['a', 'b', 'c']);
    });

    test('eq matches exactly the named row', async () => {
      expect(await notes({ targetId: A })).toEqual(['on-a']);
      expect(await notes({ targetId: { eq: B } })).toEqual(['on-b']);
    });

    test('neq and NOT keep every other row', async () => {
      expect(await notes({ targetId: { neq: A } })).toEqual(['on-b', 'on-c']);
      expect(await notes({ NOT: { targetId: A } })).toEqual(['on-b', 'on-c']);
    });

    test('in and notIn match the listed rows', async () => {
      expect(await notes({ targetId: { in: [A, C] } })).toEqual(['on-a', 'on-c']);
      expect(await notes({ targetId: { notIn: [A, C] } })).toEqual(['on-b']);
    });

    test('an upper-case uuid names the same row', async () => {
      expect(await notes({ targetId: A.toUpperCase() })).toEqual(['on-a']);
    });

    test('the target id read back matches the same way', async () => {
      const [first] = await client.db.UuidFkOwner.findMany({ where: loose({ targetId: A }) });
      expect(await notes({ targetId: first!.targetId })).toEqual(['on-a']);
    });

    test('a string that is not a uuid is refused naming the field on create and where', async () => {
      await refuses(() => client.db.UuidFkOwner.create({ data: loose({ targetId: 'nope', note: 'x' }) }), /targetId/);
      await refuses(() => client.db.UuidFkOwner.findMany({ where: loose({ targetId: 'nope' }) }), /targetId/);
      expect(await client.db.UuidFkOwner.count()).toBe(3);
    });

    test('a relation filter through the key finds the target', async () => {
      expect(await notes({ target: { label: 'b' } })).toEqual(['on-b']);
    });

    test('the reverse include lists the owners of one target', async () => {
      const target = await client.db.UuidFkTarget.findUnique({ where: loose({ id: A }), include: { owners: true } });
      expect(target?.owners.map((o) => o.note)).toEqual(['on-a']);
    });
  });

  describe('optional foreign key: connect and disconnect', () => {
    test('create with a nested connect from a uuid string stores a resolvable key', async () => {
      await client.db.UuidFkOptional.create({ data: loose({ note: 'n', target: { connect: A } }) });
      const [row] = await client.db.UuidFkOptional.findMany({ include: { target: true } });
      expect(row!.target?.label).toBe('a');
      expect(await client.db.UuidFkOptional.count(loose({ targetId: A }))).toBe(1);
    });

    test('update connect moves the key and disconnect clears it', async () => {
      const row = await client.db.UuidFkOptional.create({ data: loose({ note: 'n', targetId: A }) });
      await client.db.UuidFkOptional.updateUnique({ where: { id: row.id }, data: loose({ target: { connect: B } }) });
      expect(await client.db.UuidFkOptional.count(loose({ targetId: B }))).toBe(1);
      expect(await client.db.UuidFkOptional.count(loose({ targetId: A }))).toBe(0);

      await client.db.UuidFkOptional.updateUnique({ where: { id: row.id }, data: { target: { disconnect: true } } });
      expect(await client.db.UuidFkOptional.count(loose({ targetId: B }))).toBe(0);
      expect(await client.db.UuidFkOptional.count(loose({ NOT: { targetId: B } }))).toBe(1);
    });

    test('a connect to a string that is not a uuid is refused and changes nothing', async () => {
      const row = await client.db.UuidFkOptional.create({ data: loose({ note: 'n', targetId: A }) });
      await refuses(
        () =>
          client.db.UuidFkOptional.updateUnique({
            where: { id: row.id },
            data: loose({ target: { connect: 'nope' } }),
          }),
        /./,
      );
      expect(await client.db.UuidFkOptional.count(loose({ targetId: A }))).toBe(1);
    });
  });

  describe('foreign key array', () => {
    const labels = async () => {
      const [row] = await client.db.UuidFkMulti.findMany({ where: { note: 'multi' }, include: { targets: true } });

      return row!.targets.map((t) => t.label).sort();
    };

    beforeEach(async () => {
      await client.db.UuidFkMulti.create({ data: loose({ targetIds: [A, B], note: 'multi' }) });
      await client.db.UuidFkMulti.create({ data: loose({ targetIds: [C], note: 'other' }) });
    });

    test('create from uuid strings stores keys the include resolves', async () => {
      const rows = await client.db.UuidFkMulti.findMany({ include: { targets: true }, orderBy: { note: 'asc' } });
      expect(rows.map((r) => r.targets.length)).toEqual([2, 1]);
    });

    test('has, hasAny, hasAll match the named keys exactly', async () => {
      const notes = async (where: unknown) =>
        (await client.db.UuidFkMulti.findMany({ where: loose(where), orderBy: { note: 'asc' } })).map((r) => r.note);
      expect(await notes({ targetIds: { has: A } })).toEqual(['multi']);
      expect(await notes({ targetIds: { hasAny: [B, C] } })).toEqual(['multi', 'other']);
      expect(await notes({ targetIds: { hasAll: [A, B] } })).toEqual(['multi']);
      expect(await notes({ targetIds: { hasAll: [A, C] } })).toEqual([]);
    });

    test('connect, disconnect and set keep uuid keys', async () => {
      const row = (await client.db.UuidFkMulti.findMany({ where: loose({ note: 'multi' }) }))[0]!;
      await client.db.UuidFkMulti.updateUnique({ where: { id: row.id }, data: loose({ targets: { connect: C } }) });
      expect(await labels()).toEqual(['a', 'b', 'c']);

      await client.db.UuidFkMulti.updateUnique({
        where: { id: row.id },
        data: loose({ targets: { disconnect: [A] } }),
      });
      expect(await labels()).toEqual(['b', 'c']);

      await client.db.UuidFkMulti.updateUnique({ where: { id: row.id }, data: loose({ targets: { set: [A] } }) });
      expect(await labels()).toEqual(['a']);
      expect(await client.db.UuidFkMulti.count(loose({ targetIds: { has: A } }))).toBe(1);
    });

    test('a push of a uuid string stores a resolvable key', async () => {
      const row = (await client.db.UuidFkMulti.findMany({ where: loose({ note: 'other' }) }))[0]!;
      await client.db.UuidFkMulti.updateUnique({ where: { id: row.id }, data: loose({ targetIds: { push: A } }) });
      const after = await client.db.UuidFkMulti.findUnique({ where: { id: row.id }, include: { targets: true } });
      expect(after!.targets.map((t) => t.label).sort()).toEqual(['a', 'c']);
    });

    test('a where element that is not a uuid is refused naming the field', async () => {
      await refuses(
        () => client.db.UuidFkMulti.findMany({ where: loose({ targetIds: { has: 'nope' } }) }),
        /targetIds/,
      );
    });
  });
});
