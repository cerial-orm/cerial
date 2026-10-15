/**
 * E2E Tests for field decorators and type wrappers on a nested create
 *
 * A row created through a nested `create` must match the row the plain create writes for the same
 * input: @default, @defaultAlways, @createdAt, @updatedAt, @now, @uuid, @uuid7 and the Date, Decimal
 * and Duration wrappers. Each path (forward single, forward array, reverse) runs in every
 * `$transaction` mode. Array mode runs the compiled query, so it is covered separately from the
 * direct call.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialUuid } from 'cerial';
import type { NcDoc } from '../generated';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const TABLES = tables.nestedCreateDecorators;

const docData = {
  label: 'doc',
  amount: 19.99,
  span: '1h30m',
  stamp: new Date('2024-03-04T05:06:07.000Z'),
  tags: ['a', 'b'],
};

/** What a row holds, with the values that differ per write (ids, clocks, generated uuids) reduced to their kind. */
const shape = (row: NcDoc | null | undefined) => {
  if (!row) throw new Error('expected the row to exist');

  return {
    label: row.label,
    note: row.note,
    always: row.always,
    createdAt: row.createdAt instanceof Date,
    updatedAt: row.updatedAt instanceof Date,
    seenAt: row.seenAt instanceof Date,
    token: CerialUuid.is(row.token),
    tokenV7: CerialUuid.is(row.tokenV7),
    amount: row.amount.toString(),
    span: row.span.toString(),
    stamp: row.stamp instanceof Date ? row.stamp.toISOString() : row.stamp,
    tags: row.tags,
  };
};

describe('E2E Nested create decorators', () => {
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

  const plainShape = async () => shape(await client.db.NcDoc.create({ data: docData }));

  type Path = 'forward single' | 'forward array' | 'reverse';
  type Models = typeof client.db;
  const paths: Array<{
    path: Path;
    nested: (m: Models) => ReturnType<Models['NcHolder']['create']> | ReturnType<Models['NcGroup']['create']>;
  }> = [
    { path: 'forward single', nested: (m) => m.NcHolder.create({ data: { name: 'h', doc: { create: docData } } }) },
    { path: 'forward array', nested: (m) => m.NcGroup.create({ data: { name: 'g', docs: { create: [docData] } } }) },
    {
      path: 'reverse',
      nested: (m) => m.NcHolder.create({ data: { name: 'h', reverseDocs: { create: [docData] } } }),
    },
  ];

  /** The one nested row, read back after the write so every mode is compared on what is stored. */
  const storedNested = async () => {
    const rows = await client.db.NcDoc.findMany({ where: { label: 'doc' } });
    expect(rows).toHaveLength(1);

    return shape(rows[0]);
  };

  for (const { path, nested } of paths) {
    describe(path, () => {
      test('direct call matches the plain create', async () => {
        const expected = await plainShape();
        await truncateTables(client, TABLES);

        await nested(client.db);

        expect(await storedNested()).toEqual(expected);
      });

      test('$transaction array mode matches the plain create', async () => {
        const expected = await plainShape();
        await truncateTables(client, TABLES);

        await client.$transaction([nested(client.db)]);

        expect(await storedNested()).toEqual(expected);
      });

      test('$transaction callback mode matches the plain create', async () => {
        const expected = await plainShape();
        await truncateTables(client, TABLES);

        await client.$transaction(async (tx) => {
          await nested(tx);
        });

        expect(await storedNested()).toEqual(expected);
      });

      test('$transaction manual mode matches the plain create', async () => {
        const expected = await plainShape();
        await truncateTables(client, TABLES);

        const txn = await client.$transaction();
        await nested(txn);
        await txn.commit();

        expect(await storedNested()).toEqual(expected);
      });
    });
  }

  test('the plain control carries the decorator values the shape compares', async () => {
    const expected = await plainShape();

    expect(expected).toEqual({
      label: 'doc',
      note: 'fresh',
      always: 'reset',
      createdAt: true,
      updatedAt: true,
      seenAt: true,
      token: true,
      tokenV7: true,
      amount: '19.99',
      span: '1h30m',
      stamp: '2024-03-04T05:06:07.000Z',
      tags: ['a', 'b'],
    });
  });

  test('an explicit @default, @defaultAlways and uuid on a nested create is kept or reset as in a plain create', async () => {
    const token = '550e8400-e29b-41d4-a716-446655440000';
    await client.db.NcHolder.create({
      data: { name: 'h', doc: { create: { ...docData, note: 'mine', always: 'ignored', token } } },
    });
    const nested = await client.db.NcDoc.findOne({ where: { label: 'doc' } });
    await truncateTables(client, TABLES);
    const plain = await client.db.NcDoc.create({ data: { ...docData, note: 'mine', always: 'ignored', token } });

    expect(nested?.note).toBe(plain.note);
    expect(nested?.always).toBe(plain.always);
    expect(nested?.token?.toString()).toBe(token);
  });
});
