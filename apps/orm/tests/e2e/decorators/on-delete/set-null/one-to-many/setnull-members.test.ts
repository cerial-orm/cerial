import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('E2E One-to-Many @onDelete(SetNull)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManySetNull);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManySetNull);
  });

  test('every member of the deleted team gets a null teamId', async () => {
    const team = await client.db.TeamSetNull.create({
      data: { name: 'Team', members: { create: [{ name: 'M1' }, { name: 'M2' }, { name: 'M3' }] } },
    });

    await client.db.TeamSetNull.deleteMany({ where: { id: team.id } });

    const members = await client.db.MemberSetNull.findMany({});
    expect(members).toHaveLength(3);
    for (const m of members) expect(m.teamId).toBeNull();
  });

  test('members of other teams keep their team', async () => {
    const gone = await client.db.TeamSetNull.create({ data: { name: 'Gone', members: { create: [{ name: 'A' }] } } });
    const kept = await client.db.TeamSetNull.create({ data: { name: 'Kept', members: { create: [{ name: 'B' }] } } });

    await client.db.TeamSetNull.deleteMany({ where: { id: gone.id } });

    const stays = await client.db.MemberSetNull.findOne({ where: { name: 'B' } });
    const orphan = await client.db.MemberSetNull.findOne({ where: { name: 'A' } });
    expect(stays?.teamId?.equals(kept.id)).toBe(true);
    expect(orphan?.teamId).toBeNull();
  });

  test('a team without members deletes cleanly', async () => {
    const team = await client.db.TeamSetNull.create({ data: { name: 'Empty' } });

    await client.db.TeamSetNull.deleteMany({ where: { id: team.id } });

    expect(await client.db.TeamSetNull.count()).toBe(0);
  });
});
