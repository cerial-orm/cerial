/**
 * E2E Tests: Self-Referential One-to-One - Manual Reverse Query
 *
 * Schema: self-ref-one-to-one.cerial
 * Tests manually querying "who I mentor" via WHERE.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Self-Ref One-to-One: Manual Reverse Query', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOne);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefOneToOne);
  });

  describe('find mentees', () => {
    test('should find all people who have this person as mentor', async () => {
      const mentor = await client.db.Person.create({
        data: { name: 'Senior Mentor' },
      });

      await client.db.Person.create({
        data: { name: 'Mentee 1', mentor: { connect: mentor.id } },
      });
      await client.db.Person.create({
        data: { name: 'Mentee 2', mentor: { connect: mentor.id } },
      });
      await client.db.Person.create({
        data: { name: 'No Mentor' },
      });

      // Manual reverse query
      const mentees = await client.db.Person.findMany({
        where: { mentorId: mentor.id },
      });

      expect(mentees).toHaveLength(2);
      expect(mentees.map((m) => m.name).sort()).toEqual(['Mentee 1', 'Mentee 2']);
    });

    test('should find if someone is a mentor', async () => {
      const mentor = await client.db.Person.create({
        data: { name: 'Mentor' },
      });
      const nonMentor = await client.db.Person.create({
        data: { name: 'Non Mentor' },
      });

      await client.db.Person.create({
        data: { name: 'Mentee', mentor: { connect: mentor.id } },
      });

      // Check if mentor has mentees
      const mentorMentees = await client.db.Person.findMany({
        where: { mentorId: mentor.id },
      });
      expect(mentorMentees.length).toBeGreaterThan(0);

      // Check if non-mentor has mentees
      const nonMentorMentees = await client.db.Person.findMany({
        where: { mentorId: nonMentor.id },
      });
      expect(nonMentorMentees.length).toBe(0);
    });
  });

  describe('mentorship chains', () => {
    test('should handle multi-level mentorship', async () => {
      const grandMentor = await client.db.Person.create({
        data: { name: 'Grand Mentor' },
      });

      const mentor = await client.db.Person.create({
        data: { name: 'Mentor', mentor: { connect: grandMentor.id } },
      });

      const mentee = await client.db.Person.create({
        data: { name: 'Mentee', mentor: { connect: mentor.id } },
      });

      // Verify chain
      expect(mentee.mentorId?.equals(mentor.id)).toBe(true);
      expect(mentor.mentorId?.equals(grandMentor.id)).toBe(true);
      expect(grandMentor.mentorId).toBeNull();

      // Find all at each level
      const grandMentorMentees = await client.db.Person.findMany({
        where: { mentorId: grandMentor.id },
      });
      expect(grandMentorMentees).toHaveLength(1);
      expect(grandMentorMentees[0]?.name).toBe('Mentor');
    });
  });
});
