/**
 * Nested connect and set on a manual `await client.$transaction()` handle: a missing target is a
 * CerialValidationError that leaves the handle usable; `commit()` keeps what ran after it, `cancel()` keeps nothing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { expectRefused, rejection, seedTag, userData } from './helpers';
import { marker, markerPresent, negatives, positives } from './transaction-cases';

const TABLES = tables.basics;

describe('E2E nested target check: $transaction manual mode', () => {
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

  describe('present targets', () => {
    for (const c of positives) {
      test(c.name, async () => {
        await c.seed(client);
        const txn = await client.$transaction();
        await c.write(txn);
        await txn.commit();

        expect(await c.verify(client)).toBe(true);
      });
    }
  });

  describe('missing targets', () => {
    for (const c of negatives) {
      test(`${c.name}: refused, then cancel() leaves nothing of the transaction`, async () => {
        await c.seed(client);
        const txn = await client.$transaction();
        await marker(txn);
        await expectRefused(() => c.write(txn), c.expected);
        await txn.cancel();

        expect(await c.unchanged(client)).toBe(true);
        expect(await markerPresent(client)).toBe(false);
      });

      test(`${c.name}: caught, the handle carries on and commit() keeps the other write`, async () => {
        await c.seed(client);
        const txn = await client.$transaction();
        const error = await rejection(() => c.write(txn));
        await marker(txn);
        await txn.commit();

        expect(error).toBeInstanceOf(CerialValidationError);
        expect(await c.unchanged(client)).toBe(true);
        expect(await markerPresent(client)).toBe(true);
      });
    }
  });

  describe('a write that fails partway', () => {
    const seed = async () => {
      await seedTag(client, 't1');
      await client.db.BasicsUser.create({ data: { ...userData, id: 'taken', email: 'taken@x.io' } });
    };

    test('negative: a unique clash after the connect check passed, caught, makes commit() throw and keeps nothing', async () => {
      await seed();
      const txn = await client.$transaction();
      await rejection(() =>
        txn.BasicsUser.create({ data: { ...userData, id: 'u1', email: 'taken@x.io', tags: { connect: ['t1'] } } }),
      );
      await marker(txn);

      try {
        await expect((async () => txn.commit())()).rejects.toThrow();
      } finally {
        if (txn.state === 'active') await txn.cancel();
      }

      expect(await markerPresent(client)).toBe(false);
      expect(await client.db.BasicsUser.findOne({ where: { id: 'u1' } })).toBeNull();
    });
  });
});
