/**
 * E2E Tests: invalid orderBy, limit and offset — negative cases
 *
 * Unknown or relation orderBy paths, bad directions and non-integer paging
 * values must throw instead of being ignored or interpolated.
 *
 * Schema: core (User/Post) and flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Invalid orderBy, limit and offset — negative cases', () => {
  let client: CerialClient;

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

  test('findMany throws on an unknown orderBy key', () => {
    // @ts-expect-error — 'nmae' is not a field, testing runtime guard
    expect(() => client.db.User.findMany({ orderBy: { nmae: 'asc' } })).toThrow(
      "Invalid orderBy: Unknown field 'nmae' on model User",
    );
  });

  test('findOne throws on an unknown orderBy key', () => {
    // @ts-expect-error — 'nmae' is not a field, testing runtime guard
    expect(() => client.db.User.findOne({ orderBy: { nmae: 'asc' } })).toThrow('Invalid orderBy');
  });

  test('findMany throws when ordering by a relation', () => {
    expect(() =>
      client.db.Post.findMany({
        // @ts-expect-error — relation fields are not in the OrderBy type, testing runtime guard
        orderBy: { author: { name: 'asc' } },
      }),
    ).toThrow("Invalid orderBy: Cannot order by relation field 'author' on model Post");
  });

  test('findMany throws on an invalid direction', () => {
    // @ts-expect-error — 'sideways' is not a direction, testing runtime guard
    expect(() => client.db.User.findMany({ orderBy: { name: 'sideways' } })).toThrow(
      "Invalid orderBy: Order direction for 'name' must be 'asc' or 'desc'",
    );
  });

  test('unknown sub-key of a strict object throws with the dotted path', () => {
    expect(() =>
      client.db.FlexUser.findMany({
        // @ts-expect-error — 'cty' is not a field of FlexAddress, testing runtime guard
        orderBy: { strictAddress: { cty: 'asc' } },
      }),
    ).toThrow("Invalid orderBy: Unknown field 'strictAddress.cty' on model FlexUser");
  });

  test('valid orderBy, including uppercase direction, still sorts', async () => {
    await client.db.User.create({ data: { email: 'b@b.co', name: 'B', isActive: true } });
    await client.db.User.create({ data: { email: 'a@b.co', name: 'A', isActive: true } });

    const rows = await client.db.User.findMany({ orderBy: { name: 'asc' }, select: { name: true } });
    expect(rows.map((r) => r.name)).toEqual(['A', 'B']);

    // @ts-expect-error — uppercase is accepted at runtime but not in the OrderDirection type
    const desc = await client.db.User.findMany({ orderBy: { name: 'DESC' }, select: { name: true } });
    expect(desc.map((r) => r.name)).toEqual(['B', 'A']);
  });

  test.each([1.5, -1, Number.NaN])('findMany throws on limit %p', (bad) => {
    expect(() => client.db.User.findMany({ limit: bad })).toThrow(
      'Invalid limit/offset: limit must be a non-negative integer',
    );
  });

  test.each([1.5, -1, Number.NaN])('findMany throws on offset %p', (bad) => {
    expect(() => client.db.User.findMany({ offset: bad })).toThrow(
      'Invalid limit/offset: offset must be a non-negative integer',
    );
  });

  test('a string limit is rejected rather than interpolated', () => {
    // @ts-expect-error — limit is a number, testing runtime guard
    expect(() => client.db.User.findMany({ limit: '1; DELETE user' })).toThrow('limit must be a non-negative integer');
  });

  test('limit 0 returns no rows and offset 0 returns all', async () => {
    await client.db.User.create({ data: { email: 'a@b.co', name: 'A', isActive: true } });

    expect(await client.db.User.findMany({ limit: 0 })).toEqual([]);
    expect(await client.db.User.findMany({ offset: 0 })).toHaveLength(1);
  });
});
