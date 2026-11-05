/**
 * E2E transaction context: the routing table, row by row. Every model method of `client.db` routes into the
 * callback or function item it runs in. Everything that must not route stays where it was: an explicit
 * `txn`, `tx.X`, another client, a manual transaction, `$live`, and a query that is not run inside the scope.
 * Each routed row pairs with its commit, so a rollback cannot pass by the write being broken.
 */

import { describe, expect, test } from 'bun:test';
import { sql } from 'cerial';
import { createTestClient, testConfig, type CerialClient } from '../../test-helper';
import { caught, tagNames, useClient, wait } from './helpers';

describe('E2E transaction context: routing table', () => {
  const get = useClient();

  type Db = CerialClient['db'];
  /** A write through the model surface, and the tag names left when it took effect on top of 'seed'. */
  const writes: [string, (db: Db) => PromiseLike<unknown>, string[]][] = [
    ['create', (db) => db.BasicsTag.create({ data: { name: 'new' } }), ['new', 'seed']],
    [
      'updateMany',
      (db) => db.BasicsTag.updateMany({ where: { name: 'seed' }, data: { name: 'renamed' } }),
      ['renamed'],
    ],
    ['deleteMany', (db) => db.BasicsTag.deleteMany({ where: { name: 'seed' } }), []],
    [
      'upsert, create path',
      (db) => db.BasicsTag.upsert({ where: { name: 'absent' }, create: { name: 'absent' }, update: { name: 'x' } }),
      ['absent', 'seed'],
    ],
    [
      'upsert, update path',
      (db) => db.BasicsTag.upsert({ where: { name: 'seed' }, create: { name: 'x' }, update: { name: 'updated' } }),
      ['updated'],
    ],
    ['model $raw', (db) => db.BasicsTag.$raw(sql`CREATE basics_tag SET name = 'raw'`), ['raw', 'seed']],
  ];

  const seed = async (client: CerialClient) => (await client.db.BasicsTag.create({ data: { name: 'seed' } })).id;

  describe.each(writes)('%s', (_name, write, afterCommit) => {
    test('callback mode: committed when the callback succeeds', async () => {
      const client = get();
      await seed(client);
      await client.$transaction(async () => {
        await write(client.db);
      });

      expect(await tagNames(client)).toEqual(afterCommit);
    });

    test('callback mode: rolled back when the callback throws', async () => {
      const client = get();
      await seed(client);
      await caught(() =>
        client.$transaction(async () => {
          await write(client.db);
          throw new Error('boom');
        }),
      );

      expect(await tagNames(client)).toEqual(['seed']);
    });

    test('array mode: committed when the item succeeds', async () => {
      const client = get();
      await seed(client);
      await client.$transaction([async () => write(client.db)]);

      expect(await tagNames(client)).toEqual(afterCommit);
    });

    test('array mode: rolled back when a later item throws', async () => {
      const client = get();
      await seed(client);
      await caught(() =>
        client.$transaction([
          async () => write(client.db),
          () => {
            throw new Error('boom');
          },
        ]),
      );

      expect(await tagNames(client)).toEqual(['seed']);
    });
  });

  describe('updateUnique and deleteUnique', () => {
    test('updateUnique is routed: rolled back on a throw, kept on success', async () => {
      const client = get();
      const id = await seed(client);
      await caught(() =>
        client.$transaction(async () => {
          await client.db.BasicsTag.updateUnique({ where: { id }, data: { name: 'renamed' } });
          throw new Error('boom');
        }),
      );
      expect(await tagNames(client)).toEqual(['seed']);

      await client.$transaction(async () => {
        await client.db.BasicsTag.updateUnique({ where: { id }, data: { name: 'renamed' } });
      });
      expect(await tagNames(client)).toEqual(['renamed']);
    });

    test('deleteUnique is routed: rolled back on a throw, kept on success', async () => {
      const client = get();
      const id = await seed(client);
      await caught(() =>
        client.$transaction([
          async () => client.db.BasicsTag.deleteUnique({ where: { id } }),
          () => {
            throw new Error('boom');
          },
        ]),
      );
      expect(await tagNames(client)).toEqual(['seed']);

      await client.$transaction([async () => client.db.BasicsTag.deleteUnique({ where: { id } })]);
      expect(await tagNames(client)).toEqual([]);
    });
  });

  describe('reads see the transaction own uncommitted write', () => {
    type Read = [string, (db: Db) => PromiseLike<unknown>, (result: never) => unknown];
    const reads: Read[] = [
      ['findMany', (db) => db.BasicsTag.findMany(), (r: { name: string }[]) => r.map((t) => t.name)],
      ['findOne', (db) => db.BasicsTag.findOne({ where: { name: 'inside' } }), (r: { name: string } | null) => r?.name],
      ['count', (db) => db.BasicsTag.count(), (r: number) => r],
      ['exists', (db) => db.BasicsTag.exists({ name: 'inside' }), (r: boolean) => r],
      [
        'groupBy',
        (db) => db.BasicsTag.groupBy({ by: { name: true }, _count: true }),
        (r: { name: string }[]) => r.map((t) => t.name),
      ],
    ];
    const expected: Record<string, unknown> = {
      findMany: ['inside'],
      findOne: 'inside',
      count: 1,
      exists: true,
      groupBy: ['inside'],
    };

    test.each(reads)('%s inside a callback is routed', async (name, read, pick) => {
      const client = get();
      const seen = await client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'inside' } });

        return read(client.db);
      });

      expect((pick as (r: unknown) => unknown)(seen)).toEqual(expected[name]);
    });

    test.each(reads)('%s inside an array function item is routed', async (name, read, pick) => {
      const client = get();
      const [, seen] = await client.$transaction([
        async () => client.db.BasicsTag.create({ data: { name: 'inside' } }),
        async () => read(client.db),
      ]);

      expect((pick as (r: unknown) => unknown)(seen)).toEqual(expected[name]);
    });

    test.each(reads)('%s outside any transaction does not see an uncommitted write', async (name, read, pick) => {
      const client = get();
      const txn = await client.$transaction();
      await txn.BasicsTag.create({ data: { name: 'inside' } });
      const seen = await read(client.db);
      await txn.cancel();

      expect((pick as (r: unknown) => unknown)(seen)).not.toEqual(expected[name]);
    });
  });

  describe('never re-routed', () => {
    test('an explicit txn keeps its own transaction: it survives the callback rolling back', async () => {
      const client = get();
      const own = await client.$transaction();
      await caught(() =>
        client.$transaction(async () => {
          await client.db.BasicsTag.create({ data: { name: 'explicit' }, txn: own });
          await client.db.BasicsTag.create({ data: { name: 'routed' } });
          throw new Error('boom');
        }),
      );
      expect(await tagNames(client)).toEqual([]);

      await own.commit();
      expect(await tagNames(client)).toEqual(['explicit']);
    });

    test('an explicit txn is rolled back with its own transaction, not the callback', async () => {
      const client = get();
      const own = await client.$transaction();
      await client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'explicit' }, txn: own });
        await client.db.BasicsTag.create({ data: { name: 'routed' } });
      });
      await own.cancel();

      expect(await tagNames(client)).toEqual(['routed']);
    });

    test('tx.X inside the callback stays on the callback transaction', async () => {
      const client = get();
      await caught(() =>
        client.$transaction(async (tx) => {
          await tx.BasicsTag.create({ data: { name: 'tx' } });
          throw new Error('boom');
        }),
      );

      expect(await tagNames(client)).toEqual([]);
    });

    test('a client with the same config shares the socket and is not routed: its write survives the rollback', async () => {
      const client = get();
      const other = createTestClient();
      await other.connect(testConfig);
      try {
        await caught(() =>
          client.$transaction(async () => {
            await client.db.BasicsTag.create({ data: { name: 'inside' } });
            await other.db.BasicsTag.create({ data: { name: 'other-model' } });
            await other.$raw(sql`CREATE basics_tag SET name = 'other-raw'`);
            await other.query("CREATE basics_tag SET name = 'other-query'");
            throw new Error('boom');
          }),
        );
      } finally {
        await other.disconnect();
      }

      expect(await tagNames(client)).toEqual(['other-model', 'other-query', 'other-raw']);
    });

    test('the same writes of the other client are not rolled back in array mode either', async () => {
      const client = get();
      const other = createTestClient();
      await other.connect(testConfig);
      try {
        await caught(() =>
          client.$transaction([
            async () => {
              await client.db.BasicsTag.create({ data: { name: 'inside' } });
              await other.db.BasicsTag.create({ data: { name: 'other' } });
            },
            () => {
              throw new Error('boom');
            },
          ]),
        );
      } finally {
        await other.disconnect();
      }

      expect(await tagNames(client)).toEqual(['other']);
    });

    test('the other client is routed into its own transaction at the same time', async () => {
      const client = get();
      const other = createTestClient();
      await other.connect(testConfig);
      try {
        await Promise.allSettled([
          client.$transaction(async () => {
            await client.db.BasicsTag.create({ data: { name: 'first' } });
            await wait(50);
            throw new Error('boom');
          }),
          other.$transaction(async () => {
            await other.db.BasicsTag.create({ data: { name: 'second' } });
            await wait(50);
          }),
        ]);
      } finally {
        await other.disconnect();
      }

      expect(await tagNames(client)).toEqual(['second']);
    });
  });

  describe('not run inside the scope', () => {
    test('a query built in the callback and awaited after it returned runs standalone and is written', async () => {
      const client = get();
      let pending: PromiseLike<unknown> | undefined;
      await client.$transaction(async () => {
        pending = client.db.BasicsTag.create({ data: { name: 'built-inside' } });
      });
      expect(await tagNames(client)).toEqual([]);

      await pending;
      expect(await tagNames(client)).toEqual(['built-inside']);
    });

    test('manual mode: client.db stays outside the transaction and survives a cancel', async () => {
      const client = get();
      const tx = await client.$transaction();
      await tx.BasicsTag.create({ data: { name: 'tx' } });
      await client.db.BasicsTag.create({ data: { name: 'outside' } });
      await tx.cancel();

      expect(await tagNames(client)).toEqual(['outside']);
    });

    test('manual mode: client.db, $raw and query() all stay outside', async () => {
      const client = get();
      const tx = await client.$transaction();
      await client.$raw(sql`CREATE basics_tag SET name = 'raw'`);
      await client.query("CREATE basics_tag SET name = 'query'");
      await tx.cancel();

      expect(await tagNames(client)).toEqual(['query', 'raw']);
    });

    test('manual mode: a standalone read does not see an uncommitted tx write, then does after commit', async () => {
      const client = get();
      const tx = await client.$transaction();
      await tx.BasicsTag.create({ data: { name: 'tx' } });
      expect(await client.db.BasicsTag.count()).toBe(0);

      await tx.commit();
      expect(await client.db.BasicsTag.count()).toBe(1);
    });
  });

  describe('$live', () => {
    test('is not refused inside a callback and stays on the main connection: it sees the row only after commit', async () => {
      const client = get();
      const actions: string[] = [];
      let beforeCommit: string[] = [];
      let handle: Awaited<ReturnType<typeof client.$live>> | undefined;
      await client.$transaction(async () => {
        handle = await client.$live('basics_tag');
        void (async () => {
          for await (const note of handle!) actions.push(note.action);
        })();
        await client.db.BasicsTag.create({ data: { name: 'live' } });
        await wait(200);
        beforeCommit = [...actions];
      });
      for (let i = 0; i < 30 && !actions.length; i++) await wait(100);
      await handle!.kill();

      expect(beforeCommit).toEqual([]);
      expect(actions).toEqual(['CREATE']);
    });
  });
});
