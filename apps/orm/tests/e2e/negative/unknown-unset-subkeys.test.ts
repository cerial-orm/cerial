/**
 * E2E Tests: unknown sub-keys in `unset` — negative and positive cases
 *
 * `unset` used to skip sub-key checking, so a typo'd sub-key emitted a NONE write to a path that does
 * not exist and reported success. It now throws like the equivalent `data` value, and the record
 * stays exactly as it was.
 *
 * Schema: flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const rejects = (run: () => unknown, message: string) =>
  expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(message);

describe('Unknown unset sub-keys — negative and positive cases', () => {
  let client: CerialClient;
  let id: FlexUserId;

  type FlexUserId = NonNullable<Awaited<ReturnType<typeof client.db.FlexUser.create>>['id']>;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.flexible);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.flexible);
    const address = { street: '1 Main', city: 'NYC', zip: '10001' };
    const row = await client.db.FlexUser.create({
      data: { name: 'Alice', address, profile: { bio: 'hi', metadata: { label: 'x' } }, strictAddress: address },
    });
    id = row.id;
  });

  const untouched = async () => {
    const row = await client.db.FlexUser.findUnique({ where: { id } });
    expect(row?.strictAddress).toEqual({ street: '1 Main', city: 'NYC', zip: '10001' });
    expect(row?.address).toMatchObject({ street: '1 Main', city: 'NYC', zip: '10001' });
    expect(row?.profile).toEqual({ bio: 'hi', metadata: { label: 'x' } });
  };

  const invalid = (path: string) => `Invalid unset: Unknown field '${path}' on model FlexUser`;

  // A typo'd sub-key is what a JavaScript caller can send; the generated types reject it
  const typo = { strictAddress: { zpi: true } } as unknown as never;

  test('updateUnique throws, names the sub-key and leaves the record untouched', async () => {
    await rejects(
      () => client.db.FlexUser.updateUnique({ where: { id }, data: {}, unset: typo }),
      invalid('strictAddress.zpi'),
    );
    await untouched();
  });

  test('updateMany throws and leaves the record untouched', async () => {
    await rejects(
      () => client.db.FlexUser.updateMany({ where: { name: 'Alice' }, data: {}, unset: typo }),
      invalid('strictAddress.zpi'),
    );
    await untouched();
  });

  test('upsert throws on the update portion and neither updates nor creates', async () => {
    const address = { street: 's', city: 'c' };
    await rejects(
      () =>
        client.db.FlexUser.upsert({
          where: { id },
          create: { name: 'New', address, profile: { bio: 'b', metadata: { label: 'l' } }, strictAddress: address },
          update: {},
          unset: typo,
        }),
      invalid('strictAddress.zpi'),
    );
    expect(await client.db.FlexUser.count()).toBe(1);
    await untouched();
  });

  test('a typo beside a valid sub-key still throws and unsets nothing', async () => {
    await rejects(
      () =>
        client.db.FlexUser.updateUnique({
          where: { id },
          data: {},
          unset: { strictAddress: { zip: true, zpi: true } } as unknown as never,
        }),
      invalid('strictAddress.zpi'),
    );
    await untouched();
  });

  test('a typo on another strict object throws', async () => {
    await rejects(
      () =>
        client.db.FlexUser.updateUnique({
          where: { id },
          data: {},
          unset: { profile: { bioo: true } } as unknown as never,
        }),
      invalid('profile.bioo'),
    );
    await untouched();
  });

  test('data and unset reject the same typo with the same message', async () => {
    await rejects(
      () =>
        client.db.FlexUser.updateUnique({
          where: { id },
          // @ts-expect-error — 'zpi' is not a sub-field, testing the runtime guard
          data: { strictAddress: { zpi: 'x' } },
        }),
      "Unknown field 'strictAddress.zpi' on model FlexUser",
    );
    await rejects(
      () => client.db.FlexUser.updateUnique({ where: { id }, data: {}, unset: typo }),
      "Unknown field 'strictAddress.zpi' on model FlexUser",
    );
  });

  describe('valid unsets keep working', () => {
    test('a declared optional sub-key is unset and its siblings stay', async () => {
      const row = await client.db.FlexUser.updateUnique({
        where: { id },
        data: {},
        unset: { strictAddress: { zip: true } },
        return: 'after',
      });
      expect(row?.strictAddress).toEqual({ street: '1 Main', city: 'NYC' });
      expect(row?.address).toMatchObject({ zip: '10001' });
    });

    test('an undeclared sub-key on a @flexible object is accepted', async () => {
      const row = await client.db.FlexUser.updateUnique({
        where: { id },
        data: {},
        // The generated unset type does not model a flexible object's undeclared keys
        unset: { address: { anything: true } } as unknown as never,
        return: 'after',
      });
      expect(row?.address).toMatchObject({ street: '1 Main', city: 'NYC', zip: '10001' });
      expect(row?.strictAddress).toEqual({ street: '1 Main', city: 'NYC', zip: '10001' });
    });

    test('a sub-key of a flexible object nested inside a strict one is accepted', async () => {
      await client.db.FlexUser.updateUnique({
        where: { id },
        data: {},
        unset: { profile: { metadata: { extra: true } } } as unknown as never,
      });
      const row = await client.db.FlexUser.findUnique({ where: { id } });
      expect(row?.profile).toEqual({ bio: 'hi', metadata: { label: 'x' } });
    });

    test('updateMany unsets a declared sub-key', async () => {
      const rows = await client.db.FlexUser.updateMany({
        where: { name: 'Alice' },
        data: {},
        unset: { strictAddress: { zip: true } },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.strictAddress).toEqual({ street: '1 Main', city: 'NYC' });
    });

    test('upsert unsets a declared sub-key on its update portion', async () => {
      const address = { street: 's', city: 'c' };
      const row = await client.db.FlexUser.upsert({
        where: { id },
        create: { name: 'New', address, profile: { bio: 'b', metadata: { label: 'l' } }, strictAddress: address },
        update: {},
        unset: { strictAddress: { zip: true } },
        return: 'after',
      });
      expect(row?.name).toBe('Alice');
      expect(row?.strictAddress).toEqual({ street: '1 Main', city: 'NYC' });
      expect(await client.db.FlexUser.count()).toBe(1);
    });
  });
});
