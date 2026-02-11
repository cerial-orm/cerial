/**
 * E2E Tests: Transactions - Cascade Delete
 *
 * Schema: one-to-one-cascade.cerial
 * - UserCascade: id Record @id, name String, profile Relation? @model(ProfileCascade)
 * - ProfileCascade: id Record @id, bio String?, userId Record?, user Relation? @field(userId) @model(UserCascade) @onDelete(Cascade)
 *
 * Tests cascade delete behavior within $transaction.
 * Profile is deleted when user is deleted (even though FK is optional) due to @onDelete(Cascade).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig } from './test-helper';

describe('E2E Transactions: Cascade Delete', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneCascade);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('deleteUnique with cascade inside transaction', async () => {
    // Create user with connected profile
    const user = await client.db.UserCascade.create({
      data: { name: 'Cascade User' },
    });

    const profile = await client.db.ProfileCascade.create({
      data: {
        bio: 'Will cascade',
        user: { connect: user.id },
      },
    });

    // Verify both exist
    expect(await client.db.UserCascade.findOne({ where: { id: user.id } })).toBeDefined();
    expect(await client.db.ProfileCascade.findOne({ where: { id: profile.id } })).toBeDefined();

    // Delete user inside transaction
    const [result] = await client.$transaction([client.db.UserCascade.deleteUnique({ where: { id: user.id } })]);

    expect(result).toBe(true);

    // User should be gone
    const userAfter = await client.db.UserCascade.findOne({
      where: { id: user.id },
    });
    expect(userAfter).toBeNull();

    // Profile should also be gone (cascade)
    const profileAfter = await client.db.ProfileCascade.findOne({
      where: { id: profile.id },
    });
    expect(profileAfter).toBeNull();
  });

  test('cascade delete + create in same transaction', async () => {
    // Create user with profile
    const user = await client.db.UserCascade.create({
      data: { name: 'Old User' },
    });

    const profile = await client.db.ProfileCascade.create({
      data: {
        bio: 'Old Profile',
        user: { connect: user.id },
      },
    });

    // Delete old user (cascades profile) + create new user in same transaction
    const [deleteResult, newUser] = await client.$transaction([
      client.db.UserCascade.deleteUnique({ where: { id: user.id } }),
      client.db.UserCascade.create({ data: { name: 'New User' } }),
    ]);

    expect(deleteResult).toBe(true);
    expect(newUser).toBeDefined();
    expect(newUser.name).toBe('New User');

    // Old user and profile should be gone
    expect(await client.db.UserCascade.findOne({ where: { id: user.id } })).toBeNull();
    expect(await client.db.ProfileCascade.findOne({ where: { id: profile.id } })).toBeNull();

    // New user should exist
    expect(await client.db.UserCascade.findOne({ where: { id: newUser.id } })).toBeDefined();
  });

  test('cascade delete result matches non-transaction behavior', async () => {
    // Create two user+profile pairs for comparison
    const user1 = await client.db.UserCascade.create({
      data: { name: 'Non-tx User' },
    });
    const profile1 = await client.db.ProfileCascade.create({
      data: { bio: 'Non-tx Profile', user: { connect: user1.id } },
    });

    const user2 = await client.db.UserCascade.create({
      data: { name: 'Tx User' },
    });
    const profile2 = await client.db.ProfileCascade.create({
      data: { bio: 'Tx Profile', user: { connect: user2.id } },
    });

    // Delete user1 outside transaction
    const nonTxResult = await client.db.UserCascade.deleteUnique({
      where: { id: user1.id },
    });

    // Delete user2 inside transaction
    const [txResult] = await client.$transaction([client.db.UserCascade.deleteUnique({ where: { id: user2.id } })]);

    // Both should return the same result
    expect(txResult).toBe(nonTxResult);

    // Both profiles should be cascade deleted
    expect(await client.db.ProfileCascade.findOne({ where: { id: profile1.id } })).toBeNull();
    expect(await client.db.ProfileCascade.findOne({ where: { id: profile2.id } })).toBeNull();

    // Both users should be gone
    expect(await client.db.UserCascade.findOne({ where: { id: user1.id } })).toBeNull();
    expect(await client.db.UserCascade.findOne({ where: { id: user2.id } })).toBeNull();
  });
});
