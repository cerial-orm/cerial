import { describe, expect, test } from 'bun:test';
import { ConnectionUnavailableError, LiveSubscriptionError, type Surreal } from 'surrealdb';
import { createClientLive } from '../../../src/client/live';
import { CerialConnectionError, CerialValidationError } from '../../../src/errors';

/** A socket whose subscribe rejects the way the driver does: a LiveSubscriptionError around the cause. */
const failingDb = (cause: unknown): (() => Promise<Surreal>) => {
  const error = new LiveSubscriptionError(cause);

  return async () =>
    ({
      live: () => ({ where: () => Promise.reject(error) }),
    }) as unknown as Surreal;
};

const track = () => () => {};

describe('createClientLive', () => {
  test('a subscribe failure is classified by its cause, not by the driver wrapper', async () => {
    const outcome = await createClientLive('user', undefined, failingDb(new ConnectionUnavailableError()), track).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(outcome).toBeInstanceOf(CerialConnectionError);
  });

  test('a where key holding undefined refuses before the connection is touched', async () => {
    let touched = false;
    const getDb = async (): Promise<Surreal> => {
      touched = true;
      throw new Error('unreachable');
    };

    await expect(createClientLive('user', { where: undefined }, getDb, track)).rejects.toBeInstanceOf(
      CerialValidationError,
    );
    expect(touched).toBe(false);
  });
});
