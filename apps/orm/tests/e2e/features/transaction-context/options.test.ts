/**
 * E2E transaction context with transaction options: `readOnly` refuses each routed write, `isolation`
 * applies to routed queries (a serializable conflict is detected, snapshot lets it through), and `retries`
 * re-run the item with a fresh scope while a straggler from the failed attempt is refused.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialTransactionError, isTransactionConflict, sql } from 'cerial';
import { Surreal } from 'surrealdb';
import { testConfig } from '../../test-helper';
import { caught, lateMessage, tagNames, useClient, wait } from './helpers';

describe('E2E transaction context: options', () => {
  const get = useClient();

  describe('readOnly', () => {
    const writes: [string, () => PromiseLike<unknown>][] = [
      ['create', () => get().db.BasicsTag.create({ data: { name: 'refused' } })],
      ['updateMany', () => get().db.BasicsTag.updateMany({ where: { name: 'seed' }, data: { name: 'changed' } })],
      ['deleteMany', () => get().db.BasicsTag.deleteMany({ where: { name: 'seed' } })],
      ['model $raw', () => get().db.BasicsTag.$raw(sql`CREATE basics_tag SET name = 'refused'`)],
      ['client $raw', () => get().$raw(sql`CREATE basics_tag SET name = 'refused'`)],
      ['client query()', () => get().query("CREATE basics_tag SET name = 'refused'")],
    ];

    test.each(writes)('negative: callback mode refuses a routed %s and writes nothing', async (name, write) => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      const error = await caught(() => client.$transaction(async () => write(), { readOnly: true }));

      // client.query() hands back the driver's own error everywhere; every other entry point maps it
      if (name !== 'client query()') {
        expect(error).toBeInstanceOf(CerialTransactionError);
        expect(error).not.toBeInstanceOf(CerialDatabaseError);
      }
      expect((error as Error).message).toContain('read only transaction');
      expect(await tagNames(client)).toEqual(['seed']);
    });

    test.each(writes)('negative: array mode refuses a routed %s and writes nothing', async (_name, write) => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      const error = await caught(() => client.$transaction([async () => write()], { readOnly: true }));

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect((error as Error).message).toContain('read only transaction');
      expect(await tagNames(client)).toEqual(['seed']);
    });

    test.each(writes.slice(0, 2))('positive: %s is accepted when readOnly is false', async (_name, write) => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      await client.$transaction(async () => write(), { readOnly: false });

      expect(await tagNames(client)).not.toEqual(['seed']);
    });

    test('positive: routed reads are allowed in a read-only transaction', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      const counts = await client.$transaction(
        async () => [await client.db.BasicsTag.count(), (await client.query('SELECT * FROM basics_tag')).length],
        { readOnly: true },
      );

      expect(counts).toEqual([1, 1]);
    });
  });

  describe('isolation and retries', () => {
    let outside: Surreal;

    beforeAll(async () => {
      outside = new Surreal();
      await outside.connect('ws://127.0.0.1:8000/rpc', {
        namespace: testConfig.namespace,
        database: testConfig.database,
        authentication: testConfig.auth,
      });
    });

    afterAll(async () => {
      await outside.close();
    });

    /** Changes the row a transaction read, from a connection that is not the client's. */
    const interfere = async (name: string): Promise<void> => {
      await outside.query('UPDATE basics_tag SET name = $name WHERE name = "seed"', { name }).collect();
    };

    /** Reads the seed tag through the client, lets `disturb` change it, then writes: a read-then-write conflict. */
    const readThenWrite = async (disturb: () => Promise<void>): Promise<void> => {
      const client = get();
      await client.db.BasicsTag.findOne({ where: { name: 'seed' } });
      await disturb();
      await client.db.BasicsTag.create({ data: { name: 'written' } });
    };

    test('serializable: a routed read invalidated by an outside write is refused at commit', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      const error = await caught(() =>
        client.$transaction(async () => readThenWrite(() => interfere('bumped')), { isolation: 'serializable' }),
      );

      expect(isTransactionConflict(error)).toBe(true);
      expect(await tagNames(client)).toEqual(['bumped']);
    });

    test('snapshot: the same sequence commits', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      await client.$transaction(async () => readThenWrite(() => interfere('bumped')), { isolation: 'snapshot' });

      expect(await tagNames(client)).toEqual(['bumped', 'written']);
    });

    test('serializable in array mode: the conflict is the cause of the rejection', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      const error = await caught(() =>
        client.$transaction([async () => readThenWrite(() => interfere('bumped'))], { isolation: 'serializable' }),
      );

      expect(isTransactionConflict((error as { cause?: unknown }).cause ?? error)).toBe(true);
      expect(await tagNames(client)).toEqual(['bumped']);
    });

    test('retries re-run the callback with a fresh scope: one attempt written, none duplicated', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      let attempts = 0;
      await client.$transaction(
        async () => {
          attempts += 1;
          await readThenWrite(attempts === 1 ? () => interfere('bumped') : async () => {});
        },
        { isolation: 'serializable', retries: 2, backoff: () => 1 },
      );

      expect(attempts).toBe(2);
      expect(await tagNames(client)).toEqual(['bumped', 'written']);
    });

    test('retries re-run an array function item with a fresh scope', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      let attempts = 0;
      await client.$transaction(
        [
          async () => {
            attempts += 1;
            await readThenWrite(attempts === 1 ? () => interfere('bumped') : async () => {});
          },
        ],
        { isolation: 'serializable', retries: 2, backoff: () => 1 },
      );

      expect(attempts).toBe(2);
      expect(await tagNames(client)).toEqual(['bumped', 'written']);
    });

    test('without retries the item runs once', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      let attempts = 0;
      await caught(() =>
        client.$transaction(
          async () => {
            attempts += 1;
            await readThenWrite(() => interfere('bumped'));
          },
          { isolation: 'serializable' },
        ),
      );

      expect(attempts).toBe(1);
    });

    test('a straggler from a failed attempt is refused and never joins the next attempt', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'seed' } });
      let attempts = 0;
      let straggler: Promise<unknown> | undefined;
      await client.$transaction(
        async () => {
          attempts += 1;
          if (attempts === 1) {
            straggler = wait(200).then(() => client.db.BasicsTag.create({ data: { name: 'straggler' } }));
            straggler.catch(() => undefined);
            await readThenWrite(() => interfere('bumped'));

            return;
          }
          await readThenWrite(async () => {});
          // Hold this attempt open past the moment the straggler fires
          await wait(400);
        },
        { isolation: 'serializable', retries: 1, backoff: () => 1 },
      );
      const error = await caught(() => straggler!);

      expect(attempts).toBe(2);
      expect((error as CerialTransactionError).message).toBe(lateMessage('BasicsTag.create', 'cancelled'));
      expect(await tagNames(client)).toEqual(['bumped', 'written']);
    });
  });
});
