/**
 * E2E Tests: One-to-One @onDelete(SetNone)
 *
 * Schema: on-delete.cerial
 * Deleting the referenced record clears the optional FK to NONE (field absent), not null.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('E2E One-to-One @onDelete(SetNone)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToOneSetNone);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToOneSetNone);
  });

  test('clears the FK to NONE when the user is deleted', async () => {
    const user = await client.db.UserSetNone.create({ data: { name: 'Gone' } });
    const profile = await client.db.ProfileSetNone.create({
      data: { bio: 'Orphan soon', user: { connect: user.id } },
    });
    expect(profile.userId?.equals(user.id)).toBe(true);

    await client.db.UserSetNone.deleteMany({ where: { id: user.id } });

    const after = await client.db.ProfileSetNone.findOne({ where: { id: profile.id } });
    expect(after).not.toBeNull();
    expect(after?.bio).toBe('Orphan soon');
    expect(after?.userId).toBeUndefined();
    expect(after?.userId).not.toBeNull();
  });

  test('leaves profiles of other users untouched', async () => {
    const gone = await client.db.UserSetNone.create({ data: { name: 'Gone' } });
    const kept = await client.db.UserSetNone.create({ data: { name: 'Kept' } });
    const orphan = await client.db.ProfileSetNone.create({ data: { user: { connect: gone.id } } });
    const stays = await client.db.ProfileSetNone.create({ data: { user: { connect: kept.id } } });

    await client.db.UserSetNone.deleteMany({ where: { id: gone.id } });

    const orphanAfter = await client.db.ProfileSetNone.findOne({ where: { id: orphan.id } });
    const staysAfter = await client.db.ProfileSetNone.findOne({ where: { id: stays.id } });
    expect(orphanAfter?.userId).toBeUndefined();
    expect(staysAfter?.userId?.equals(kept.id)).toBe(true);
  });

  test('a profile created without a user is unaffected by a delete', async () => {
    const user = await client.db.UserSetNone.create({ data: { name: 'Solo' } });
    const profile = await client.db.ProfileSetNone.create({ data: { bio: 'Never linked' } });

    await client.db.UserSetNone.deleteMany({ where: { id: user.id } });

    const after = await client.db.ProfileSetNone.findOne({ where: { id: profile.id } });
    expect(after?.bio).toBe('Never linked');
    expect(after?.userId).toBeUndefined();
  });

  test('a user with no profile deletes cleanly', async () => {
    const user = await client.db.UserSetNone.create({ data: { name: 'Lonely' } });

    await client.db.UserSetNone.deleteMany({ where: { id: user.id } });

    expect(await client.db.UserSetNone.count()).toBe(0);
  });
});
