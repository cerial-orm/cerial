/**
 * E2E Tests: One-to-One Required - Error Cases
 *
 * Schema: one-to-one-required.cerial
 * Tests runtime error handling for required 1-1 relations.
 * Note: Type-level constraints are tested in typechecks/*.check.ts files.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig, uniqueEmail } from '../../test-helper';

describe('E2E One-to-One Required: Errors', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneRequired);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('disconnect blocked on required FK', () => {
    test('should reject disconnect on required relation', async () => {
      const user = await client.db.UserRequired.create({
        data: { email: uniqueEmail(), name: 'Test User' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test',
          user: { connect: user.id },
        },
      });

      // Attempting to disconnect required relation should fail at runtime
      // Type system correctly prevents this, but users can override types (e.g., via type assertions)
      // so we test runtime validation as a safety net
      await expect(
        client.db.ProfileRequired.updateMany({
          where: { id: profile.id },
          data: {
            // @ts-expect-error - Testing runtime validation when types are bypassed
            user: { disconnect: true },
          },
        }),
      ).rejects.toThrow(/Cannot disconnect a required relation/);
    });
  });

  describe('non-existent record validation', () => {
    test('should reject profile with reference to non-existent user', async () => {
      // ORM validates that connected records exist
      await expect(
        client.db.ProfileRequired.create({
          data: {
            bio: 'Test',
            user: { connect: 'nonexistent123' },
          },
        }),
      ).rejects.toThrow();
    });

    test('should reject any non-existent record ID', async () => {
      // ORM validates record existence regardless of ID format
      await expect(
        client.db.ProfileRequired.create({
          data: {
            bio: 'Test',
            user: { connect: 'any-string-is-valid' },
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('relation reassignment', () => {
    test('should allow reassigning profile to different user', async () => {
      const user1 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u1'), name: 'User 1' },
      });
      const user2 = await client.db.UserRequired.create({
        data: { email: uniqueEmail('u2'), name: 'User 2' },
      });

      const profile = await client.db.ProfileRequired.create({
        data: {
          bio: 'Test',
          user: { connect: user1.id },
        },
      });

      // Connecting to different user should work (reassignment)
      const updated = await client.db.ProfileRequired.updateMany({
        where: { id: profile.id },
        data: {
          user: { connect: user2.id },
        },
      });

      expect(updated[0]?.userId).toBe(user2.id);
    });
  });
});
