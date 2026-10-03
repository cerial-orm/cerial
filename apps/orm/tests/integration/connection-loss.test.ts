/**
 * Integration tests: a dropped socket is a CerialConnectionError
 *
 * The socket is dropped for real, without touching the shared database: the client connects through a
 * TCP relay owned by this file, and the test destroys the relay's sockets and stops it. The driver
 * sees what it sees when a server or network goes away mid-session, a connection closed by the peer
 * that cannot be re-opened. What it cannot reproduce is a server that restarts and accepts the
 * reconnect; no test here may stop the shared database to try.
 *
 * The driver here is built with `reconnect: false`. Cerial's own pooled connection reconnects by
 * default, and a call made while it retries waits about a minute before CallTerminatedError, which
 * is too slow for a test. Reusing a dead pooled connection is a lifecycle question rather than a
 * naming one, and the error that arrives is the same class either way.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { type Socket as BunSocket, listen, type TCPSocketListener } from 'bun';
import { Surreal } from 'surrealdb';
import { createCerialTransactionProxy } from '../../src/client/cerial-transaction';
import { Model } from '../../src/client/model/model';
import { CerialConnectionError, CerialDatabaseError, CerialTransactionError } from '../../src/errors';
import { parseModelRegistry } from '../test-helpers';

const registry = parseModelRegistry(`
model LossUser {
  id Record @id
  email Email @unique
  name String
}
`);

interface Relay {
  readonly port: number;
  /** Close every open connection and stop accepting new ones. */
  sever(): void;
}

/** Relay TCP to the shared database so the test can cut the line without touching the database. */
async function startRelay(): Promise<Relay> {
  const pairs = new Set<{ client: BunSocket<unknown>; upstream: BunSocket<unknown> }>();
  const server: TCPSocketListener<{ peer?: BunSocket<unknown>; queued: Uint8Array[] }> = listen({
    hostname: '127.0.0.1',
    port: 0,
    socket: {
      async open(client) {
        client.data = { queued: [] };
        const upstream = await Bun.connect({
          hostname: '127.0.0.1',
          port: 8000,
          socket: {
            data: (_s, chunk) => {
              client.write(chunk);
            },
            close: () => {
              client.end();
            },
            error: () => {
              client.end();
            },
          },
        });
        client.data.peer = upstream;
        pairs.add({ client, upstream });
        for (const chunk of client.data.queued) upstream.write(chunk);
      },
      data(client, chunk) {
        if (client.data.peer) client.data.peer.write(chunk);
        else client.data.queued.push(new Uint8Array(chunk));
      },
      close: (client) => {
        client.data.peer?.end();
      },
      error: (client) => {
        client.data.peer?.end();
      },
    },
  });

  return {
    port: server.port,
    sever() {
      server.stop(true);
      for (const { client, upstream } of pairs) {
        client.terminate();
        upstream.terminate();
      }
    },
  };
}

const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

describe('connection loss', () => {
  let relay: Relay;
  let surreal: Surreal;
  let model: Model;

  beforeEach(async () => {
    relay = await startRelay();
    surreal = new Surreal();
    await surreal.connect(`ws://127.0.0.1:${relay.port}/rpc`, {
      reconnect: false,
      namespace: 'main',
      database: 'main',
      authentication: { username: 'root', password: 'root' },
    });
    model = new Model(surreal, registry.LossUser!);
  });

  afterEach(async () => {
    await surreal.close().catch(() => {});
    relay.sever();
  });

  test('control: the connection through the relay works before it is cut', async () => {
    const [one] = await surreal.query<[number]>('RETURN 1').collect();

    expect(one).toBe(1);
  });

  test('a query after the socket drops is a CerialConnectionError naming the call, with the driver error as cause', async () => {
    relay.sever();
    const error = await caught(() => model.findMany());

    expect(error).toBeInstanceOf(CerialConnectionError);
    const lost = error as CerialConnectionError;
    expect(lost.code).toBe('C1001');
    expect(lost.model).toBe('LossUser');
    expect(lost.operation).toBe('findMany');
    expect(lost.cause).toBeInstanceOf(Error);
    expect(lost).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a write after the socket drops is classified under its own operation', async () => {
    relay.sever();
    const error = await caught(() => model.create({ data: { email: 'a@x.io', name: 'a' } }));

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect((error as CerialConnectionError).operation).toBe('create');
  });

  test('committing a transaction after the socket drops is a CerialConnectionError', async () => {
    const txn = createCerialTransactionProxy(await surreal.beginTransaction(), registry);
    relay.sever();
    const error = await caught(() => txn.commit());

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect((error as CerialConnectionError).operation).toBe('commit');
    expect((error as CerialConnectionError).model).toBeUndefined();
  });

  test('cancelling a transaction after the socket drops is a CerialConnectionError', async () => {
    const txn = createCerialTransactionProxy(await surreal.beginTransaction(), registry);
    relay.sever();
    const error = await caught(() => txn.cancel());

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect((error as CerialConnectionError).operation).toBe('cancel');
  });

  test('control: a driver error that is not connection loss is not a CerialConnectionError', async () => {
    // The table was never defined, so the live database refuses the query itself.
    const error = await caught(() => model.findMany());

    expect(error).toBeInstanceOf(CerialDatabaseError);
    expect(error).not.toBeInstanceOf(CerialConnectionError);
  });

  test('control: using an ended transaction stays a CerialTransactionError, not a connection error', async () => {
    const txn = createCerialTransactionProxy(await surreal.beginTransaction(), registry);
    await txn.commit();
    const error = await caught(() => txn.commit());

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect(error).not.toBeInstanceOf(CerialConnectionError);
  });
});
