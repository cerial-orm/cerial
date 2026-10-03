/**
 * E2E Tests: unknown select keys — negative cases
 *
 * A select key that is not a model field must throw instead of returning a
 * result with the requested field silently missing.
 *
 * Schema: core (User/Post) and flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Unknown select keys — negative cases', () => {
  let client: CerialClient;
  const unknown = "Invalid select: Unknown field 'nmae' on model BasicsUser";

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [...tables.basics, ...tables.flexible]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [...tables.basics, ...tables.flexible]);
  });

  test('findMany throws on a typo key and names key and model', () => {
    // @ts-expect-error — 'nmae' is not a field, testing runtime guard
    expect(() => client.db.BasicsUser.findMany({ select: { nmae: true } })).toThrow(unknown);
  });

  test('findMany throws on a typo key set to false', () => {
    expect(() => client.db.BasicsUser.findMany({ select: { name: true, nmae: false } })).toThrow(unknown);
  });

  test('findOne throws on a typo key', () => {
    // @ts-expect-error — 'nmae' is not a field, testing runtime guard
    expect(() => client.db.BasicsUser.findOne({ select: { nmae: true } })).toThrow(unknown);
  });

  test('findUnique throws on a typo key', () => {
    // @ts-expect-error — 'nmae' is not a field, testing runtime guard
    expect(() => client.db.BasicsUser.findUnique({ where: { id: 'basics_user:1' }, select: { nmae: true } })).toThrow(
      unknown,
    );
  });

  test('create throws on a typo key and writes nothing', async () => {
    expect(() =>
      client.db.BasicsUser.create({
        data: { email: 'a@b.co', name: 'A', isActive: true },
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        select: { nmae: true },
      }),
    ).toThrow(unknown);

    expect(await client.db.BasicsUser.count()).toBe(0);
  });

  test('updateMany throws on a typo key and leaves the record untouched', async () => {
    const user = await client.db.BasicsUser.create({ data: { email: 'a@b.co', name: 'Before', isActive: true } });

    expect(() =>
      client.db.BasicsUser.updateMany({
        where: { id: user.id },
        data: { name: 'After' },
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        select: { nmae: true },
      }),
    ).toThrow(unknown);

    expect((await client.db.BasicsUser.findOne({ where: { id: user.id } }))!.name).toBe('Before');
  });

  test('updateUnique throws on a typo key', async () => {
    const user = await client.db.BasicsUser.create({ data: { email: 'a@b.co', name: 'Before', isActive: true } });

    expect(() =>
      client.db.BasicsUser.updateUnique({
        where: { id: user.id },
        data: { name: 'After' },
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        select: { nmae: true },
      }),
    ).toThrow(unknown);

    expect((await client.db.BasicsUser.findOne({ where: { id: user.id } }))!.name).toBe('Before');
  });

  test('upsert throws on a typo key', () => {
    expect(() =>
      client.db.BasicsUser.upsert({
        where: { email: 'a@b.co' },
        create: { email: 'a@b.co', name: 'A', isActive: true },
        update: { name: 'B' },
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        select: { nmae: true },
      }),
    ).toThrow(unknown);
  });

  test('object sub-key typo throws with the dotted path', () => {
    expect(() =>
      client.db.FlexUser.findMany({
        // @ts-expect-error — 'cty' is not a field of FlexAddress, testing runtime guard
        select: { strictAddress: { cty: true } },
      }),
    ).toThrow("Invalid select: Unknown field 'strictAddress.cty' on model FlexUser");
  });

  test('a @flexible object still accepts an undeclared sub-key', async () => {
    await client.db.FlexUser.create({
      data: {
        name: 'F',
        address: { street: 's', city: 'c', extra: 'kept' },
        tags: [],
        profile: { bio: 'b', metadata: { label: 'l' } },
        strictAddress: { street: 's', city: 'c' },
      },
    });

    const rows = await client.db.FlexUser.findMany({ select: { address: { city: true, extra: true } } });

    expect(rows[0]!.address).toEqual({ city: 'c', extra: 'kept' });
  });

  test('valid select still returns only the selected field', async () => {
    await client.db.BasicsUser.create({ data: { email: 'a@b.co', name: 'A', isActive: true } });

    const rows = await client.db.BasicsUser.findMany({ select: { name: true } });

    expect(rows.map((r) => r.name)).toEqual(['A']);
    expect(rows[0]).not.toHaveProperty('email');
  });
});
