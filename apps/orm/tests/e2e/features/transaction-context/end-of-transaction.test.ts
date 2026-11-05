/**
 * E2E transaction context: what happens to queries still running or starting when the transaction ends.
 * Commit and cancel wait for running queries (no torn write), a query that starts afterwards is refused
 * before anything is sent, and a timeout cancels without waiting.
 */

import { describe, expect, test } from 'bun:test';
import { CerialTransactionError, sql } from 'cerial';
import { caught, lateMessage, slowTagWrite, tagNames, useClient, wait } from './helpers';

describe('E2E transaction context: end of the transaction', () => {
  const get = useClient();

  describe('drain before commit', () => {
    test('an un-awaited tx.X is written whole before the callback commits', async () => {
      const client = get();
      await client.$transaction(async (tx) => {
        void tx.BasicsTag.$raw(slowTagWrite).then(
          () => undefined,
          () => undefined,
        );
      });

      expect(await tagNames(client)).toEqual(['slow-a', 'slow-b']);
    });

    test('an un-awaited routed query is written whole before the callback commits', async () => {
      const client = get();
      await client.$transaction(async () => {
        void client.db.BasicsTag.$raw(slowTagWrite).then(
          () => undefined,
          () => undefined,
        );
        await wait(50);
      });

      expect(await tagNames(client)).toEqual(['slow-a', 'slow-b']);
    });

    test('an un-awaited client $raw is written whole before the callback commits', async () => {
      const client = get();
      await client.$transaction(async () => {
        void client.$raw(slowTagWrite).then(
          () => undefined,
          () => undefined,
        );
        await wait(50);
      });

      expect(await tagNames(client)).toEqual(['slow-a', 'slow-b']);
    });

    test('an un-awaited routed query is written whole before an array function item commits', async () => {
      const client = get();
      await client.$transaction([
        async () => {
          void client.db.BasicsTag.$raw(slowTagWrite).then(
            () => undefined,
            () => undefined,
          );
          await wait(50);
        },
      ]);

      expect(await tagNames(client)).toEqual(['slow-a', 'slow-b']);
    });

    test('manual mode: commit waits for an in-flight tx.X and keeps both statements', async () => {
      const client = get();
      const tx = await client.$transaction();
      const running = tx.BasicsTag.$raw(slowTagWrite).then(
        () => 'done',
        (error: unknown) => error,
      );
      await wait(100);
      await tx.commit();

      expect(await running).toBe('done');
      expect(await tagNames(client)).toEqual(['slow-a', 'slow-b']);
      expect(tx.state).toBe('committed');
    });

    test('manual mode: cancel waits for an in-flight tx.X and discards both statements', async () => {
      const client = get();
      const tx = await client.$transaction();
      const running = tx.BasicsTag.$raw(slowTagWrite).then(
        () => 'done',
        (error: unknown) => error,
      );
      await wait(100);
      await tx.cancel();

      expect(await running).toBe('done');
      expect(await tagNames(client)).toEqual([]);
      expect(tx.state).toBe('cancelled');
    });

    test('a callback that throws with a query still running cancels after it and writes nothing', async () => {
      const client = get();
      await caught(() =>
        client.$transaction(async () => {
          void client.db.BasicsTag.$raw(slowTagWrite).then(
            () => undefined,
            () => undefined,
          );
          await wait(50);
          throw new Error('boom');
        }),
      );

      expect(await tagNames(client)).toEqual([]);
    });
  });

  describe('a query that starts after the end', () => {
    test('after commit: refused with the exact message and nothing written', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await client.$transaction(async () => {
        late = wait(50).then(() => client.db.BasicsTag.create({ data: { name: 'late' } }));
      });
      const error = await caught(() => late!);

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect((error as CerialTransactionError).message).toBe(lateMessage('BasicsTag.create', 'committed'));
      expect(await tagNames(client)).toEqual([]);
    });

    test('after cancel: says cancelled, and nothing is written', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await caught(() =>
        client.$transaction(async () => {
          late = wait(50).then(() => client.db.BasicsTag.create({ data: { name: 'late' } }));
          throw new Error('boom');
        }),
      );
      const error = await caught(() => late!);

      expect((error as CerialTransactionError).message).toBe(lateMessage('BasicsTag.create', 'cancelled'));
      expect(await tagNames(client)).toEqual([]);
    });

    test('the message names the method that was called', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await client.$transaction(async () => {
        late = wait(50).then(() => client.db.BasicsTag.findMany());
      });
      const error = await caught(() => late!);

      expect((error as CerialTransactionError).message).toBe(lateMessage('BasicsTag.findMany', 'committed'));
    });

    test('a client $raw after the end starts the message with $raw', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await client.$transaction(async () => {
        late = wait(50).then(() => client.$raw(sql`CREATE basics_tag SET name = 'late'`));
      });
      const error = await caught(() => late!);

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect((error as CerialTransactionError).message).toStartWith('$raw ran after its transaction was committed');
      expect(await tagNames(client)).toEqual([]);
    });

    test('client query() after the end is refused too', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await client.$transaction(async () => {
        late = wait(50).then(() => client.query("CREATE basics_tag SET name = 'late'"));
      });
      const error = await caught(() => late!);

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(await tagNames(client)).toEqual([]);
    });

    test('array mode: a query started after the item ended is refused and writes nothing', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await client.$transaction([
        () => {
          late = wait(50).then(() => client.db.BasicsTag.create({ data: { name: 'late' } }));
        },
      ]);
      const error = await caught(() => late!);

      expect((error as CerialTransactionError).message).toBe(lateMessage('BasicsTag.create', 'committed'));
      expect(await tagNames(client)).toEqual([]);
    });

    test('tx.X after the end still throws the transaction-ended error', async () => {
      const client = get();
      let kept: Awaited<ReturnType<typeof client.$transaction>> | undefined;
      await client.$transaction(async (tx) => {
        kept = tx as never;
      });
      const error = await caught(async () =>
        (kept as unknown as { BasicsTag: { count(): unknown } }).BasicsTag.count(),
      );

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect((error as CerialTransactionError).message).toContain('already ended');
    });

    test('a standalone query after the end is not refused', async () => {
      const client = get();
      await client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'inside' } });
      });
      await client.db.BasicsTag.create({ data: { name: 'after' } });

      expect(await tagNames(client)).toEqual(['after', 'inside']);
    });
  });

  describe('timeout', () => {
    test('a callback past its timeout rejects with the timeout error and writes nothing', async () => {
      const client = get();
      const error = await caught(() =>
        client.$transaction(
          async () => {
            await client.db.BasicsTag.create({ data: { name: 'slow' } });
            await wait(400);
          },
          { timeout: 100 },
        ),
      );

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect((error as CerialTransactionError).message).toBe('Transaction timeout');
      expect(await tagNames(client)).toEqual([]);
    });

    test('a query started after the timeout is refused as cancelled and writes nothing', async () => {
      const client = get();
      let late: Promise<unknown> | undefined;
      await caught(() =>
        client.$transaction(
          async () => {
            late = wait(300).then(() => client.db.BasicsTag.create({ data: { name: 'late' } }));
            await wait(500);
          },
          { timeout: 100 },
        ),
      );
      const error = await caught(() => late!);

      expect((error as CerialTransactionError).message).toBe(lateMessage('BasicsTag.create', 'cancelled'));
      await wait(200);
      expect(await tagNames(client)).toEqual([]);
    });

    test('a running query does not hold the timeout: it rejects promptly and nothing is written', async () => {
      const client = get();
      const started = Date.now();
      const error = await caught(() =>
        client.$transaction(
          async () => {
            await client.db.BasicsTag.$raw(
              sql`CREATE basics_tag SET name = 'a'; SLEEP 1500ms; CREATE basics_tag SET name = 'b'; RETURN 1;`,
            );
          },
          { timeout: 100 },
        ),
      );

      expect((error as CerialTransactionError).message).toBe('Transaction timeout');
      expect(Date.now() - started).toBeLessThan(1200);
      await wait(1600);
      expect(await tagNames(client)).toEqual([]);
    });

    test('a callback inside its timeout commits', async () => {
      const client = get();
      await client.$transaction(
        async () => {
          await client.db.BasicsTag.create({ data: { name: 'fast' } });
        },
        { timeout: 5000 },
      );

      expect(await tagNames(client)).toEqual(['fast']);
    });
  });
});
