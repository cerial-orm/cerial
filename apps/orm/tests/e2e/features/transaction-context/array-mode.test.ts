/**
 * E2E transaction context, array mode: queries made through the client inside a function item run in the
 * array's transaction. Each routed shape commits with the array and rolls back with it; a standalone query
 * outside the array is never part of it.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from 'cerial';
import { caught, tagNames, useClient } from './helpers';

describe('E2E transaction context: array mode', () => {
  const get = useClient();

  const boom = (): never => {
    throw new Error('boom');
  };

  describe('commit', () => {
    test('an async item that returns a query writes in the transaction', async () => {
      const client = get();
      await client.$transaction([async () => client.db.BasicsTag.create({ data: { name: 'returned' } })]);

      expect(await tagNames(client)).toEqual(['returned']);
    });

    test('queries awaited inside an item are all written', async () => {
      const client = get();
      await client.$transaction([
        async () => {
          await client.db.BasicsTag.create({ data: { name: 'one' } });
          await client.db.BasicsTag.create({ data: { name: 'two' } });
        },
      ]);

      expect(await tagNames(client)).toEqual(['one', 'two']);
    });

    test('Promise.all inside an item writes every query', async () => {
      const client = get();
      await client.$transaction([
        async () => {
          await Promise.all(['a', 'b', 'c'].map((name) => client.db.BasicsTag.create({ data: { name } })));
        },
      ]);

      expect(await tagNames(client)).toEqual(['a', 'b', 'c']);
    });

    test('client $raw and query() inside an item are written', async () => {
      const client = get();
      await client.$transaction([
        async () => {
          await client.$raw(sql`CREATE basics_tag SET name = 'raw'`);
          await client.query("CREATE basics_tag SET name = 'query'");
        },
      ]);

      expect(await tagNames(client)).toEqual(['query', 'raw']);
    });

    test('an item sees the rows an earlier plain query of the array wrote', async () => {
      const client = get();
      const [, seen] = await client.$transaction([
        client.db.BasicsTag.create({ data: { name: 'first' } }),
        async () => client.db.BasicsTag.count(),
      ]);

      expect(seen).toBe(1);
    });

    test('an item returns the value of the query it returned', async () => {
      const client = get();
      const [created] = await client.$transaction([
        async () => client.db.BasicsTag.create({ data: { name: 'value' } }),
      ]);

      expect((created as { name: string }).name).toBe('value');
    });
  });

  describe('rollback', () => {
    test('a later failing item rolls back an item that returned a query', async () => {
      const client = get();
      const error = await caught(() =>
        client.$transaction([async () => client.db.BasicsTag.create({ data: { name: 'a' } }), boom]),
      );

      expect((error as Error).message).toBe('boom');
      expect(await tagNames(client)).toEqual([]);
    });

    test('a later failing item rolls back awaited queries', async () => {
      const client = get();
      await caught(() =>
        client.$transaction([
          async () => {
            await client.db.BasicsTag.create({ data: { name: 'a' } });
            await client.db.BasicsTag.create({ data: { name: 'b' } });
          },
          boom,
        ]),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('a failure inside an item after Promise.all rolls back all of them', async () => {
      const client = get();
      await caught(() =>
        client.$transaction([
          async () => {
            await Promise.all([
              client.db.BasicsTag.create({ data: { name: 'a' } }),
              client.db.BasicsTag.create({ data: { name: 'b' } }),
            ]);
            boom();
          },
        ]),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('client $raw and query() writes roll back with a later failing item', async () => {
      const client = get();
      await caught(() =>
        client.$transaction([
          async () => {
            await client.$raw(sql`CREATE basics_tag SET name = 'raw'`);
            await client.query("CREATE basics_tag SET name = 'query'");
          },
          boom,
        ]),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('a plain query of the array rolls back with a failing function item', async () => {
      const client = get();
      await caught(() => client.$transaction([client.db.BasicsTag.create({ data: { name: 'plain' } }), boom]));

      expect(await tagNames(client)).toEqual([]);
    });

    test('a query the database refuses inside an item rolls back the routed writes before it', async () => {
      const client = get();
      await client.db.BasicsTag.create({ data: { name: 'taken' } });
      const error = await caught(() =>
        client.$transaction([
          async () => {
            await client.db.BasicsTag.create({ data: { name: 'before' } });
            await client.db.BasicsTag.create({ data: { name: 'taken' } });
          },
        ]),
      );

      expect(error).toBeDefined();
      expect(await tagNames(client)).toEqual(['taken']);
    });
  });

  describe('reads', () => {
    test('a read inside the item sees its own earlier write, a read after the array sees the committed row', async () => {
      const client = get();
      const [inside] = await client.$transaction([
        async () => {
          await client.db.BasicsTag.create({ data: { name: 'mine' } });

          return client.db.BasicsTag.count();
        },
      ]);

      expect(inside).toBe(1);
      expect(await client.db.BasicsTag.count()).toBe(1);
    });
  });
});
