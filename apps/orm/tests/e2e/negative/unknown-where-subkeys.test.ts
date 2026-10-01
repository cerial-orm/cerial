/**
 * E2E Tests: unknown object sub-keys in where — negative cases
 *
 * A typo'd sub-key on a non-flexible object must throw instead of matching
 * nothing. @flexible objects keep accepting undeclared sub-keys.
 *
 * Schema: flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Unknown where sub-keys — negative cases', () => {
  let client: CerialClient;
  const unknown = (path: string) => `Invalid where clause: Unknown field '${path}' on model FlexUser`;

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
    const address = { street: '1 Main', city: 'NYC' };
    await client.db.FlexUser.create({
      data: {
        name: 'Alice',
        address: { ...address, priority: 'high' },
        tags: [{ ...address, label: 'home' }],
        profile: { bio: 'hi', metadata: { label: 'x', score: 5 } },
        strictAddress: address,
      },
    });
  });

  test('findMany throws on a typo sub-key of a non-flexible object', async () => {
    await expect(
      (async () => {
        // @ts-expect-error — 'cty' is not a sub-field, testing runtime guard
        await client.db.FlexUser.findMany({ where: { strictAddress: { cty: 'NYC' } } });
      })(),
    ).rejects.toThrow(unknown('strictAddress.cty'));
  });

  test('throws when the typo sub-key value is falsy', async () => {
    await expect(
      (async () => {
        // @ts-expect-error — 'cty' is not a sub-field, testing runtime guard
        await client.db.FlexUser.findMany({ where: { strictAddress: { cty: undefined, zzz: false } } });
      })(),
    ).rejects.toThrow(unknown('strictAddress.zzz'));
  });

  test('throws on a typo on a strict object that holds a flexible child', async () => {
    await expect(
      (async () => {
        // @ts-expect-error — 'bo' is not a sub-field, testing runtime guard
        await client.db.FlexUser.findMany({ where: { profile: { metadata: { label: 'x' }, bio: 'hi', bo: 1 } } });
      })(),
    ).rejects.toThrow(unknown('profile.bo'));
  });

  test('count throws on a typo sub-key', async () => {
    await expect(
      (async () => {
        // @ts-expect-error — 'cty' is not a sub-field, testing runtime guard
        await client.db.FlexUser.count({ strictAddress: { cty: 'NYC' } });
      })(),
    ).rejects.toThrow(unknown('strictAddress.cty'));
  });

  test('a declared sub-key of a non-flexible object still matches', async () => {
    const rows = await client.db.FlexUser.findMany({ where: { strictAddress: { city: 'NYC' } } });
    expect(rows).toHaveLength(1);
  });

  test('an undeclared sub-key of a flexible object still matches', async () => {
    const rows = await client.db.FlexUser.findMany({ where: { address: { priority: 'high' } } });
    expect(rows).toHaveLength(1);
  });

  test('an undeclared key under some on a flexible array still matches', async () => {
    const rows = await client.db.FlexUser.findMany({ where: { tags: { some: { label: 'home' } } } });
    expect(rows).toHaveLength(1);
  });

  test('an undeclared nested key on a flexible child still matches', async () => {
    const rows = await client.db.FlexUser.findMany({ where: { profile: { metadata: { score: { gt: 1 } } } } });
    expect(rows).toHaveLength(1);
  });
});
