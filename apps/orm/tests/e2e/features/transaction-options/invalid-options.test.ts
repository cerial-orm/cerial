/**
 * E2E Transactions: a bad option value is a CerialValidationError that names the option, in every mode,
 * and nothing is executed. The server would take `'read committed'` and silently run `snapshot`, so
 * Cerial must refuse it itself. Each refusal pairs with the valid neighbour value succeeding.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import {
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  type CerialClient,
} from '../../test-helper';
import { caught, MODES, newUser, runIn, runInUnchecked, type Mode } from './helpers';

describe('E2E Transaction options: invalid values', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  /** Runs a create under options the type system refuses. */
  const runInvalid = (mode: Mode, options: Record<string, unknown>) =>
    runInUnchecked(client, mode, options, [(db) => db.BasicsUser.create({ data: newUser('refused') })]);

  const badIsolation: [string, unknown][] = [
    ["'read committed'", 'read committed'],
    ["'repeatable read'", 'repeatable read'],
    ["'bogus'", 'bogus'],
    ['empty string', ''],
    ['a number', 1],
    ['null', null],
    ['a boolean', true],
    ['an object', { level: 'snapshot' }],
  ];
  const badReadOnly: [string, unknown][] = [
    ["the string 'true'", 'true'],
    ['the number 1', 1],
    ['the number 0', 0],
    ['null', null],
    ['an object', {}],
  ];

  describe.each(MODES)('%s mode', (mode) => {
    test.each(badIsolation)('negative: isolation %s is refused naming "isolation"', async (_label, value) => {
      const error = await caught(() => runInvalid(mode, { isolation: value }));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain('isolation');
      expect(await client.db.BasicsUser.count()).toBe(0);
    });

    test.each(badReadOnly)('negative: readOnly %s is refused naming "readOnly"', async (_label, value) => {
      const error = await caught(() => runInvalid(mode, { readOnly: value }));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain('readOnly');
      expect(await client.db.BasicsUser.count()).toBe(0);
    });

    test('negative: a valid readOnly beside a bad isolation is still refused, naming isolation', async () => {
      const error = await caught(() => runInvalid(mode, { isolation: 'bogus', readOnly: true }));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain('isolation');
    });

    test('negative: a bad readOnly beside a valid isolation is still refused, naming readOnly', async () => {
      const error = await caught(() => runInvalid(mode, { isolation: 'serializable', readOnly: 'yes' }));

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain('readOnly');
    });

    test('positive: a refusal does not poison the next transaction on the same client', async () => {
      await caught(() => runInvalid(mode, { isolation: 'read committed' }));

      await runIn(client, mode, { isolation: 'serializable' }, [(db) => db.BasicsUser.create({ data: newUser('ok') })]);

      expect(await client.db.BasicsUser.count()).toBe(1);
    });

    test("positive: the valid neighbours 'snapshot' and 'serializable' are accepted", async () => {
      await runIn(client, mode, { isolation: 'snapshot' }, [(db) => db.BasicsUser.create({ data: newUser('a') })]);
      await runIn(client, mode, { isolation: 'serializable' }, [(db) => db.BasicsUser.create({ data: newUser('b') })]);

      expect(await client.db.BasicsUser.count()).toBe(2);
    });
  });

  describe('callback mode: the callback never runs', () => {
    test('negative: a bad isolation does not call the callback', async () => {
      let called = false;

      const error = await caught(() =>
        client.$transaction(
          () => {
            called = true;
          },
          // @ts-expect-error -- negative test: 'read committed' is not an isolation level
          { isolation: 'read committed' },
        ),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(called).toBe(false);
    });

    test('negative: a bad readOnly does not call the callback', async () => {
      let called = false;

      const error = await caught(() =>
        client.$transaction(
          () => {
            called = true;
          },
          // @ts-expect-error -- negative test: readOnly must be a boolean
          { readOnly: 'true' },
        ),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(called).toBe(false);
    });
  });

  describe('array mode: no item runs, even a function item', () => {
    test('negative: a bad isolation runs neither the queries nor a function item', async () => {
      let called = false;

      const error = await caught(() =>
        client.$transaction(
          // @ts-expect-error -- negative test: 'bogus' is not an isolation level
          [
            client.db.BasicsUser.create({ data: newUser('refused') }),
            () => {
              called = true;

              return 1;
            },
          ],
          { isolation: 'bogus' },
        ),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect(called).toBe(false);
      expect(await client.db.BasicsUser.count()).toBe(0);
    });

    test('negative: a bad readOnly is refused for an empty item list too', async () => {
      const error = await caught(() =>
        // @ts-expect-error -- negative test: readOnly must be a boolean
        client.$transaction([], { readOnly: 1 }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
    });
  });

  describe('manual mode: unknown keys', () => {
    test.each(['foo', 'max_staleness', 'read_only', 'retries', 'timeout', 'backoff'])(
      'negative: key %s is refused by name and no transaction is begun',
      async (key) => {
        const error = await caught(() => client.$transaction({ [key]: 1 }));

        expect(error).toBeInstanceOf(CerialValidationError);
        expect((error as CerialValidationError).message).toContain(key);
      },
    );

    test('negative: a known option beside an unknown key is refused', async () => {
      const error = await caught(() =>
        // @ts-expect-error -- negative test: 'extra' is not a begin option
        client.$transaction({ isolation: 'serializable', extra: true }),
      );

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).message).toContain('extra');
    });

    test('positive: the two begin options alone are accepted', async () => {
      const tx = await client.$transaction({ isolation: 'serializable', readOnly: true });
      await tx.commit();
    });
  });
});
