/**
 * E2E Tests for field decorators on nested-operation updates
 *
 * A write that carries a nested relation op must treat `@updatedAt`, `@readonly` and partial object
 * data exactly as the same write without it. Every case runs the nested call and a plain control on
 * a fresh seed and asserts they agree.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = [...tables.extendsRelations, ...tables.readonly, ...tables.relationWithObjects];

/** Narrows a row the test just created: a missing one is a broken setup, not a failed assertion. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`expected ${what} to exist`);

  return value;
}

/** `@updatedAt` is optional on the generated type, so both the row and the field need narrowing. */
const updatedAtMs = (row: { updatedAt?: Date } | null | undefined, what: string): number =>
  must(must(row, what).updatedAt, `${what}.updatedAt`).getTime();

describe('E2E Nested update decorators', () => {
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
  });

  // The two timestamps are written 25ms apart, so a bump shows as a strictly later value
  const pause = () => new Promise((resolve) => setTimeout(resolve, 25));

  describe('@updatedAt', () => {
    const seedProject = async () => {
      await client.db.ExtRelBlogAuthor.create({ data: { id: 'a1', name: 'a1', email: 'a1@x.io' } });
      const project = await client.db.ExtRelProject.create({ data: { id: 'p1', name: 'p1' } });
      await pause();

      return must(project, 'seeded project');
    };

    test('updateUnique with a nested connect bumps updatedAt, as the plain call does', async () => {
      const before = await seedProject();
      const nested = await client.db.ExtRelProject.updateUnique({
        where: { id: 'p1' },
        data: { name: 'n', owner: { connect: 'a1' } },
      });
      const linked = (await client.db.ExtRelProject.findOne({ where: { id: 'p1' } }))?.ownerId?.toString();

      await truncateTables(client, TABLES);
      await seedProject();
      const plain = await client.db.ExtRelProject.updateUnique({ where: { id: 'p1' }, data: { name: 'n' } });

      expect(updatedAtMs(plain, 'plain')).toBeGreaterThan(updatedAtMs(before, 'before'));
      expect(updatedAtMs(nested, 'nested')).toBeGreaterThan(updatedAtMs(before, 'before'));
      expect(linked).toContain('a1');
    });

    test('updateMany with a nested connect bumps updatedAt, as the plain call does', async () => {
      const before = await seedProject();
      await client.db.ExtRelProject.updateMany({
        where: { id: 'p1' },
        data: { name: 'n', owner: { connect: 'a1' } },
      });
      const nested = await client.db.ExtRelProject.findOne({ where: { id: 'p1' } });

      expect(updatedAtMs(nested, 'nested')).toBeGreaterThan(updatedAtMs(before, 'before'));
      expect(nested!.name).toBe('n');
    });

    test('a nested disconnect alone with other data bumps updatedAt', async () => {
      await seedProject();
      await client.db.ExtRelProject.updateUnique({ where: { id: 'p1' }, data: { owner: { connect: 'a1' } } });
      const before = await client.db.ExtRelProject.findOne({ where: { id: 'p1' } });
      await pause();
      await client.db.ExtRelProject.updateUnique({
        where: { id: 'p1' },
        data: { name: 'n2', owner: { disconnect: true } },
      });
      const after = await client.db.ExtRelProject.findOne({ where: { id: 'p1' } });

      expect(after!.ownerId).toBeUndefined();
      expect(updatedAtMs(after, 'after')).toBeGreaterThan(updatedAtMs(before, 'before'));
    });

    test('an explicit updatedAt in the data is kept, as the plain call keeps it', async () => {
      await seedProject();
      const when = new Date('2001-02-03T04:05:06.000Z');
      const nested = await client.db.ExtRelProject.updateUnique({
        where: { id: 'p1' },
        data: { updatedAt: when, owner: { connect: 'a1' } },
      });

      await truncateTables(client, TABLES);
      await seedProject();
      const plain = await client.db.ExtRelProject.updateUnique({ where: { id: 'p1' }, data: { updatedAt: when } });

      expect(updatedAtMs(plain, 'plain')).toBe(when.getTime());
      expect(updatedAtMs(nested, 'nested')).toBe(when.getTime());
    });
  });

  describe('@readonly', () => {
    const seed = async () => {
      const a1 = await client.db.ReadonlyTest.create({
        data: { name: 'a1', code: 'A1', address: { street: 's', city: 'c' } },
      });
      const a2 = await client.db.ReadonlyTest.create({
        data: { name: 'a2', code: 'A2', address: { street: 's', city: 'c' } },
      });
      const post = await client.db.ReadonlyRecord.create({ data: { name: 'p', authorId: a1.id } });

      return { a1, a2, post };
    };

    test('a nested update that does not touch the relation leaves the readonly FK alone', async () => {
      const { a1, post } = await seed();
      const updated = await client.db.ReadonlyRecord.updateUnique({
        where: { id: post.id },
        data: { name: 'renamed' },
      });

      expect(updated!.name).toBe('renamed');
      expect(updated!.authorId!.toString()).toBe(a1.id.toString());
    });

    test('writing the readonly FK beside a nested op is rejected, as without the nested op', async () => {
      const { a2, post } = await seed();

      expect(() => {
        client.db.ReadonlyRecord.updateUnique({
          where: { id: post.id },
          // @ts-expect-error: authorId is excluded from the Update type (readonly Record)
          data: { authorId: a2.id, author: { connect: a2.id } },
        });
      }).toThrow("readonly field 'authorId'");
    });

    test('connecting a different author is refused by the database and leaves the readonly FK', async () => {
      const { a1, a2, post } = await seed();

      await expect(
        (async () => {
          await client.db.ReadonlyRecord.updateUnique({
            where: { id: post.id },
            // @ts-expect-error — the readonly FK's relation is excluded from the Update type, testing the database refusal
            data: { name: 'x', author: { connect: a2.id } },
          });
        })(),
      ).rejects.toThrow('readonly');
      const stored = await client.db.ReadonlyRecord.findOne({ where: { id: post.id } });

      expect(stored!.authorId!.toString()).toBe(a1.id.toString());
      expect(stored!.name).toBe('p');
    });
  });

  describe('partial object data', () => {
    const seedCompanies = async () => {
      await client.db.RelObjCompany.create({
        data: {
          id: 'c1',
          name: 'c1',
          headquarters: { street: 's', city: 'c', state: 'st', zipCode: 'z' },
          meta: { industry: 'tech', founded: 1999 },
        },
      });
      await client.db.RelObjEmployee.create({
        data: { id: 'e1', name: 'e1', homeAddress: { street: 's', city: 'c', state: 'st' }, companyId: 'c1' },
      });
    };

    const company = async () => {
      const c = await client.db.RelObjCompany.findOne({ where: { id: 'c1' } });

      return { meta: c?.meta, headquarters: c?.headquarters };
    };

    test('a partial optional object merges with the stored one, as the plain call does', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({
        where: { id: 'c1' },
        data: { meta: { industry: 'fin' }, employees: { connect: ['e1'] } },
      });
      const nested = await company();

      await truncateTables(client, TABLES);
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({ where: { id: 'c1' }, data: { meta: { industry: 'fin' } } });
      const plain = await company();

      expect(plain.meta).toEqual({ industry: 'fin', founded: 1999 });
      expect(nested).toEqual(plain);
    });

    test('a partial required object merges with the stored one, as the plain call does', async () => {
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({
        where: { id: 'c1' },
        data: { headquarters: { city: 'new' }, employees: { connect: ['e1'] } },
      });
      const nested = await company();

      await truncateTables(client, TABLES);
      await seedCompanies();
      await client.db.RelObjCompany.updateUnique({ where: { id: 'c1' }, data: { headquarters: { city: 'new' } } });
      const plain = await company();

      expect(plain.headquarters).toEqual({ street: 's', city: 'new', state: 'st', zipCode: 'z' });
      expect(nested).toEqual(plain);
    });
  });
});
