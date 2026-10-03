import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('E2E One-to-Many @onDelete(NoAction)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyNoAction);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManyNoAction);
  });

  test('deleting the team succeeds and leaves members pointing at it', async () => {
    const team = await client.db.TeamNoAction.create({
      data: { name: 'Team', members: { create: [{ name: 'M1' }, { name: 'M2' }] } },
    });

    await client.db.TeamNoAction.deleteMany({ where: { id: team.id } });

    expect(await client.db.TeamNoAction.count()).toBe(0);
    const members = await client.db.MemberNoAction.findMany({});
    expect(members).toHaveLength(2);
    for (const m of members) expect(m.teamId?.equals(team.id)).toBe(true);
  });

  test('members of other teams are untouched', async () => {
    const gone = await client.db.TeamNoAction.create({ data: { name: 'Gone', members: { create: [{ name: 'A' }] } } });
    const kept = await client.db.TeamNoAction.create({ data: { name: 'Kept', members: { create: [{ name: 'B' }] } } });

    await client.db.TeamNoAction.deleteMany({ where: { id: gone.id } });

    const members = await client.db.MemberNoAction.findMany({ where: { teamId: kept.id } });
    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe('B');
  });

  test('a team without members deletes cleanly', async () => {
    const team = await client.db.TeamNoAction.create({ data: { name: 'Empty' } });

    await client.db.TeamNoAction.deleteMany({ where: { id: team.id } });

    expect(await client.db.TeamNoAction.count()).toBe(0);
  });
});
