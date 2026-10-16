/**
 * Integration tests: a socket whose session is gone raises CerialSessionLostError
 *
 * The sequence is real: the client connects, the server restarts, and the query is refused as the
 * anonymous actor because the session died with the process. It needs a container this machine may
 * restart, named by CERIAL_RESTARTABLE_CONTAINER; the relay stays for the control.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { createConnectionManager, resetConnectionPool, type ConnectionManager } from '../../src/client/connection';
import { Model } from '../../src/client/model/model';
import { CerialDatabaseError, CerialSessionLostError } from '../../src/errors';
import { parseModelRegistry } from '../test-helpers';
import { restartContainer, RESTARTABLE_CONTAINER } from './restartable-container';
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

  // A relay drop preserves the session (the server process still remembers it), so a query after it
  // succeeds. Only a server restart loses the session. The memory backend also loses the table, but the
  // anonymous refusal is raised before any table lookup, so a missing-table error cannot stand in for it.
  test.skipIf(!RESTARTABLE_CONTAINER)(
    'a query after a server restart is a CerialSessionLostError (needs CERIAL_RESTARTABLE_CONTAINER)',
    async () => {
      await restartContainer(RESTARTABLE_CONTAINER!);
      if (surreal.status !== 'connected') await statusReaches(surreal, 'connected');

      const error = await caught(() => model.findMany());

      expect(error).toBeInstanceOf(CerialSessionLostError);
      const lost = error as CerialSessionLostError;
      expect(lost.code).toBe('C1002');
      expect(lost.model).toBe('SessionUser');
      expect(lost.operation).toBe('findMany');
      expect(lost.message).not.toMatch(/credential|permission/i);
    },
    60_000,
  );

  test('control: an authenticated refusal is not a lost session', async () => {
    // The table was never defined, so the live database refuses the query for a reason of its own.
    const error = await caught(() => model.findMany());

    expect(error).toBeInstanceOf(CerialDatabaseError);
    expect(error).not.toBeInstanceOf(CerialSessionLostError);
  });
});
