/**
 * E2E Tests: Transactions - Nested Create
 *
 * Schema: one-to-one-required.cerial
 * - UserRequired: id Record @id, email Email @unique, name String, profile Relation @model(ProfileRequired)
 * - ProfileRequired: id Record @id, bio String?, avatarUrl String?, userId Record, user Relation @field(userId) @model(UserRequired)
 *
 * Tests nested create operations within $transaction.
 * FK on Profile side (required) - User deletion cascades to Profile.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig, uniqueEmail } from './test-helper';

describe('E2E Transactions: Nested Create', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('create with nested create inside transaction', async () => {
    const email = uniqueEmail();

    const [user] = await client.$transaction([
      client.db.UserRequired.create({
        data: {
          email,
          name: 'Tx User',
          profile: {
            create: { bio: 'Test' },
          },
        },
      }),
    ]);

    expect(user).toBeDefined();
    expect(user.email).toBe(email);
    expect(user.name).toBe('Tx User');

    // Verify the profile was created and FK points to the user
    const profiles = await client.db.ProfileRequired.findMany({
      where: { userId: user.id },
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.bio).toBe('Test');
    expect(profiles[0]?.userId.equals(user.id)).toBe(true);
  });

  test('multiple nested creates in same transaction', async () => {
    const email1 = uniqueEmail('u1');
    const email2 = uniqueEmail('u2');

    const [user1, user2] = await client.$transaction([
      client.db.UserRequired.create({
        data: {
          email: email1,
          name: 'Tx User 1',
          profile: {
            create: { bio: 'Bio 1' },
          },
        },
      }),
      client.db.UserRequired.create({
        data: {
          email: email2,
          name: 'Tx User 2',
          profile: {
            create: { bio: 'Bio 2', avatarUrl: 'https://example.com/avatar.png' },
          },
        },
      }),
    ]);

    expect(user1).toBeDefined();
    expect(user1.email).toBe(email1);
    expect(user2).toBeDefined();
    expect(user2.email).toBe(email2);

    // Verify both profiles were created
    const profile1 = await client.db.ProfileRequired.findMany({
      where: { userId: user1.id },
    });
    const profile2 = await client.db.ProfileRequired.findMany({
      where: { userId: user2.id },
    });

    expect(profile1).toHaveLength(1);
    expect(profile1[0]?.bio).toBe('Bio 1');

    expect(profile2).toHaveLength(1);
    expect(profile2[0]?.bio).toBe('Bio 2');
    expect(profile2[0]?.avatarUrl).toBe('https://example.com/avatar.png');
  });

  test('nested create + simple findMany in same transaction', async () => {
    // Insert some data outside the transaction first
    await client.db.UserRequired.create({
      data: { email: uniqueEmail('pre'), name: 'Pre-existing' },
    });

    const email = uniqueEmail('tx');

    const [created, users] = await client.$transaction([
      client.db.UserRequired.create({
        data: {
          email,
          name: 'Tx New User',
          profile: {
            create: { bio: 'Tx Bio' },
          },
        },
      }),
      client.db.UserRequired.findMany(),
    ]);

    // Created user should be returned
    expect(created).toBeDefined();
    expect(created.email).toBe(email);

    // findMany should include both the pre-existing and newly created user
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users.some((u) => u.email === email)).toBe(true);
  });

  test('nested create result has CerialId', async () => {
    const [user] = await client.$transaction([
      client.db.UserRequired.create({
        data: {
          email: uniqueEmail(),
          name: 'CerialId Check',
          profile: {
            create: { bio: 'Id test' },
          },
        },
      }),
    ]);

    expect(user).toBeDefined();
    expect(user.id).toBeDefined();
    expect(isCerialId(user.id)).toBe(true);
    expect(user.id.table).toBe('user_required');
    expect(user.id.id.length).toBeGreaterThan(0);
  });
});
