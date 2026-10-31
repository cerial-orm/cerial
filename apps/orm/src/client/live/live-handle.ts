import type { LiveMessage, LiveSubscription, RecordId, Surreal } from 'surrealdb';
import { LiveSubscriptionError } from 'surrealdb';
import { CerialConnectionError } from '../../errors';
import { wrapDatabaseError } from '../model/wrap-database-error';

/** One change to a record the subscription watches. A deleted record carries the value it had. */
export interface LiveNotification<T = unknown> {
  readonly action: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly recordId: RecordId;
  readonly value: T;
}

/** What the connection manager needs of a handle, so one tracker serves handles of every row type. */
export interface EndableLive {
  _endForDisconnect(): Promise<void>;
}

interface Waiter<T> {
  resolve: (result: IteratorResult<LiveNotification<T>>) => void;
  reject: (error: unknown) => void;
}

/**
 * A managed live subscription. Iterate it with `for await`; `break` kills the query. It ends cleanly when
 * the query is killed, by `kill()`, by the server, or by a deliberate `disconnect()`. It ends with a
 * `CerialConnectionError` when the connection closes with no such call or the subscription cannot resume,
 * so a `for await` never waits on a subscription that is gone.
 * One consumer at a time: a notification goes to whichever `next()` call asks first.
 */
export class CerialLiveHandle<T = unknown>
  implements AsyncIterableIterator<LiveNotification<T>>, AsyncDisposable, EndableLive
{
  readonly #subscription: LiveSubscription;
  readonly #cursor: AsyncIterator<LiveMessage>;
  readonly #queue: Array<LiveNotification<T>> = [];
  readonly #waiters: Array<Waiter<T>> = [];
  readonly #cleanups: Array<() => void> = [];
  readonly #mapValue: ((value: unknown) => unknown) | undefined;
  #ended = false;
  #error: unknown;

  /** @internal Built by `createClientLive`; `track` registers the handle and returns its unregister. */
  constructor(
    subscription: LiveSubscription,
    surreal: Surreal,
    track: (handle: CerialLiveHandle<T>) => () => void,
    mapValue?: (value: unknown) => unknown,
  ) {
    this.#subscription = subscription;
    this.#mapValue = mapValue;
    // The cursor is taken now, in the same turn the subscription is ready, so no notification is dropped.
    this.#cursor = subscription[Symbol.asyncIterator]();
    this.#cleanups.push(
      track(this),
      // The SDK swallows a failed re-listen and keeps `isAlive` true. It reports the failure on the
      // connection but names no subscription, so every handle on the socket ends rather than one hanging.
      surreal.subscribe('error', (error) => {
        if (!(error instanceof LiveSubscriptionError)) return;
        this.#finish(
          new CerialConnectionError('The live subscription could not resume and has ended', {
            operation: '$live',
            cause: error,
          }),
        ).catch(() => {});
      }),
      surreal.subscribe('disconnected', () => {
        this.#finish(
          new CerialConnectionError('The connection closed and the live subscription has ended', {
            operation: '$live',
          }),
        ).catch(() => {});
      }),
    );
    void this.#pump();
  }

  /** True while notifications can still arrive. False once the handle has ended, whatever the driver says. */
  get isAlive(): boolean {
    return !this.#ended && this.#subscription.isAlive;
  }

  /** True when the driver re-registers the query after a reconnect. Always true for this handle. */
  get isManaged(): boolean {
    return this.#subscription.isManaged;
  }

  /** Stop the subscription and kill its query on the server. Safe to call again. */
  async kill(): Promise<void> {
    if (this.#ended) return;
    try {
      await this.#finish();
    } catch (error) {
      throw wrapDatabaseError(error, undefined, '$live');
    }
  }

  /** @internal Ends the handle cleanly for a deliberate `disconnect()`. */
  async _endForDisconnect(): Promise<void> {
    await this.#finish().catch(() => {});
  }

  next(): Promise<IteratorResult<LiveNotification<T>>> {
    const item = this.#queue.shift();
    if (item) return Promise.resolve({ value: item, done: false });
    if (this.#ended) return this.#takeEnd();

    return new Promise((resolve, reject) => {
      this.#waiters.push({ resolve, reject });
    });
  }

  async return(): Promise<IteratorResult<LiveNotification<T>>> {
    await this.kill();

    return { value: undefined, done: true };
  }

  [Symbol.asyncIterator](): this {
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.kill();
  }

  async #pump(): Promise<void> {
    for (;;) {
      const result = await this.#cursor.next();
      if (result.done) break;
      const message = result.value;
      // A KILLED message has no record and no value, so it ends the handle before any mapping.
      if (message.action === 'KILLED') break;
      let value: unknown;
      try {
        value = this.#mapValue ? this.#mapValue(message.value) : message.value;
      } catch (error) {
        // A row that cannot be mapped must not leave the consumer waiting on a stalled pump.
        await this.#finish(error).catch(() => {});

        return;
      }
      this.#push({ action: message.action, recordId: message.recordId, value: value as T });
    }
    await this.#finish().catch(() => {});
  }

  #push(notification: LiveNotification<T>): void {
    if (this.#ended) return;
    const waiter = this.#waiters.shift();
    if (waiter) waiter.resolve({ value: notification, done: false });
    else this.#queue.push(notification);
  }

  /** The error is delivered once, to the first caller that reaches the end; every later call is done. */
  #takeEnd(): Promise<IteratorResult<LiveNotification<T>>> {
    const error = this.#error;
    this.#error = undefined;
    if (error) return Promise.reject(error);

    return Promise.resolve({ value: undefined, done: true });
  }

  /** End the handle now; the returned promise settles when the server-side KILL has. */
  #finish(error?: unknown): Promise<void> {
    if (this.#ended) return Promise.resolve();
    this.#ended = true;
    this.#error = error;
    for (const cleanup of this.#cleanups) cleanup();
    for (const waiter of this.#waiters.splice(0)) this.#takeEnd().then(waiter.resolve, waiter.reject);

    return this.#subscription.kill();
  }
}
