/**
 * Nested connect and set inside a `$transaction(async (tx) => ...)` callback, written through `tx` and through
 * `client.db` (which the callback's scope routes onto the transaction). A missing target is a
 * CerialValidationError; what the caller does after catching it decides what commits.
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

describe('E2E nested target check: $transaction callback mode', () => {
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

  const clashSeed = async () => {
    await seedTag(client, 't1');
    await client.db.BasicsUser.create({ data: { ...userData, id: 'taken', email: 'taken@x.io' } });
  };

  for (const route of ['tx', 'client.db'] as const) {
    describe(`written through ${route}`, () => {
      const run = <T>(body: (models: typeof client.db) => Promise<T>) =>
        client.$transaction((tx) => body(route === 'tx' ? tx : client.db));

      describe('present targets', () => {
        for (const c of positives) {
          test(c.name, async () => {
            await c.seed(client);
            await run(async (m) => {
              await c.write(m);
            });

            expect(await c.verify(client)).toBe(true);
          });
        }
      });

      describe('missing targets', () => {
        for (const c of negatives) {
          test(`${c.name}: uncaught, refused and the earlier write rolled back`, async () => {
            await c.seed(client);
            await expectRefused(
              () =>
                run(async (m) => {
                  await marker(m);
                  await c.write(m);
                }),
              c.expected,
            );

            expect(await c.unchanged(client)).toBe(true);
            expect(await markerPresent(client)).toBe(false);
          });

          test(`${c.name}: caught, the callback carries on and its other write commits`, async () => {
            await c.seed(client);
            const caught = await run(async (m) => {
              const error = await rejection(() => c.write(m));
              await marker(m);

              return error;
            });

            expect(caught).toBeInstanceOf(CerialValidationError);
            expect(await c.unchanged(client)).toBe(true);
            expect(await markerPresent(client)).toBe(true);
          });
        }
      });

      describe('a write that fails partway', () => {
        test('negative: a unique clash after the connect check passed, caught, cannot be committed half-written', async () => {
          await clashSeed();
          const attempt = run(async (m) => {
            await rejection(() =>
              m.BasicsUser.create({ data: { ...userData, id: 'u1', email: 'taken@x.io', tags: { connect: ['t1'] } } }),
            );
            await marker(m);
          });

          await expect(attempt).rejects.toThrow();
          expect(await markerPresent(client)).toBe(false);
          expect(await client.db.BasicsUser.findOne({ where: { id: 'u1' } })).toBeNull();
        });
      });
    });
  }
});
