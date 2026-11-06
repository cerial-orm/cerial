/**
 * E2E Tests: a where that is not a plain object, and null on a reverse relation
 *
 * `[]`, `5`, `true` and (on reads) `null` used to act as an empty filter, and `{ isActive: true, posts: null }`
 * dropped the relation key, so `deleteMany` ran on every row the rest of the filter matched. Every method that
 * takes a where, the include where and the exported helpers now refuse both with a named error. The write
 * paths assert the victim rows survived.
 *
 * Schema: one-to-many optional (Publisher, Book)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { buildConditions, transformWhere, transformWhereClause } from '../../../src';
import { fragmentToQuery } from '../../../src/query/compile/fragment';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import type { WhereClause } from '../../../src/types';
import { modelRegistry } from '../generated/internal/model-registry';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

// What a JavaScript or JSON caller can send; the generated types reject it
const hostile = (value: unknown): never => value as never;

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

const NON_OBJECTS: Array<[string, unknown]> = [
  ['an empty array', []],
  ['a number', 5],
  ['true', true],
  ['false', false],
  ['a string', 'abc'],
  ['null', null],
];

const NULL_POSTS: Array<[string, unknown]> = [
  ['alone', { books: null }],
  ['beside a valid key', { name: 'Ada', books: null }],
  ['inside AND', { AND: [{ name: 'Ada' }, { books: null }] }],
  ['inside OR', { OR: [{ name: 'Ada' }, { books: null }] }],
  ['inside NOT', { NOT: { books: null } }],
];

const OBJECT_MESSAGE = 'where must be an object';
const REVERSE_MESSAGE = "'books' is a reverse relation on Publisher";

describe('Non-object where and null on a reverse relation — negative and positive cases', () => {
  let client: CerialClient;
  let adaId: unknown;

  const publisherNames = async () =>
    (await client.db.Publisher.findMany({ orderBy: { name: 'asc' } })).map((p) => p.name);
  const bookTitles = async () => (await client.db.Book.findMany({ orderBy: { title: 'asc' } })).map((b) => b.title);

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyOptional);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManyOptional);
    const ada = await client.db.Publisher.create({ data: { name: 'Ada' } });
    adaId = ada.id;
    await client.db.Publisher.create({ data: { name: 'Bob' } });
    await client.db.Publisher.create({ data: { name: 'Cy' } });
    await client.db.Book.create({ data: { title: 'A1', isbn: 'i1', publisherId: ada.id } });
    await client.db.Book.create({ data: { title: 'Free', isbn: 'i2' } });
  });

  const intact = async () => {
    expect(await publisherNames()).toEqual(['Ada', 'Bob', 'Cy']);
    expect(await bookTitles()).toEqual(['A1', 'Free']);
  };

  describe('a where that is not an object', () => {
    for (const [label, value] of NON_OBJECTS) {
      describe(label, () => {
        const w = hostile(value);

        test('reads refuse it', async () => {
          await rejects(() => client.db.Publisher.findMany({ where: w }), OBJECT_MESSAGE);
          await rejects(() => client.db.Publisher.findOne({ where: w }), OBJECT_MESSAGE);
          await rejects(() => client.db.Publisher.findUnique({ where: w }), OBJECT_MESSAGE);
          await rejects(() => client.db.Publisher.count(w), OBJECT_MESSAGE);
          await rejects(() => client.db.Publisher.exists(w), OBJECT_MESSAGE);
          await rejects(
            () => client.db.Publisher.groupBy(hostile({ by: ['name'], where: w, _count: true })),
            OBJECT_MESSAGE,
          );
          await rejects(() => client.db.Publisher.findMany({ include: { books: { where: w } } }), OBJECT_MESSAGE);
          await rejects(() => client.db.Publisher.$live({ where: w }), OBJECT_MESSAGE);
        });

        test('writes refuse it and every row survives', async () => {
          await rejects(() => client.db.Publisher.deleteMany({ where: w }), OBJECT_MESSAGE);
          await rejects(() => client.db.Publisher.updateMany({ where: w, data: { name: 'X' } }), OBJECT_MESSAGE);
          await rejects(() => client.db.Book.updateUnique({ where: w, data: { title: 'X' } }), OBJECT_MESSAGE);
          await rejects(() => client.db.Book.deleteUnique({ where: w }), OBJECT_MESSAGE);
          await rejects(
            () => client.db.Book.upsert({ where: w, create: { title: 'N', isbn: 'n' }, update: { title: 'X' } }),
            OBJECT_MESSAGE,
          );
          await intact();
        });

        test('the exported helpers refuse it', () => {
          const owner = client.db.Publisher.getMetadata();

          expect(() => transformWhere(w, owner, modelRegistry)).toThrow(OBJECT_MESSAGE);
          expect(() => transformWhereClause(w, owner, modelRegistry)).toThrow(OBJECT_MESSAGE);
          expect(() => buildConditions(createCompileContext(), w, owner, modelRegistry)).toThrow(OBJECT_MESSAGE);
        });
      });
    }
  });

  describe('null on a reverse relation', () => {
    for (const [label, value] of NULL_POSTS) {
      describe(label, () => {
        const w = hostile(value);

        test('reads refuse it', async () => {
          await rejects(() => client.db.Publisher.findMany({ where: w }), REVERSE_MESSAGE);
          await rejects(() => client.db.Publisher.findOne({ where: w }), REVERSE_MESSAGE);
          await rejects(() => client.db.Publisher.count(w), REVERSE_MESSAGE);
          await rejects(() => client.db.Publisher.exists(w), REVERSE_MESSAGE);
          await rejects(
            () => client.db.Publisher.groupBy(hostile({ by: ['name'], where: w, _count: true })),
            REVERSE_MESSAGE,
          );
        });

        test('writes refuse it and every row survives', async () => {
          await rejects(() => client.db.Publisher.deleteMany({ where: w }), REVERSE_MESSAGE);
          await rejects(() => client.db.Publisher.updateMany({ where: w, data: { name: 'X' } }), REVERSE_MESSAGE);
          await rejects(
            () =>
              client.db.Publisher.updateUnique({
                where: hostile({ id: adaId, ...(value as object) }),
                data: { name: 'X' },
              }),
            REVERSE_MESSAGE,
          );
          await rejects(
            () => client.db.Publisher.deleteUnique({ where: hostile({ id: adaId, ...(value as object) }) }),
            REVERSE_MESSAGE,
          );
          await intact();
        });

        test('the exported helpers refuse it', () => {
          const owner = client.db.Publisher.getMetadata();

          expect(() => transformWhere(w, owner, modelRegistry)).toThrow(REVERSE_MESSAGE);
          expect(() => transformWhereClause(w, owner, modelRegistry)).toThrow(REVERSE_MESSAGE);
          expect(() => buildConditions(createCompileContext(), w, owner, modelRegistry)).toThrow(REVERSE_MESSAGE);
        });
      });
    }

    test('an include where refuses it too', async () => {
      await rejects(
        () => client.db.Publisher.findMany({ include: { books: { where: hostile({ publisher: { books: null } }) } } }),
        REVERSE_MESSAGE,
      );
    });

    test('a relation filter nested in another relation refuses it', async () => {
      await rejects(
        () => client.db.Book.deleteMany({ where: hostile({ publisher: { books: null } }) }),
        REVERSE_MESSAGE,
      );
      await intact();
    });

    test('the message points at isEmpty', async () => {
      await rejects(() => client.db.Publisher.findMany({ where: hostile({ books: null }) }), 'isEmpty: true');
    });
  });

  describe('positive cases keep working', () => {
    test('isEmpty: true matches the publishers with no books', async () => {
      const rows = await client.db.Publisher.findMany({
        where: { books: { isEmpty: true } },
        orderBy: { name: 'asc' },
      });

      expect(rows.map((r) => r.name)).toEqual(['Bob', 'Cy']);
    });

    test('isEmpty: true deletes only the publishers with no books', async () => {
      await client.db.Publisher.deleteMany({ where: { books: { isEmpty: true } } });

      expect(await publisherNames()).toEqual(['Ada']);
    });

    test('null on a forward relation still means the foreign key is null', async () => {
      const rows = await client.db.Book.findMany({ where: { publisher: null } });

      expect(rows.map((r) => r.title)).toEqual(['Free']);
    });

    test('null on a forward relation still works beside another key and under NOT', async () => {
      expect((await client.db.Book.findMany({ where: { publisher: null, title: 'Free' } })).length).toBe(1);
      expect((await client.db.Book.findMany({ where: { NOT: { publisher: null } } })).map((b) => b.title)).toEqual([
        'A1',
      ]);
    });

    test('an omitted or undefined where still returns every row', async () => {
      expect((await client.db.Publisher.findMany()).length).toBe(3);
      expect((await client.db.Publisher.findMany({ where: undefined })).length).toBe(3);
      expect(await client.db.Publisher.count()).toBe(3);
      expect(await client.db.Publisher.count(undefined)).toBe(3);
      expect(await client.db.Publisher.exists(undefined)).toBe(true);
    });

    test('an empty object where still returns every row', async () => {
      expect((await client.db.Publisher.findMany({ where: {} })).length).toBe(3);
    });

    test('the exported helpers accept undefined and a valid where', () => {
      const owner = client.db.Publisher.getMetadata();
      const where: WhereClause = { name: 'Ada' };

      expect(transformWhereClause(undefined, owner, modelRegistry).text).toBe('');
      expect(transformWhereClause(where, owner, modelRegistry).text).toContain('name');
      expect(fragmentToQuery(buildConditions(createCompileContext(), where, owner, modelRegistry)).text).toContain(
        'name',
      );
    });
  });
});
