/**
 * Nested connect and set inside `$transaction([...])`: a missing target is a CerialValidationError with the
 * standalone message and fields, and the whole transaction rolls back.
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
import { expectRefused, rejection, seedTag, seedUser, userData } from './helpers';
import { marker, markerPresent, negatives, positives } from './transaction-cases';

const TABLES = tables.basics;

describe('E2E nested target check: $transaction array mode', () => {
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
        await client.$transaction([c.write(client.db)]);

        expect(await c.verify(client)).toBe(true);
      });
    }
  });

  describe('missing targets', () => {
    for (const c of negatives) {
      test(`${c.name}: refused as a validation error and the earlier item is rolled back`, async () => {
        await c.seed(client);
        await expectRefused(() => client.$transaction([marker(client.db), c.write(client.db)]), c.expected);

        expect(await c.unchanged(client)).toBe(true);
        expect(await markerPresent(client)).toBe(false);
      });
    }

    test('an item after the refused one never lands either', async () => {
      await seedUser(client);
      const error = await rejection(() =>
        client.$transaction([
          client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
          marker(client.db),
        ]),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(await markerPresent(client)).toBe(false);
    });

    test('a function item that returns a refused write rolls the transaction back the same way', async () => {
      await seedUser(client);
      const error = await rejection(() =>
        client.$transaction([
          marker(client.db),
          () => client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
        ]),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(await markerPresent(client)).toBe(false);
    });

    test('control: the same two items with a present target commit both', async () => {
      await seedUser(client);
      await seedTag(client, 't1');
      await client.$transaction([
        marker(client.db),
        client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['t1'] } } }),
      ]);

      expect(await markerPresent(client)).toBe(true);
    });

    test('an empty connect list and set: [] issue no check and commit', async () => {
      await client.$transaction([
        client.db.BasicsUser.create({ data: { ...userData, id: 'u1', tags: { connect: [] } } }),
        client.db.BasicsUser.updateUnique({ where: { id: 'u1' }, data: { tags: { set: [] } } }),
      ]);

      expect(await client.db.BasicsUser.count()).toBe(1);
    });
  });
});
