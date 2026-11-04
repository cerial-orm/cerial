/**
 * Integration tests: `isolation` and `readOnly` reach the server in array, callback and manual
 * transactions. A client-driven transaction cannot take them through SDK 2.2.1, so these tests go
 * through Cerial's begin: the engine wrapper in `client/transaction-begin.ts`. Uses the throwaway
 * database `cerial_txn_options` in the shared instance, removed afterwards.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { beginTransaction, createCerialTransactionProxy, createSurreal, wrapDatabaseError } from '../../src/client';
import { CerialTransactionError, CerialValidationError } from '../../src/errors';
import {
  executeClientTransaction,
  isTransactionConflict,
  type TransactionExecutionItem,
} from '../../src/query/executor';
import { sql } from '../../src/query/compile';
import { parseModelRegistry } from '../test-helpers';

const NAMESPACE = 'main';
const DATABASE = 'cerial_txn_options';
const registry = parseModelRegistry(`
model Unused {
  id Record @id
}
`);

let db: Surreal;

const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

async function rows(): Promise<unknown> {
  const [result] = await db.query('SELECT id, v FROM c2t ORDER BY id').collect();

  return JSON.parse(JSON.stringify(result));
}

const pristine = [
  { id: 'c2t:1', v: 1 },
  { id: 'c2t:2', v: 1 },
];

const read = (id: number): TransactionExecutionItem => ({
  compiledQuery: { text: `SELECT * FROM c2t:${id}`, vars: {} },
  resultType: 'raw',
});
const write = (id: number, v: number): TransactionExecutionItem => ({
  compiledQuery: { text: `UPDATE c2t:${id} SET v = ${v}`, vars: {} },
  resultType: 'raw',
});
/** Changes c2t:1 from outside the transaction, once per attempt. */
function interfere(counter: { attempts: number }): TransactionExecutionItem {
  return async () => {
    counter.attempts++;
    await db.query(`UPDATE c2t:1 SET v = ${100 + counter.attempts}`).collect();
  };
}

beforeAll(async () => {
  db = createSurreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: NAMESPACE,
    authentication: { username: 'root', password: 'root' },
  });
  await db.query(`DEFINE DATABASE IF NOT EXISTS ${DATABASE}`).collect();
  await db.use({ namespace: NAMESPACE, database: DATABASE });
  await db.query('DEFINE TABLE c2t SCHEMALESS').collect();
});

afterAll(async () => {
  await db.query(`REMOVE DATABASE IF EXISTS ${DATABASE}`).collect();
  await db.close();
});

beforeEach(async () => {
  await db.query('DELETE c2t; CREATE c2t:1 SET v = 1; CREATE c2t:2 SET v = 1;').collect();
});

describe('array mode, readOnly', () => {
  test('refuses a write as CerialTransactionError and writes nothing', async () => {
    const error = await caught(() =>
      executeClientTransaction(db, [read(1), write(2, 9)], { readOnly: true }).catch((e: unknown) => {
        throw wrapDatabaseError(e, undefined, '$transaction');
      }),
    );

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect((error as CerialTransactionError).message).toContain('read only transaction');
    expect(await rows()).toEqual(pristine);
  });

  test('runs reads', async () => {
    const [first] = await executeClientTransaction(db, [read(1)], { readOnly: true });

    expect(JSON.parse(JSON.stringify(first))).toEqual([{ id: 'c2t:1', v: 1 }]);
  });

  test.each([
    ['readOnly: false', { readOnly: false }],
    ['no options', {}],
  ])('%s allows the write', async (_name, options) => {
    await executeClientTransaction(db, [write(2, 9)], options);

    expect(await rows()).toEqual([pristine[0], { id: 'c2t:2', v: 9 }]);
  });
});

describe('array mode, isolation', () => {
  test('snapshot commits after a read changed elsewhere, as does the default', async () => {
    for (const options of [{ isolation: 'snapshot' as const }, {}]) {
      await db.query('UPDATE c2t:1 SET v = 1').collect();
      await executeClientTransaction(db, [read(1), interfere({ attempts: 0 }), write(2, 5)], options);
    }

    expect(await rows()).toEqual([
      { id: 'c2t:1', v: 101 },
      { id: 'c2t:2', v: 5 },
    ]);
  });

  test('serializable refuses the commit with a retryable conflict when no retries are set', async () => {
    const counter = { attempts: 0 };
    const error = await caught(() =>
      executeClientTransaction(db, [read(1), interfere(counter), write(2, 5)], { isolation: 'serializable' }),
    );

    expect(isTransactionConflict(error)).toBe(true);
    expect(counter.attempts).toBe(1);
    expect(await rows()).toEqual([{ id: 'c2t:1', v: 101 }, pristine[1]]);
  });

  test('serializable with retries succeeds once the interference stops', async () => {
    const counter = { attempts: 0 };
    const quiet: TransactionExecutionItem = async () => {
      counter.attempts++;
      if (counter.attempts === 1) await db.query('UPDATE c2t:1 SET v = 50').collect();
    };

    await executeClientTransaction(db, [read(1), quiet, write(2, 5)], {
      isolation: 'serializable',
      retries: 2,
      backoff: () => 0,
    });

    expect(counter.attempts).toBe(2);
    expect(await rows()).toEqual([
      { id: 'c2t:1', v: 50 },
      { id: 'c2t:2', v: 5 },
    ]);
  });

  test('a retry keeps serializable: interference on every attempt exhausts the retries', async () => {
    const counter = { attempts: 0 };
    const error = await caught(() =>
      executeClientTransaction(db, [read(1), interfere(counter), write(2, 5)], {
        isolation: 'serializable',
        retries: 2,
        backoff: () => 0,
      }),
    );

    expect(isTransactionConflict(error)).toBe(true);
    expect(counter.attempts).toBe(3);
    expect(await rows()).toEqual([{ id: 'c2t:1', v: 103 }, pristine[1]]);
  });

  test('a retry keeps readOnly: the write is refused on every attempt, and a refusal is not retried', async () => {
    const counter = { attempts: 0 };
    const count: TransactionExecutionItem = async () => {
      counter.attempts++;
    };
    const error = await caught(() =>
      executeClientTransaction(db, [count, write(2, 5)], { readOnly: true, retries: 2, backoff: () => 0 }),
    );

    expect(error).toBeDefined();
    expect(isTransactionConflict(error)).toBe(false);
    expect(counter.attempts).toBe(1);
    expect(await rows()).toEqual(pristine);
  });

  test('serializable and readOnly together never conflict', async () => {
    const counter = { attempts: 0 };

    await executeClientTransaction(db, [read(1), interfere(counter)], { isolation: 'serializable', readOnly: true });

    expect(counter.attempts).toBe(1);
  });
});

