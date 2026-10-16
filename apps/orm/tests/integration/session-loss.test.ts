/**
 * Integration tests: a socket whose session is gone raises CerialSessionLostError
 *
 * The sequence is real. The client connects through a TCP relay owned by this file, the relay drops
 * the transport, and the driver reconnects to a new server-side session that is unauthenticated, so the
 * query is refused as the anonymous actor. The shared database is never stopped.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { createConnectionManager, resetConnectionPool, type ConnectionManager } from '../../src/client/connection';
import { Model } from '../../src/client/model/model';
import { CerialDatabaseError, CerialSessionLostError } from '../../src/errors';
import { parseModelRegistry } from '../test-helpers';
import { type Relay, startRelay } from './tcp-relay';

const registry = parseModelRegistry(`
model SessionUser {
  id Record @id
  name String
}
`);

const statusReaches = (surreal: Surreal, status: 'reconnecting' | 'connected'): Promise<void> =>
  new Promise((resolve) => {
    if (surreal.status === status) return resolve();
    const off = surreal.subscribe(status, () => {
      off();
      resolve();
    });
  });

const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

describe('session loss', () => {
  let relay: Relay;
  let manager: ConnectionManager;
  let surreal: Surreal;
  let model: Model;

  beforeEach(async () => {
    relay = await startRelay();
    manager = createConnectionManager(registry);
    await manager.connect({
      url: `ws://127.0.0.1:${relay.port}`,
      auth: { username: 'root', password: 'root' },
      namespace: 'main',
      database: 'main',
    });
    surreal = manager.getQuerySurreal()!;
    model = new Model(surreal, registry.SessionUser!);
  });

  afterEach(async () => {
    await manager.disconnectAll();
    await resetConnectionPool();
    relay.sever();
  });

  test('a query after the transport drops and reconnects is a CerialSessionLostError', async () => {
    const reconnecting = statusReaches(surreal, 'reconnecting');
    relay.drop();
    await reconnecting;
    await statusReaches(surreal, 'connected');

    const error = await caught(() => model.findMany());

    expect(error).toBeInstanceOf(CerialSessionLostError);
    const lost = error as CerialSessionLostError;
    expect(lost.code).toBe('C1002');
    expect(lost.model).toBe('SessionUser');
    expect(lost.operation).toBe('findMany');
    expect(lost.message).not.toMatch(/credential|permission/i);
  });

  test('control: an authenticated refusal is not a lost session', async () => {
    // The table was never defined, so the live database refuses the query for a reason of its own.
    const error = await caught(() => model.findMany());

    expect(error).toBeInstanceOf(CerialDatabaseError);
    expect(error).not.toBeInstanceOf(CerialSessionLostError);
  });
});
