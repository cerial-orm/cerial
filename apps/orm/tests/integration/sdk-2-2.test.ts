/**
 * Integration tests: the SDK 2.1+ behaviours the client relies on.
 *
 * A refused connect rejects instead of hanging, `Query.collect()` throws the root cause that the
 * error classifier reads, and a write conflict is recognised from its structured detail so
 * `TransactionOptions.retries` retries it and nothing else. Uses a throwaway database in the shared
 * instance, removed afterwards.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { listen } from 'bun';
import { Surreal } from 'surrealdb';
import { ConnectionManager } from '../../src/client/connection';
import { wrapDatabaseError } from '../../src/client/model/wrap-database-error';
import { CerialConnectionError, CerialDatabaseError, CerialUniqueConstraintError } from '../../src/errors';
import {
  executeClientTransaction,
  isTransactionConflict,
  type TransactionExecutionItem,
} from '../../src/query/executor';
import { parseModelRegistry } from '../test-helpers';

const NAMESPACE = 'main';
const DATABASE = `sdk22_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
const registry = parseModelRegistry(`
model Sdk22 {
  id Record @id
  email Email @unique
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

/** A port nothing listens on: bind one, read it, release it. */
function freePort(): number {
  const server = listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const { port } = server;
  server.stop(true);

  return port;
}

beforeAll(async () => {
  db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: NAMESPACE,
    authentication: { username: 'root', password: 'root' },
  });
  await db.query(`DEFINE DATABASE ${DATABASE}`).collect();
  await db.use({ namespace: NAMESPACE, database: DATABASE });
  await db
    .query(
      'DEFINE TABLE sdk_uq SCHEMALESS; DEFINE INDEX uq ON sdk_uq FIELDS email UNIQUE; DEFINE TABLE sdk_cf SCHEMALESS; CREATE sdk_cf:1 SET n = 0',
    )
    .collect();
});

afterAll(async () => {
  await db.query(`REMOVE DATABASE ${DATABASE}`).collect();
  await db.close();
});

describe('refused connect', () => {
  test('a port nothing listens on rejects with CerialConnectionError, within the bound', async () => {
    const manager = new ConnectionManager(registry);
    const error = await caught(() =>
      Promise.race([
        manager.connect({ url: `ws://127.0.0.1:${freePort()}`, namespace: NAMESPACE, database: DATABASE }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('connect hung')), 10_000)),
      ]),
    );

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect(manager.isConnected()).toBe(false);
  }, 15_000);

  test('control: the live port connects and is not a connection error', async () => {
    const manager = new ConnectionManager(registry);
    await manager.connect({
      url: 'ws://127.0.0.1:8000',
      namespace: NAMESPACE,
      database: DATABASE,
      auth: { username: 'root', password: 'root' },
    });

    expect(manager.isConnected()).toBe(true);
    await manager.disconnectAll();
  });
});

describe('Query.collect() root cause', () => {
  test('a unique violation classifies as the unique-constraint error', async () => {
    await db.query("CREATE sdk_uq:a SET email = 'a@x.io'").collect();
    const raw = await caught(() => db.query("CREATE sdk_uq:b SET email = 'a@x.io'").collect());
    const error = wrapDatabaseError(raw, 'Sdk22', 'create');

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    const unique = error as CerialUniqueConstraintError;
    expect(unique.index).toBe('uq');
    expect(unique.record).toBe('sdk_uq:a');
  });

  test('a non-unique error is a CerialDatabaseError, not a unique violation', async () => {
    const raw = await caught(() => db.query("THROW 'boom'").collect());
    const error = wrapDatabaseError(raw, 'Sdk22', 'create');

    expect(error).toBeInstanceOf(CerialDatabaseError);
    expect(error).not.toBeInstanceOf(CerialUniqueConstraintError);
  });
});

describe('write conflict and retries', () => {
  const write: TransactionExecutionItem = {
    compiledQuery: { text: 'UPDATE sdk_cf:1 SET n += 1', vars: {} },
    resultType: 'raw',
  };

  test('a real write conflict is retryable and a non-conflict error is not', async () => {
    const a = await db.beginTransaction();
    const b = await db.beginTransaction();
    await (a as unknown as Surreal).query('UPDATE sdk_cf:1 SET n += 1').collect();
    await (b as unknown as Surreal).query('UPDATE sdk_cf:1 SET n += 1').collect();
    await a.commit();
    const conflict = await caught(() => b.commit());
    const other = await caught(() => db.query("THROW 'boom'").collect());

    expect(isTransactionConflict(conflict)).toBe(true);
    expect(isTransactionConflict(other)).toBe(false);
  });

  test('retries re-runs the transaction after a conflict and succeeds', async () => {
    let attempts = 0;
    const interfere: TransactionExecutionItem = async () => {
      attempts++;
      if (attempts === 1) await db.query('UPDATE sdk_cf:1 SET n += 100').collect();
    };

    await executeClientTransaction(db, [write, interfere], { retries: 1, backoff: () => 0 });

    expect(attempts).toBe(2);
  });

  test('without retries the conflict reaches the caller', async () => {
    let attempts = 0;
    const interfere: TransactionExecutionItem = async () => {
      attempts++;
      await db.query('UPDATE sdk_cf:1 SET n += 100').collect();
    };
    const error = await caught(() => executeClientTransaction(db, [write, interfere], { backoff: () => 0 }));

    expect(isTransactionConflict(error)).toBe(true);
    expect(attempts).toBe(1);
  });

  test('a non-conflict error is not retried even with retries set', async () => {
    let attempts = 0;
    const fail: TransactionExecutionItem = async () => {
      attempts++;
      await db.query("THROW 'boom'").collect();
    };
    const error = await caught(() => executeClientTransaction(db, [fail], { retries: 3, backoff: () => 0 }));

    expect(error).toBeDefined();
    expect(isTransactionConflict(error)).toBe(false);
    expect(attempts).toBe(1);
  });
});
