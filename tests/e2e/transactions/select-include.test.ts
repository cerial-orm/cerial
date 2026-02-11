/**
 * E2E Tests for Select and Include operations inside $transaction
 *
 * Tests that select and include options work correctly when queries
 * are executed within a transaction.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import {
  CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  uniqueEmail,
  uniqueId,
} from './test-helper';

describe('E2E Transactions: Select and Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('findOne with select inside transaction', async () => {
    const email = uniqueEmail('select');
    const name = `User ${uniqueId()}`;

    const created = await client.db.User.create({
      data: { email, name, isActive: true },
    });

    const [user] = await client.$transaction([
      client.db.User.findOne({
        where: { id: created.id },
        select: { id: true, name: true },
      }),
    ]);

    expect(user).toBeDefined();
    expect(isCerialId(user!.id)).toBe(true);
    expect(user!.name).toBe(name);
    // email should not be present when not selected
    expect((user as Record<string, unknown>)?.email).toBeUndefined();
  });

  test('findMany with select inside transaction', async () => {
    const email1 = uniqueEmail('select');
    const email2 = uniqueEmail('select');

    await client.db.User.create({
      data: { email: email1, name: `User ${uniqueId()}`, isActive: true },
    });
    await client.db.User.create({
      data: { email: email2, name: `User ${uniqueId()}`, isActive: false },
    });

    const [users] = await client.$transaction([
      client.db.User.findMany({
        select: { id: true, email: true, isActive: true },
      }),
    ]);

    expect(users).toHaveLength(2);
    users.forEach((user) => {
      expect(isCerialId(user.id)).toBe(true);
      expect(user.email).toBeDefined();
      expect(user.isActive).toBeDefined();
      // name should not be present when not selected
      expect((user as Record<string, unknown>).name).toBeUndefined();
    });
  });

  test('findOne with include inside transaction', async () => {
    const email = uniqueEmail('include');

    const profile = await client.db.Profile.create({
      data: { bio: 'Test bio', userId: 'user:temp' },
    });

    const created = await client.db.User.create({
      data: {
        email,
        name: `User ${uniqueId()}`,
        isActive: true,
        profileId: profile.id,
      },
    });

    const [user] = await client.$transaction([
      client.db.User.findOne({
        where: { id: created.id },
        include: { profile: true },
      }),
    ]);

    expect(user).toBeDefined();
    expect(isCerialId(user!.id)).toBe(true);
    expect(user!.profileId?.equals(profile.id)).toBe(true);
  });

  test('create with select inside transaction', async () => {
    const email = uniqueEmail('create-select');
    const name = `User ${uniqueId()}`;

    const [user] = await client.$transaction([
      client.db.User.create({
        data: { email, name, isActive: true },
        select: { id: true, name: true },
      }),
    ]);

    expect(user).toBeDefined();
    expect(isCerialId(user.id)).toBe(true);
    expect(user.name).toBe(name);
    // email should not be present when not selected
    expect((user as Record<string, unknown>).email).toBeUndefined();
  });
});
