/**
 * E2E Tests: One-to-Many @onDelete(Cascade)
 *
 * Schema: one-to-many-cascade.cerial
 * - Team: id, name, members (Relation[] @model)
 * - Member: id, name, teamId (Record?), team (Relation? @field @onDelete(Cascade))
 *
 * Tests cascade delete of all members when team deleted.
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

describe('E2E One-to-Many @onDelete(Cascade)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyCascade);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManyCascade);
  });

  describe('cascade behavior', () => {
    test('should delete all members when team deleted', async () => {
      const team = await client.db.Team.create({
        data: {
          name: 'Team',
          members: {
            create: [{ name: 'Member 1' }, { name: 'Member 2' }, { name: 'Member 3' }],
          },
        },
      });

      // Verify members exist
      const membersBefore = await client.db.Member.findMany({
        where: { teamId: team.id },
      });
      expect(membersBefore).toHaveLength(3);

      // Delete team
      await client.db.Team.deleteMany({
        where: { id: team.id },
      });

      // All members should be gone
      const membersAfter = await client.db.Member.findMany({});
      expect(membersAfter).toHaveLength(0);
    });

    test('should not affect members of other teams', async () => {
      const team1 = await client.db.Team.create({
        data: {
          name: 'Team 1',
          members: { create: [{ name: 'T1 Member' }] },
        },
      });
      const team2 = await client.db.Team.create({
        data: {
          name: 'Team 2',
          members: { create: [{ name: 'T2 Member' }] },
        },
      });

      // Delete team1
      await client.db.Team.deleteMany({
        where: { id: team1.id },
      });

      // Team2 members should still exist
      const t2Members = await client.db.Member.findMany({
        where: { teamId: team2.id },
      });
      expect(t2Members).toHaveLength(1);
      expect(t2Members[0]?.name).toBe('T2 Member');
    });

    test('should not affect orphan members', async () => {
      const team = await client.db.Team.create({
        data: {
          name: 'Team',
          members: { create: [{ name: 'Team Member' }] },
        },
      });

      // Create orphan member
      await client.db.Member.create({
        data: { name: 'Orphan Member' },
      });

      // Delete team
      await client.db.Team.deleteMany({
        where: { id: team.id },
      });

      // Orphan should still exist
      const members = await client.db.Member.findMany({});
      expect(members).toHaveLength(1);
      expect(members[0]?.name).toBe('Orphan Member');
    });
  });

  describe('deleteMany cascade', () => {
    test('should cascade delete members when multiple teams deleted', async () => {
      await client.db.Team.create({
        data: {
          name: 'Delete Team 1',
          members: { create: [{ name: 'DT1 Member' }] },
        },
      });
      await client.db.Team.create({
        data: {
          name: 'Delete Team 2',
          members: { create: [{ name: 'DT2 Member' }] },
        },
      });
      await client.db.Team.create({
        data: {
          name: 'Keep Team',
          members: { create: [{ name: 'KT Member' }] },
        },
      });

      // Delete teams matching pattern
      await client.db.Team.deleteMany({
        where: { name: { startsWith: 'Delete' } },
      });

      // Only Keep Team members remain
      const members = await client.db.Member.findMany({});
      expect(members).toHaveLength(1);
      expect(members[0]?.name).toBe('KT Member');
    });
  });
});
