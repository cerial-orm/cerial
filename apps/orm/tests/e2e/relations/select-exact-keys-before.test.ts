/**
 * E2E Tests for `select` on `upsert` with `return: 'before'`
 *
 * RETURN BEFORE hands back the whole stored row, so a narrowed select must be applied to it. Every
 * case asserts the exact key set and pairs the nested upsert with a plain control.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

/** The keys a row carries, sorted. */
const keysOf = (row: object | null | undefined) => (row ? Object.keys(row).sort() : row);

describe('E2E upsert return before honours select', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  const userData = { name: 'probe', email: 'probe@x.io', isActive: true };

  test('plain upsert returns only the selected keys of the before row', async () => {
    await client.db.User.create({ data: userData });
    const row = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: userData,
      update: { age: 3 },
      select: { name: true },
      return: 'before',
    });

    expect(keysOf(row)).toEqual(['name']);
    expect(row).toEqual({ name: 'probe' });
  });

  test('nested upsert agrees with the plain one', async () => {
    const tag = await client.db.Tag.create({ data: { name: 't1' } });
    await client.db.User.create({ data: userData });
    const nested = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: userData,
      update: { tags: { connect: [tag.id] } },
      select: { name: true },
      return: 'before',
    });

    expect(keysOf(nested)).toEqual(['name']);
    expect(nested).toEqual({ name: 'probe' });
  });

  test('nested upsert with an empty update returns the selected keys of the existing row', async () => {
    await client.db.User.create({ data: userData });
    const row = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: { ...userData, tags: { create: [{ name: 't2' }] } },
      update: {},
      select: { name: true, isActive: true },
      return: 'before',
    });

    expect(keysOf(row)).toEqual(['isActive', 'name']);
  });

  test('a before row carries the pre-update value of a selected field', async () => {
    await client.db.User.create({ data: { ...userData, age: 1 } });
    const tag = await client.db.Tag.create({ data: { name: 't1' } });
    const row = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: userData,
      update: { age: 9, tags: { connect: [tag.id] } },
      select: { age: true },
      return: 'before',
    });

    expect(row).toEqual({ age: 1 });
  });

  test('without select the whole before row is returned', async () => {
    await client.db.User.create({ data: userData });
    const tag = await client.db.Tag.create({ data: { name: 't1' } });
    const row = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: userData,
      update: { tags: { connect: [tag.id] } },
      return: 'before',
    });

    expect(keysOf(row)).toContain('email');
    expect(keysOf(row)).toContain('isActive');
  });

  test('a new record returns null, select or not', async () => {
    const tag = await client.db.Tag.create({ data: { name: 't1' } });
    const plain = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: userData,
      update: { age: 3 },
      select: { name: true },
      return: 'before',
    });
    await truncateTables(client, tables.core);
    const nested = await client.db.User.upsert({
      where: { email: 'probe@x.io' },
      create: { ...userData, tags: { connect: [(await client.db.Tag.create({ data: { name: 't1' } })).id] } },
      update: { age: 3 },
      select: { name: true },
      return: 'before',
    });

    expect(tag.name).toBe('t1');
    expect(plain).toBeNull();
    expect(nested).toBeNull();
  });
});
