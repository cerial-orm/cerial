/**
 * The legacy `Cerial` class: each `onDuplicateConnection` mode behaves differently, and only
 * `use_existing` leaves the socket count alone. The `Surreal` client is counted through a module
 * mock, so no database is needed.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as realSurreal from 'surrealdb';
import { CerialConnectionError } from '../../src/errors';
import type { Cerial as CerialClass } from '../../src/index';

const constructed: realSurreal.Surreal[] = [];

class CountingSurreal extends realSurreal.Surreal {
  constructor() {
    super();
    constructed.push(this);
  }
}

let Cerial: typeof CerialClass;

beforeAll(async () => {
  mock.module('surrealdb', () => ({ ...realSurreal, Surreal: CountingSurreal }));
  ({ Cerial } = await import('../../src/index'));
});

afterAll(() => {
  // mock.module is process-wide; hand the real client back to every later test file.
  mock.module('surrealdb', () => realSurreal);
});

const url = 'http://127.0.0.1:8000';

// `_isConnected` is private; flipping it stands in for a live connection without opening a socket.
function markConnected(instance: CerialClass): void {
  (instance as unknown as { _isConnected: boolean })._isConnected = true;
}

describe('Cerial.create duplicate connections', () => {
  beforeEach(() => {
    constructed.length = 0;
    (Cerial as unknown as { instances: Record<string, unknown> }).instances = {};
  });

  test('a fresh name registers one instance under that name', async () => {
    const a = await Cerial.create({ url, name: 'a' });

    expect(Cerial.getInstance('a')).toBe(a);
    expect(a.getConnectionName()).toBe('a');
    expect(constructed).toHaveLength(1);
  });

  test('the name defaults to "default" and the mode to use_existing', async () => {
    const first = await Cerial.create({ url });
    const second = await Cerial.create({ url });

    expect(first.getConnectionName()).toBe('default');
    expect(second).toBe(first);
  });

  test('use_existing returns the registered instance and builds no second client', async () => {
    const first = await Cerial.create({ url, name: 'a', onDuplicateConnection: 'use_existing' });
    const second = await Cerial.create({ url, name: 'a', onDuplicateConnection: 'use_existing' });

    expect(second).toBe(first);
    expect(Cerial.getInstance('a')).toBe(first);
    expect(constructed).toHaveLength(1);
  });

  test('use_existing keeps the existing connection open', async () => {
    const first = await Cerial.create({ url, name: 'a' });
    markConnected(first);
    const close = spyOn(first.getDB(), 'close').mockResolvedValue(true);

    await Cerial.create({ url, name: 'a' });

    expect(close).not.toHaveBeenCalled();
    expect(first.isConnected()).toBe(true);
  });

  test('overwrite registers a new instance and closes the one it displaces', async () => {
    const first = await Cerial.create({ url, name: 'a' });
    markConnected(first);
    const close = spyOn(first.getDB(), 'close').mockResolvedValue(true);

    const second = await Cerial.create({ url, name: 'a', onDuplicateConnection: 'overwrite' });

    expect(second).not.toBe(first);
    expect(Cerial.getInstance('a')).toBe(second);
    expect(close).toHaveBeenCalledTimes(1);
    expect(first.isConnected()).toBe(false);
    expect(constructed).toHaveLength(2);
  });

  test('overwrite of a never-connected instance still replaces it', async () => {
    const first = await Cerial.create({ url, name: 'a' });
    const second = await Cerial.create({ url, name: 'a', onDuplicateConnection: 'overwrite' });

    expect(second).not.toBe(first);
    expect(Cerial.getInstance('a')).toBe(second);
  });

  test('throw rejects with CerialConnectionError and leaves the registry alone', async () => {
    const first = await Cerial.create({ url, name: 'a' });

    await expect(Cerial.create({ url, name: 'a', onDuplicateConnection: 'throw' })).rejects.toBeInstanceOf(
      CerialConnectionError,
    );

    expect(Cerial.getInstance('a')).toBe(first);
    expect(constructed).toHaveLength(1);
  });

  test('throw on a fresh name does not throw', async () => {
    const a = await Cerial.create({ url, name: 'fresh', onDuplicateConnection: 'throw' });

    expect(Cerial.getInstance('fresh')).toBe(a);
  });

  test('overwrite keeps the old registration when closing it fails', async () => {
    const first = await Cerial.create({ url, name: 'a' });
    markConnected(first);
    spyOn(first.getDB(), 'close').mockRejectedValue(new Error('close failed'));

    await expect(Cerial.create({ url, name: 'a', onDuplicateConnection: 'overwrite' })).rejects.toThrow('close failed');

    expect(Cerial.getInstance('a')).toBe(first);
    expect(constructed).toHaveLength(1);
  });

  test('different names never collide', async () => {
    const a = await Cerial.create({ url, name: 'a', onDuplicateConnection: 'throw' });
    const b = await Cerial.create({ url, name: 'b', onDuplicateConnection: 'throw' });

    expect(a).not.toBe(b);
    expect(constructed).toHaveLength(2);
  });
});
