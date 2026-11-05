/**
 * Unit tests for routing unbound queries into the active transaction with a fake driver:
 * which instance a query reaches, what commit and cancel wait for, and what a late query is told.
 */

import { describe, expect, test } from 'bun:test';
import { QueryError, type Surreal, ValidationError } from 'surrealdb';
import { CerialTransaction, createClientRawStatement, wrapDatabaseError } from '../../../src/client';
import { Model } from '../../../src/client/model/model';
import {
  refuseNestedTransaction,
  resolveRouted,
  runInTransactionScope,
  runRouted,
} from '../../../src/client/transaction-context';
import { CerialTransactionError } from '../../../src/errors';
import { sql } from '../../../src/query/compile';
import { executeClientTransaction } from '../../../src/query/executor';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);

interface Sent {
  readonly on: string;
  readonly text: string;
}

interface Fake {
  readonly surreal: Surreal;
  readonly txns: { commit: () => Promise<void>; cancel: () => Promise<void> }[];
  readonly sent: Sent[];
  /** Resolves every query held back by `hold` */
  release: () => void;
  hold: boolean;
}

/** A driver whose queries record the instance they ran on and can be held until released. */
function fake(name = 'main'): Fake {
  const sent: Sent[] = [];
  const waiting: (() => void)[] = [];
  const state: Fake = {
    surreal: undefined as unknown as Surreal,
    txns: [],
    sent,
    hold: false,
    release: () => {
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
  const queryOn = (on: string) => (bound: { text?: string } | string) => {
    const collect = async (): Promise<unknown[]> => {
      sent.push({ on, text: typeof bound === 'string' ? bound : (bound.text ?? '') });
      if (state.hold) await new Promise<void>((resolve) => waiting.push(resolve));

      return [[{ id: 'user:1', name: 'a' }]];
    };

    // The driver's query is a thenable as well as a handle with collect()
    return {
      collect,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => collect().then(resolve, reject),
    };
  };
  (state as { surreal: Surreal }).surreal = {
    query: queryOn(name),
    beginTransaction: async () => {
      const index = state.txns.length;
      const txn = {
        query: queryOn(`${name}.txn${index}`),
        commit: async () => {
          sent.push({ on: `${name}.txn${index}`, text: 'COMMIT' });
        },
        cancel: async () => {
          sent.push({ on: `${name}.txn${index}`, text: 'CANCEL' });
        },
      };
      state.txns.push(txn);

      return txn;
    },
  } as unknown as Surreal;

  return state;
}

const metadata = registry.User!;
const statement = sql`SELECT * FROM user`;
const targets = (driver: Fake): string[] =>
  driver.sent.filter((s) => s.text !== 'COMMIT' && s.text !== 'CANCEL').map((s) => s.on);
const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

describe('array mode, a function item', () => {
  const modelRaw = (driver: Fake) => new Model(driver.surreal, metadata, registry).$raw(statement);
  const clientRaw = (driver: Fake) => createClientRawStatement(statement, async () => driver.surreal);

  test.each([
    ['an async item that awaits a model query', (d: Fake) => async () => modelRaw(d)],
    ['an async item that returns a model query', (d: Fake) => async () => modelRaw(d)],
    ['an async item that awaits the client $raw', (d: Fake) => async () => clientRaw(d)],
    ['an async item that returns the client $raw', (d: Fake) => async () => clientRaw(d)],
    ['an async item using Promise.all', (d: Fake) => async () => Promise.all([modelRaw(d), clientRaw(d)])],
  ])('%s runs on the transaction', async (_name, makeItem) => {
    const driver = fake();
    await executeClientTransaction(driver.surreal, [makeItem(driver)]);

    expect(targets(driver).length).toBeGreaterThan(0);
    expect(targets(driver).every((on) => on === 'main.txn0')).toBe(true);
    expect(driver.sent.at(-1)).toEqual({ on: 'main.txn0', text: 'COMMIT' });
  });

  test('a synchronously returned query still runs on the transaction', async () => {
    const driver = fake();
    await executeClientTransaction(driver.surreal, [() => modelRaw(driver)]);

    expect(targets(driver)).toEqual(['main.txn0']);
  });

  test('a query awaited after the item returned runs standalone', async () => {
    const driver = fake();
    let escaped: PromiseLike<unknown> | undefined;
    await executeClientTransaction(driver.surreal, [
      () => {
        escaped = modelRaw(driver);
      },
    ]);
    await escaped;

    expect(targets(driver)).toEqual(['main']);
  });

  test('a query built outside the item and awaited inside it runs on the transaction', async () => {
    const driver = fake();
    const early = modelRaw(driver);
    await executeClientTransaction(driver.surreal, [async () => early]);

    expect(targets(driver)).toEqual(['main.txn0']);
  });

  test('a query on another instance is never routed', async () => {
    const driver = fake();
    const other = fake('other');
    await executeClientTransaction(driver.surreal, [async () => modelRaw(other)]);

    expect(targets(other)).toEqual(['other']);
    expect(targets(driver)).toEqual([]);
  });

  test('a throwing item cancels instead of committing', async () => {
    const driver = fake();
    await expect(
      executeClientTransaction(driver.surreal, [
        async () => {
          await modelRaw(driver);
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');

    expect(driver.sent.map((s) => s.text)).toContain('CANCEL');
    expect(driver.sent.map((s) => s.text)).not.toContain('COMMIT');
  });

  test('every attempt gets its own transaction and scope', async () => {
    const driver = fake();
    const scopes: unknown[] = [];
    let attempts = 0;
    const conflict = new QueryError({ kind: 'Query', message: 'conflict', details: { kind: 'TransactionConflict' } });
    await executeClientTransaction(
      driver.surreal,
      [
        async () => {
          attempts++;
          scopes.push(resolveRouted(driver.surreal));
          await modelRaw(driver);
          if (attempts === 1) throw conflict;
        },
      ],
      { retries: 1, backoff: () => 0 },
    );

    expect(driver.txns.length).toBe(2);
    expect(scopes[0]).toBeDefined();
    expect(scopes[1]).toBeDefined();
    expect(scopes[0]).not.toBe(scopes[1]);
    expect(targets(driver)).toEqual(['main.txn0', 'main.txn1']);
    expect(driver.sent.map((s) => s.text).filter((t) => t === 'CANCEL' || t === 'COMMIT')).toEqual([
      'CANCEL',
      'COMMIT',
    ]);
  });

  test('a failed attempt waits for its running query before cancelling', async () => {
    const driver = fake();
    driver.hold = true;
    const outcome = executeClientTransaction(driver.surreal, [
      () => {
        void modelRaw(driver).then(
          () => undefined,
          () => undefined,
        );
        throw new Error('boom');
      },
    ]);
    outcome.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(driver.sent.map((s) => s.text)).not.toContain('CANCEL');
    driver.release();
    await expect(outcome).rejects.toThrow('boom');

    expect(driver.sent.at(-1)?.text).toBe('CANCEL');
  });

  test('a query that outlives its item is refused by the ended attempt, not run in the next one', async () => {
    const driver = fake();
    let straggler: Promise<unknown> | undefined;
    await executeClientTransaction(driver.surreal, [
      () => {
        // Built and started inside the scope, but only runs after a delay
        straggler = new Promise((resolve) => setTimeout(resolve, 20)).then(() => modelRaw(driver));
      },
    ]);
    const error = await caught(() => straggler!);

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect((error as CerialTransactionError).message).toBe(
      'User.$raw ran after its transaction was committed: await every query inside the $transaction callback or function item',
    );
    expect(targets(driver)).toEqual([]);
  });
});

describe('commit and cancel wait for bound queries', () => {
  test('commit is sent only after a running query settled: the torn commit cannot occur', async () => {
    const driver = fake();
    const txn = await driver.surreal.beginTransaction();
    const tx = new CerialTransaction(txn, registry);
    driver.hold = true;
    const running = runInTransactionScope({ owner: driver.surreal, txn: tx }, () =>
      runRouted(driver.surreal, driver.surreal, 'query', (db) => db.query('SELECT 1') as never),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const commit = tx.commit();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(driver.sent.map((s) => s.text)).not.toContain('COMMIT');
    driver.release();
    await running;
    await commit;

    expect(driver.sent.map((s) => s.text)).toEqual(['SELECT 1', 'COMMIT']);
    expect(tx.state).toBe('committed');
  });

  test('cancel waits as well', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    driver.hold = true;
    const running = runInTransactionScope({ owner: driver.surreal, txn: tx }, () =>
      runRouted(driver.surreal, driver.surreal, 'query', (db) => db.query('SELECT 1') as never),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const cancel = tx.cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(driver.sent.map((s) => s.text)).not.toContain('CANCEL');
    driver.release();
    await running;
    await cancel;

    expect(driver.sent.map((s) => s.text)).toEqual(['SELECT 1', 'CANCEL']);
    expect(tx.state).toBe('cancelled');
  });

  test('a query that fails does not block the commit', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    const failing = tx._track(async () => {
      throw new Error('query failed');
    });
    failing.catch(() => {});
    await tx.commit();

    expect(tx.state).toBe('committed');
  });

  test('with nothing in flight, commit sends at once', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    await tx.commit();

    expect(driver.sent.map((s) => s.text)).toEqual(['COMMIT']);
  });

  test('a second commit while the first waits is refused', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    driver.hold = true;
    const running = tx._track(async () => driver.surreal.query('SELECT 1').collect());
    const first = tx.commit();

    await expect(tx.commit()).rejects.toThrow('Transaction already ended');
    driver.release();
    await running;
    await first;

    expect(driver.sent.filter((s) => s.text === 'COMMIT').length).toBe(1);
  });
});

describe('a query after the transaction ended', () => {
  test.each([
    ['committed', (tx: CerialTransaction) => tx.commit()],
    ['cancelled', (tx: CerialTransaction) => tx.cancel()],
  ])('is refused before sending once %s', async (state, end) => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    await end(tx);
    const sentBefore = driver.sent.length;

    const modelError = await caught(() =>
      runInTransactionScope({ owner: driver.surreal, txn: tx }, async () =>
        new Model(driver.surreal, metadata, registry).$raw(statement),
      ),
    );
    const clientError = await caught(() =>
      runInTransactionScope({ owner: driver.surreal, txn: tx }, async () =>
        createClientRawStatement(statement, async () => driver.surreal),
      ),
    );
    const queryError = await caught(() =>
      runInTransactionScope({ owner: driver.surreal, txn: tx }, async () =>
        runRouted(driver.surreal, driver.surreal, 'query', (db) => db.query('SELECT 1') as never),
      ),
    );

    const tail = `ran after its transaction was ${state}: await every query inside the $transaction callback or function item`;
    expect(modelError).toBeInstanceOf(CerialTransactionError);
    expect((modelError as CerialTransactionError).message).toBe(`User.$raw ${tail}`);
    expect((modelError as CerialTransactionError).operation).toBe('$raw');
    expect((modelError as CerialTransactionError).model).toBe('User');
    expect((clientError as CerialTransactionError).message).toBe(`$raw ${tail}`);
    expect((queryError as CerialTransactionError).message).toBe(`query ${tail}`);
    expect(driver.sent.length).toBe(sentBefore);
  });

  test('outside any scope the same queries run standalone', async () => {
    const driver = fake();
    await new Model(driver.surreal, metadata, registry).$raw(statement);

    expect(targets(driver)).toEqual(['main']);
  });
});

describe('the routing identity', () => {
  test('an explicit transaction wins over the scope', async () => {
    const driver = fake();
    const scoped = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    const explicit = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    await runInTransactionScope({ owner: driver.surreal, txn: scoped }, async () =>
      new Model(driver.surreal, metadata, registry).$raw(statement, { txn: explicit }),
    );

    expect(targets(driver)).toEqual(['main.txn1']);
  });

  test('a model of the transaction is not re-routed into the scope', async () => {
    const driver = fake();
    const scoped = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    const mine = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    await runInTransactionScope({ owner: driver.surreal, txn: scoped }, async () => {
      const model = mine._getModel('User') as Model;
      await model.$raw(statement);
    });

    expect(targets(driver)).toEqual(['main.txn1']);
  });

  test('a query on a transaction model is tracked, so its commit waits', async () => {
    const driver = fake();
    const mine = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    driver.hold = true;
    const running = (mine._getModel('User') as Model).$raw(statement);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const commit = mine.commit();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(driver.sent.map((s) => s.text)).not.toContain('COMMIT');
    driver.release();
    await running;
    await commit;

    expect(driver.sent.at(-1)?.text).toBe('COMMIT');
  });

  test('outside a scope nothing is routed, inside one only the owner is', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);

    expect(resolveRouted(driver.surreal)).toBeUndefined();
    runInTransactionScope({ owner: driver.surreal, txn: tx }, () => {
      expect(resolveRouted(driver.surreal)).toBe(tx);
      expect(resolveRouted(fake('other').surreal)).toBeUndefined();
    });
  });
});

describe('a nested $transaction', () => {
  test('is refused on the scope owner with the existing message', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);
    const error = runInTransactionScope({ owner: driver.surreal, txn: tx }, () =>
      caught(async () => refuseNestedTransaction(driver.surreal)),
    );

    expect(await error).toBeInstanceOf(CerialTransactionError);
    expect(((await error) as CerialTransactionError).message).toBe('Nested transactions are not supported');
    expect(((await error) as CerialTransactionError).operation).toBe('$transaction');
  });

  test('is allowed on another client, outside a scope, and with no connection', async () => {
    const driver = fake();
    const tx = new CerialTransaction(await driver.surreal.beginTransaction(), registry);

    expect(() => refuseNestedTransaction(driver.surreal)).not.toThrow();
    expect(() => refuseNestedTransaction(undefined)).not.toThrow();
    runInTransactionScope({ owner: driver.surreal, txn: tx }, () => {
      expect(() => refuseNestedTransaction(fake('other').surreal)).not.toThrow();
    });
  });
});

describe('wrapDatabaseError, an ended transaction', () => {
  test('"Transaction not found" is a CerialTransactionError carrying the driver error', () => {
    const cause = new ValidationError({ kind: 'Validation', message: 'Transaction not found' } as never);
    const wrapped = wrapDatabaseError(cause, 'User', 'create');

    expect(wrapped).toBeInstanceOf(CerialTransactionError);
    expect((wrapped as CerialTransactionError).cause).toBe(cause);
    expect((wrapped as CerialTransactionError).operation).toBe('create');
  });

  test('"Couldn\'t update a finished transaction" is one as well', () => {
    const cause = new QueryError({
      kind: 'Query',
      message: "There was a problem with the key-value store: Couldn't update a finished transaction",
    } as never);

    expect(wrapDatabaseError(cause, 'User', 'create')).toBeInstanceOf(CerialTransactionError);
  });

  test('another validation error is not', () => {
    const cause = new ValidationError({ kind: 'Validation', message: 'Parse error' } as never);

    expect(wrapDatabaseError(cause, 'User', 'create')).not.toBeInstanceOf(CerialTransactionError);
  });
});