describe('invalid values', () => {
  test.each([
    ['isolation read committed', { isolation: 'read committed' }, 'isolation'],
    ['isolation bogus', { isolation: 'bogus' }, 'isolation'],
    ['readOnly string', { readOnly: 'true' }, 'readOnly'],
  ])('%s is a CerialValidationError naming the option, and nothing is written', async (_name, options, name) => {
    const array = await caught(() => executeClientTransaction(db, [write(2, 9)], options as never));
    const manual = await caught(() => beginTransaction(db, options as never));

    for (const error of [array, manual]) {
      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as Error).message).toContain(`"${name}"`);
    }
    expect(await rows()).toEqual(pristine);
  });
});

describe('manual and callback modes', () => {
  async function open(options?: Parameters<typeof beginTransaction>[1]) {
    return createCerialTransactionProxy(await beginTransaction(db, options), registry);
  }
  const rawWrite = (v: number) => sql`UPDATE c2t:2 SET v = ${v}`;

  test('readOnly refuses a write as CerialTransactionError, keeps the transaction open, and commits nothing', async () => {
    const tx = await open({ readOnly: true });
    const error = await caught(() => tx.$raw(rawWrite(9)));
    const readBack = await tx.$raw(sql`SELECT * FROM c2t:1`);
    await tx.commit();

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect(readBack).toHaveLength(1);
    expect(await rows()).toEqual(pristine);
  });

  test('readOnly refuses DDL as CerialTransactionError', async () => {
    const tx = await open({ readOnly: true });
    const error = await caught(() => tx.$raw(sql`DEFINE TABLE c2_nope SCHEMALESS`));
    await tx.cancel();

    expect(error).toBeInstanceOf(CerialTransactionError);
  });

  test.each([
    ['no options', undefined],
    ['readOnly: false', { readOnly: false }],
    ['snapshot', { isolation: 'snapshot' as const }],
    ['serializable', { isolation: 'serializable' as const }],
  ])('%s allows the write', async (_name, options) => {
    const tx = await open(options);
    await tx.$raw(rawWrite(9));
    await tx.commit();

    expect(await rows()).toEqual([pristine[0], { id: 'c2t:2', v: 9 }]);
  });

  test('snapshot commits after a read changed elsewhere, serializable refuses at commit', async () => {
    const outcomes: boolean[] = [];
    for (const isolation of ['snapshot', 'serializable'] as const) {
      await db.query('UPDATE c2t:1 SET v = 1').collect();
      const tx = await open({ isolation });
      await tx.$raw(sql`SELECT * FROM c2t:1`);
      await db.query('UPDATE c2t:1 SET v = 77').collect();
      await tx.$raw(rawWrite(isolation === 'snapshot' ? 5 : 6));
      const error = await caught(() => tx.commit());
      outcomes.push(error === undefined || isTransactionConflict((error as { cause?: unknown }).cause));
      expect(error === undefined).toBe(isolation === 'snapshot');
    }

    expect(outcomes).toEqual([true, true]);
  });

  test('concurrent begins with different options keep their own', async () => {
    const wanted = [true, false, true, false, true, false];
    const txs = await Promise.all(wanted.map((readOnly) => open({ readOnly })));
    const errors = await Promise.all(txs.map((tx, i) => caught(() => tx.$raw(rawWrite(10 + i)))));
    await Promise.all(txs.map((tx) => tx.cancel()));

    expect(errors.map((error) => error instanceof CerialTransactionError)).toEqual(wanted);
  });

  test('a plain begin after an options begin carries no options', async () => {
    const readOnly = await open({ readOnly: true });
    const plain = await open();
    await plain.$raw(rawWrite(9));
    await plain.commit();
    await readOnly.cancel();

    expect(await rows()).toEqual([pristine[0], { id: 'c2t:2', v: 9 }]);
  });
});
