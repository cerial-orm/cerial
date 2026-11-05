/**
 * E2E transaction context: a client cannot open a second transaction on the connection its scope runs on,
 * while a different client can. Refusals are CerialTransactionError and leave the outer transaction usable.
 */

import { describe, expect, test } from 'bun:test';
import { CerialTransactionError } from 'cerial';
import { createTestClient, testConfig } from '../../test-helper';
import { caught, tagNames, useClient } from './helpers';

describe('E2E transaction context: nested transactions', () => {
  const get = useClient();
  const NESTED = 'Nested transactions are not supported';

  test('callback mode: $transaction on the same client inside the callback is refused', async () => {
    const client = get();
    let inner: unknown;
    await client.$transaction(async () => {
      inner = await caught(() => client.$transaction(async () => undefined));
    });

    expect(inner).toBeInstanceOf(CerialTransactionError);
    expect((inner as CerialTransactionError).message).toBe(NESTED);
    expect((inner as CerialTransactionError).operation).toBe('$transaction');
  });

  test('every mode of the inner call is refused: array, callback and manual', async () => {
    const client = get();
    const inner: unknown[] = [];
    await client.$transaction(async () => {
      inner.push(await caught(() => client.$transaction([client.db.BasicsTag.count()])));
      inner.push(await caught(() => client.$transaction(async () => undefined)));
      inner.push(await caught(() => client.$transaction()));
    });

    expect(inner).toHaveLength(3);
    for (const error of inner) {
      expect(error).toBeInstanceOf(CerialTransactionError);
      expect((error as Error).message).toBe(NESTED);
    }
  });

  test('array mode: $transaction on the same client inside a function item is refused', async () => {
    const client = get();
    let inner: unknown;
    await client.$transaction([
      async () => {
        inner = await caught(() => client.$transaction(async () => undefined));
      },
    ]);

    expect((inner as CerialTransactionError).message).toBe(NESTED);
  });

  test('the outer transaction survives the refusal and commits its writes', async () => {
    const client = get();
    await client.$transaction(async () => {
      await client.db.BasicsTag.create({ data: { name: 'before' } });
      await caught(() => client.$transaction(async () => undefined));
      await client.db.BasicsTag.create({ data: { name: 'after' } });
    });

    expect(await tagNames(client)).toEqual(['after', 'before']);
  });

  test('a refusal that escapes the callback rolls the outer transaction back', async () => {
    const client = get();
    const error = await caught(() =>
      client.$transaction(async () => {
        await client.db.BasicsTag.create({ data: { name: 'before' } });
        await client.$transaction(async () => undefined);
      }),
    );

    expect((error as Error).message).toBe(NESTED);
    expect(await tagNames(client)).toEqual([]);
  });

  test('positive: outside any scope the same call is allowed', async () => {
    const client = get();
    const result = await client.$transaction(async () => 'ok');

    expect(result).toBe('ok');
  });

  test('positive: after the outer transaction ended, a new one on the same client works', async () => {
    const client = get();
    await client.$transaction(async () => undefined);
    await client.$transaction(async () => {
      await client.db.BasicsTag.create({ data: { name: 'second' } });
    });

    expect(await tagNames(client)).toEqual(['second']);
  });

  test("positive: another client's $transaction inside the scope is allowed and commits on its own", async () => {
    const client = get();
    const other = createTestClient();
    await other.connect(testConfig);
    try {
      await caught(() =>
        client.$transaction(async () => {
          await client.db.BasicsTag.create({ data: { name: 'outer' } });
          await other.$transaction(async () => {
            await other.db.BasicsTag.create({ data: { name: 'inner' } });
          });
          throw new Error('boom');
        }),
      );
    } finally {
      await other.disconnect();
    }

    expect(await tagNames(client)).toEqual(['inner']);
  });
});
