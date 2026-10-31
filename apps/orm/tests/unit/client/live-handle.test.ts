import { describe, expect, test } from 'bun:test';
import type { LiveMessage, LiveSubscription, RecordId, Surreal } from 'surrealdb';
import { LiveSubscriptionError } from 'surrealdb';
import { CerialLiveHandle } from '../../../src/client/live';
import { markSubscribeFailure } from '../../../src/client/live/live-handle';
import { CerialConnectionError } from '../../../src/errors';

type Listener = (...args: unknown[]) => void;

/** A driver subscription the test feeds by hand. `sdkAlive` is what the driver claims about itself. */
function makeFakes() {
  const queue: LiveMessage[] = [];
  let wake: ((result: IteratorResult<LiveMessage>) => void) | undefined;
  let closed = false;
  const listeners = new Map<string, Set<Listener>>();
  let kills = 0;
  const state = { sdkAlive: true };

  const subscription = {
    get isAlive() {
      return state.sdkAlive;
    },
    isManaged: true,
    kill: async () => {
      kills++;
      closed = true;
      wake?.({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]: () => ({
      next: () => {
        const message = queue.shift();
        if (message) return Promise.resolve({ value: message, done: false as const });
        if (closed) return Promise.resolve({ value: undefined, done: true as const });

        return new Promise<IteratorResult<LiveMessage>>((resolve) => {
          wake = resolve;
        });
      },
    }),
  } as unknown as LiveSubscription;

  const surreal = {
    subscribe: (event: string, listener: Listener) => {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);

      return () => set.delete(listener);
    },
  } as unknown as Surreal;

  return {
    subscription,
    surreal,
    state,
    kills: () => kills,
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
    emit: (event: string, ...args: unknown[]) => listeners.get(event)?.forEach((l) => l(...args)),
    feed: (message: unknown) => {
      const live = message as LiveMessage;
      if (wake) {
        const resolve = wake;
        wake = undefined;
        resolve({ value: live, done: false });
      } else queue.push(live);
    },
  };
}

const record = (action: string, value: unknown) => ({
  queryId: 'q',
  action,
  recordId: { id: 1 } as unknown as RecordId,
  value,
});
const KILLED = { queryId: 'q', action: 'KILLED' };

function open() {
  const fakes = makeFakes();
  let tracked = 0;
  let untracked = 0;
  const handle = new CerialLiveHandle<{ n: number }>(fakes.subscription, fakes.surreal, () => {
    tracked++;

    return () => {
      untracked++;
    };
  });

  return { ...fakes, handle, counts: () => ({ tracked, untracked }) };
}

describe('CerialLiveHandle', () => {
  test('is managed and alive when opened, and delivers notifications in order', async () => {
    const { handle, feed } = open();
    expect(handle.isManaged).toBe(true);
    expect(handle.isAlive).toBe(true);

    feed(record('CREATE', { n: 1 }));
    feed(record('UPDATE', { n: 2 }));

    expect((await handle.next()).value).toMatchObject({ action: 'CREATE', value: { n: 1 } });
    expect((await handle.next()).value).toMatchObject({ action: 'UPDATE', value: { n: 2 } });
    await handle.kill();
  });

  test('KILLED ends the handle cleanly and is never mapped: no TypeError, isAlive false', async () => {
    const { handle, feed } = open();
    feed(record('CREATE', { n: 1 }));
    feed(KILLED);

    expect((await handle.next()).value).toMatchObject({ action: 'CREATE' });
    expect(await handle.next()).toEqual({ value: undefined, done: true });
    expect(handle.isAlive).toBe(false);
  });

  test('KILLED reaching a waiting next() resolves it done', async () => {
    const { handle, feed } = open();
    const pending = handle.next();
    feed(KILLED);

    expect(await pending).toEqual({ value: undefined, done: true });
  });

  test('isAlive reads false once ended even while the driver still claims it is alive', async () => {
    const { handle, state } = open();
    state.sdkAlive = true;
    await handle.kill();

    expect(handle.isAlive).toBe(false);
  });

  test('kill() is idempotent, kills once and unregisters', async () => {
    const { handle, kills, counts } = open();
    await handle.kill();
    await handle.kill();

    expect(kills()).toBe(1);
    expect(counts()).toEqual({ tracked: 1, untracked: 1 });
  });

  test('leaving a for await with break kills the query', async () => {
    const { handle, feed, kills } = open();
    feed(record('CREATE', { n: 1 }));
    for await (const item of handle) {
      expect(item.value.n).toBe(1);
      break;
    }

    expect(kills()).toBe(1);
    expect(handle.isAlive).toBe(false);
  });

  test('asyncDispose kills', async () => {
    const { handle, kills } = open();
    await handle[Symbol.asyncDispose]();

    expect(kills()).toBe(1);
  });

  test('a failed re-listen ends a waiting iterator with a taxonomy error, once', async () => {
    const { handle, emit } = open();
    const pending = handle.next();
    emit('error', new LiveSubscriptionError('relisten failed'));

    await expect(pending).rejects.toBeInstanceOf(CerialConnectionError);
    expect(handle.isAlive).toBe(false);
    expect(await handle.next()).toEqual({ value: undefined, done: true });
  });

  test('an error marked as a first-subscribe failure leaves the handle alive', async () => {
    const { handle, emit } = open();
    const failure = new LiveSubscriptionError('bad fragment');
    // The driver publishes the event first and the caller's rejection after, so the mark lands later.
    emit('error', failure);
    markSubscribeFailure(failure);
    await Bun.sleep(10);

    expect(handle.isAlive).toBe(true);
    await handle.kill();
  });

  test('a failed re-listen still ends the handle while a first subscribe fails at the same time', async () => {
    const { handle, emit } = open();
    const pending = handle.next();
    const subscribeFailure = new LiveSubscriptionError('bad fragment');
    const relistenFailure = new LiveSubscriptionError('relisten failed');
    emit('error', subscribeFailure);
    emit('error', relistenFailure);
    markSubscribeFailure(subscribeFailure);

    await expect(pending).rejects.toBeInstanceOf(CerialConnectionError);
    expect(handle.isAlive).toBe(false);
  });

  test('queued notifications drain before the error is raised', async () => {
    const { handle, feed, emit } = open();
    feed(record('CREATE', { n: 1 }));
    await Promise.resolve();
    await Promise.resolve();
    emit('error', new LiveSubscriptionError('relisten failed'));

    expect((await handle.next()).value).toMatchObject({ value: { n: 1 } });
    await expect(handle.next()).rejects.toBeInstanceOf(CerialConnectionError);
  });

  test('an error that is not a live failure is ignored', async () => {
    const { handle, emit } = open();
    emit('error', new Error('something else'));

    expect(handle.isAlive).toBe(true);
    await handle.kill();
  });

  test('disconnected with no deliberate call ends a waiting for await with a taxonomy error', async () => {
    const { handle, emit } = open();
    const pending = handle.next();
    emit('disconnected');

    await expect(pending).rejects.toBeInstanceOf(CerialConnectionError);
    expect(handle.isAlive).toBe(false);
  });

  test('_endForDisconnect ends cleanly, and the later disconnected event adds no error', async () => {
    const { handle, emit } = open();
    const pending = handle.next();
    await handle._endForDisconnect();
    emit('disconnected');

    expect(await pending).toEqual({ value: undefined, done: true });
    expect(await handle.next()).toEqual({ value: undefined, done: true });
  });

  test('ending removes its event listeners', async () => {
    const { handle, listenerCount } = open();
    expect(listenerCount('error')).toBe(1);
    expect(listenerCount('disconnected')).toBe(1);
    await handle.kill();

    expect(listenerCount('error')).toBe(0);
    expect(listenerCount('disconnected')).toBe(0);
  });
});
