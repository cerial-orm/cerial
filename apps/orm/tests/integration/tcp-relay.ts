/**
 * A TCP relay to the shared database, so a test can cut the line without touching the database.
 */

import { type Socket as BunSocket, listen, type TCPSocketListener } from 'bun';

export interface Relay {
  readonly port: number;
  /** Close every open connection but keep accepting new ones, so a driver that reconnects succeeds. */
  drop(): void;
  /** Close every open connection and stop accepting new ones. */
  sever(): void;
}

/** Relay TCP to the shared database so the test can cut the line without touching the database. */
export async function startRelay(): Promise<Relay> {
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

  const dropPairs = (): void => {
    for (const { client, upstream } of pairs) {
      client.terminate();
      upstream.terminate();
    }
    pairs.clear();
  };

  return {
    port: server.port,
    drop: dropPairs,
    sever() {
      server.stop(true);
      dropPairs();
    },
  };
}
