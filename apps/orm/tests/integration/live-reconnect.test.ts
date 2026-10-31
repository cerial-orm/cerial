/**
 * Integration tests: a managed `$live` handle across a transport drop, reconnect exhaustion, a deliberate
 * disconnect and a server restart
 *
 * The transport is cut through a TCP relay, so the shared database keeps running. The restart test needs a
 * container this machine may restart, named by CERIAL_RESTARTABLE_CONTAINER: the memory backend loses every
 * table when it restarts, so run this file apart from the e2e suites. Nothing here creates a container; the
 * ids are compared before and after to prove it.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import { CerialConnectionError } from 'cerial';
import { CerialClient } from '../e2e/generated/client';
import { restartContainer, RESTARTABLE_CONTAINER } from './restartable-container';
import { type Relay, startRelay } from './tcp-relay';

const config = (url: string) => ({
  url,
  auth: { username: 'root', password: 'root' },
  namespace: 'main',
  database: 'main',
});

const containerIds = async (): Promise<string> => {
  const ps = Bun.spawn(['docker', 'ps', '-aq', '--no-trunc'], { stdout: 'pipe', stderr: 'ignore' });
  const ids = (await new Response(ps.stdout).text()).split('\n').filter(Boolean).sort();
  await ps.exited;

  return ids.join('\n');
};

const statusReaches = (surreal: Surreal, status: 'reconnecting' | 'connected'): Promise<void> =>
  new Promise((resolve) => {
    if (surreal.status === status) return resolve();
    const off = surreal.subscribe(status, () => {
      off();
      resolve();
    });
  });

const RELISTEN_SETTLE_MS = 1000;

const SILENCE = Symbol('silence');

/** Resolve with whatever `wait` settles to, or SILENCE when nothing arrives in time. */
const within = async <T>(ms: number, wait: PromiseLike<T>): Promise<T | typeof SILENCE> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof SILENCE>((resolve) => {
    timer = setTimeout(() => resolve(SILENCE), ms);
  });
  try {
    return await Promise.race([wait, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

let counter = 0;
const newUser = () => {
  counter += 1;

  return { email: `live-reconnect-${Date.now()}-${counter}@test.com`, name: 'Live', isActive: true };
};

describe('$live across a reconnect', () => {
  let idsBefore: string;
  let relay: Relay;
  let client: CerialClient;
  let writer: CerialClient;

  beforeAll(async () => {
    idsBefore = await containerIds();
  });

  afterAll(async () => {
    expect(await containerIds()).toBe(idsBefore);
  });

  beforeEach(async () => {
    relay = await startRelay();
    client = new CerialClient();
    await client.connect(config(`ws://127.0.0.1:${relay.port}`));
    // A second connection straight to the database, so a write never travels the line under test.
    writer = new CerialClient();
    await writer.connect(config('ws://127.0.0.1:8000'));
    await writer.migrate();
    await writer.db.User.deleteMany({ where: {} });
  });

  afterEach(async () => {
    await writer.disconnect().catch(() => {});
    await client.disconnect().catch(() => {});
    relay.sever();
  });

  test('a transport drop is survived: one notification per write, none after kill()', async () => {
    const handle = await client.$live('user');
    const surreal = client.getSurreal()!;
    expect(handle.isManaged).toBe(true);

    const reconnecting = statusReaches(surreal, 'reconnecting');
    relay.drop();
    await within(5000, reconnecting);
    await within(10_000, statusReaches(surreal, 'connected'));
    expect(handle.isAlive).toBe(true);
    // `connected` fires before the driver has re-registered the query; a write inside that window is lost.
    await Bun.sleep(RELISTEN_SETTLE_MS);

    await writer.db.User.create({ data: newUser() });
    const first = await within(5000, handle.next());
    expect(first).not.toBe(SILENCE);
    expect((first as IteratorResult<{ action: string }>).value.action).toBe('CREATE');
    // Exactly once: a re-listen that registered twice would deliver a duplicate.
    expect(await within(1500, handle.next())).toBe(SILENCE);

    await handle.kill();
    await writer.db.User.create({ data: newUser() });

    expect(handle.isAlive).toBe(false);
    expect(await within(1500, handle.next())).toEqual({ value: undefined, done: true });
  }, 30_000);

  test('control: an unmanaged LIVE query hears nothing after the same drop', async () => {
    const surreal = client.getSurreal()!;
    await client.migrate();
    const [id] = await surreal.query('LIVE SELECT * FROM user').collect<[never]>();
    const unmanaged = await surreal.liveOf(id as never);
    const cursor = unmanaged[Symbol.asyncIterator]();

    const reconnecting = statusReaches(surreal, 'reconnecting');
    relay.drop();
    await within(5000, reconnecting);
    await within(10_000, statusReaches(surreal, 'connected'));
    await Bun.sleep(RELISTEN_SETTLE_MS);
    await writer.db.User.create({ data: newUser() });

    // Silence, or an ended iterator: either way no CREATE arrives, so the managed test can fail.
    const heard = await within(2500, cursor.next());
    const notified = heard !== SILENCE && !heard.done;
    expect(notified).toBe(false);
    await unmanaged.kill().catch(() => {});
  }, 30_000);

  test('reconnect exhaustion ends the iterator with a CerialConnectionError inside the retry budget', async () => {
    const handle = await client.$live('user');
    const pending = handle.next().then(
      () => undefined,
      (error: unknown) => error,
    );

    relay.sever();
    const error = await within(7500 + 3000, pending);

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect(handle.isAlive).toBe(false);
  }, 30_000);

  test('a deliberate disconnect on a healthy socket ends the iterator cleanly', async () => {
    const handle = await client.$live('user');
    const pending = handle.next();

    await client.disconnect();

    expect(await within(3000, pending)).toEqual({ value: undefined, done: true });
    expect(handle.isAlive).toBe(false);
  });

  // The restart destroys the session the subscription was anchored to, so notifications may not resume.
  // The floor is that the handle says so: an iterator that ends with a CerialConnectionError, never silence.
  test.skipIf(!RESTARTABLE_CONTAINER)(
    'a server restart ends the iterator with a CerialConnectionError (needs CERIAL_RESTARTABLE_CONTAINER)',
    async () => {
      const direct = new CerialClient();
      await direct.connect(config('ws://127.0.0.1:8000'));
      const handle = await direct.$live('user');
      expect(handle.isManaged).toBe(true);
      const pending = handle.next().then(
        () => undefined,
        (error: unknown) => error,
      );

      await writer.disconnect().catch(() => {});
      await restartContainer(RESTARTABLE_CONTAINER!);

      // The table is gone with the memory backend, so a fresh client re-migrates before it writes.
      const fresh = new CerialClient();
      try {
        await fresh.connect(config('ws://127.0.0.1:8000'));
        await fresh.migrate();
        await fresh.db.User.create({ data: newUser() });
        const outcome = await within(10_000, pending);

        expect(outcome).toBeInstanceOf(CerialConnectionError);
        expect(handle.isAlive).toBe(false);
      } finally {
        await fresh.disconnect().catch(() => {});
        await direct.disconnect().catch(() => {});
      }
    },
    60_000,
  );

  // The documented recipe, measured: the same client disconnects and connects again inside the watch loop.
  test.skipIf(!RESTARTABLE_CONTAINER)(
    'after a server restart, disconnect then connect on the same client resubscribes and delivers',
    async () => {
      const direct = new CerialClient();
      await direct.connect(config('ws://127.0.0.1:8000'));
      const handle = await direct.$live('user');
      const ended = handle.next().then(
        () => undefined,
        (error: unknown) => error,
      );

      await writer.disconnect().catch(() => {});
      await restartContainer(RESTARTABLE_CONTAINER!);

      const fresh = new CerialClient();
      try {
        await fresh.connect(config('ws://127.0.0.1:8000'));
        await fresh.migrate();
        expect(await within(10_000, ended)).toBeInstanceOf(CerialConnectionError);

        await direct.disconnect();
        await direct.connect(config('ws://127.0.0.1:8000'));
        const resubscribed = await direct.$live('user');
        try {
          await fresh.db.User.create({ data: newUser() });
          const heard = await within(5000, resubscribed.next());

          expect(heard).not.toBe(SILENCE);
          expect((heard as IteratorResult<{ action: string }>).value.action).toBe('CREATE');
        } finally {
          await resubscribed.kill().catch(() => {});
        }
      } finally {
        await fresh.disconnect().catch(() => {});
        await direct.disconnect().catch(() => {});
      }
    },
    60_000,
  );
});
