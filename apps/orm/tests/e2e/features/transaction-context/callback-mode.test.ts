/**
 * E2E transaction context, callback mode: `client.db.X` inside the callback runs in its transaction, next
 * to `tx.X`. Both commit on success and roll back on a throw, and a query built outside the callback and
 * awaited inside it is routed too.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from 'cerial';
import { caught, tagNames, useClient } from './helpers';

describe('E2E transaction context: callback mode', () => {
  const get = useClient();

  describe('commit', () => {
    test('client.db.X inside the callback is written on success', async () => {
      const client = get();
      await client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'routed' } });
      });

      expect(await tagNames(client)).toEqual(['routed']);
    });

    test('client.db.X and tx.X in one callback commit together', async () => {
      const client = get();
      await client.$transaction(async (tx) => {
        await client.db.BasicsTag.create({ data: { name: 'client' } });
        await tx.BasicsTag.create({ data: { name: 'tx' } });
      });

      expect(await tagNames(client)).toEqual(['client', 'tx']);
    });

    test('a routed read sees the transaction own write before it commits', async () => {
      const client = get();
      const seen = await client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'mine' } });

        return client.db.BasicsTag.count();
      });

      expect(seen).toBe(1);
    });

    test('a read through tx sees a write made through client.db', async () => {
      const client = get();
      const seen = await client.$transaction(async (tx) => {
        await client.db.BasicsTag.create({ data: { name: 'mine' } });

        return tx.BasicsTag.count();
      });

      expect(seen).toBe(1);
    });

    test('client $raw, query() and model $raw inside the callback are written', async () => {
      const client = get();
      await client.$transaction(async () => {
        await client.$raw(sql`CREATE basics_tag SET name = 'raw'`);
        await client.query("CREATE basics_tag SET name = 'query'");
        await client.db.BasicsTag.$raw(sql`CREATE basics_tag SET name = 'model-raw'`);
      });

      expect(await tagNames(client)).toEqual(['model-raw', 'query', 'raw']);
    });

    test('Promise.all of routed queries writes every one', async () => {
      const client = get();
      await client.$transaction(async () => {
        await Promise.all(['a', 'b', 'c'].map((name) => client.db.BasicsTag.create({ data: { name } })));
      });

      expect(await tagNames(client)).toEqual(['a', 'b', 'c']);
    });

    test('a query built outside the callback and awaited inside it is routed', async () => {
      const client = get();
      const built = client.db.BasicsTag.create({ data: { name: 'built-outside' } });
      await caught(() =>
        client.$transaction(async () => {
          await built;
          throw new Error('boom');
        }),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('a callback returning a query writes it in the transaction', async () => {
      const client = get();
      const created = await client.$transaction(async () => client.db.BasicsTag.create({ data: { name: 'returned' } }));

      expect(created.name).toBe('returned');
      expect(await tagNames(client)).toEqual(['returned']);
    });

    test('a synchronous callback returning a query is written', async () => {
      const client = get();
      await client.$transaction(() => client.db.BasicsTag.create({ data: { name: 'sync' } }));

      expect(await tagNames(client)).toEqual(['sync']);
    });
  });

  describe('rollback', () => {
    test('client.db.X inside the callback is rolled back when the callback throws', async () => {
      const client = get();
      const error = await caught(() =>
        client.$transaction(async () => {
          await client.db.BasicsTag.create({ data: { name: 'routed' } });
          throw new Error('boom');
        }),
      );

      expect((error as Error).message).toBe('boom');
      expect(await tagNames(client)).toEqual([]);
    });

    test('client.db.X and tx.X are rolled back together', async () => {
      const client = get();
      await caught(() =>
        client.$transaction(async (tx) => {
          await client.db.BasicsTag.create({ data: { name: 'client' } });
          await tx.BasicsTag.create({ data: { name: 'tx' } });
          throw new Error('boom');
        }),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('client $raw and query() writes are rolled back', async () => {
      const client = get();
      await caught(() =>
        client.$transaction(async () => {
          await client.$raw(sql`CREATE basics_tag SET name = 'raw'`);
          await client.query("CREATE basics_tag SET name = 'query'");
          throw new Error('boom');
        }),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('a routed write the database refuses rolls back the routed writes before it', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'taken' } });
      const error = await caught(() =>
        client.$transaction(async () => {
          await client.db.BasicsTag.create({ data: { name: 'before' } });
          await client.db.BasicsTag.create({ data: { name: 'taken' } });
        }),
      );

      expect(error).toBeDefined();
      expect(await tagNames(client)).toEqual(['taken']);
    });

    test('a failed transaction does not leak its scope: the next standalone query commits on its own', async () => {
      const client = get();
      await caught(() =>
        client.$transaction(async () => {
          throw new Error('boom');
        }),
      );
      await client.db.BasicsTag.create({ data: { name: 'after' } });

      expect(await tagNames(client)).toEqual(['after']);
    });
  });

  describe('outside the callback', () => {
    test('a standalone write after the transaction returned is not routed to it', async () => {
      const client = get();
      await client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'inside' } });
      });
      await client.db.BasicsTag.create({ data: { name: 'outside' } });

      expect(await tagNames(client)).toEqual(['inside', 'outside']);
    });

    test('two callbacks run at once each route into their own transaction', async () => {
      const client = get();
      await Promise.allSettled([
        client.$transaction(async () => {
          await client.db.BasicsTag.create({ data: { name: 'kept' } });
        }),
        client.$transaction(async () => {
          await client.db.BasicsTag.create({ data: { name: 'dropped' } });
          throw new Error('boom');
        }),
      ]);

      expect(await tagNames(client)).toEqual(['kept']);
    });
  });
});
