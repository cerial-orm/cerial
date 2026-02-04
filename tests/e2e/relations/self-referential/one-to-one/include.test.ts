/**
 * E2E Tests: Self-Referential One-to-One - Include
 *
 * Schema: self-ref-one-to-one.cerial
 * Tests including mentor in queries.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, tables, testConfig } from '../../test-helper';

describe('E2E Self-Ref One-to-One: Include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOne);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('include mentor', () => {
    test('should include mentor when querying person', async () => {
      const mentor = await client.db.Person.create({
        data: { name: 'Senior' },
      });

      const person = await client.db.Person.create({
        data: { name: 'Junior', mentor: { connect: mentor.id } },
      });

      const result = await client.db.Person.findOne({
        where: { id: person.id },
        include: { mentor: true },
      });

      expect(result?.mentor).toBeDefined();
      expect(result?.mentor?.name).toBe('Senior');
    });

    test('should return null mentor when person has none', async () => {
      const person = await client.db.Person.create({
        data: { name: 'Solo' },
      });

      const result = await client.db.Person.findOne({
        where: { id: person.id },
        include: { mentor: true },
      });

      expect(result?.mentor).toBeNull();
    });
  });

  describe('nested include', () => {
    test('should include mentor chain (mentor.mentor)', async () => {
      const grandMentor = await client.db.Person.create({
        data: { name: 'Grand Mentor' },
      });

      const mentor = await client.db.Person.create({
        data: { name: 'Mentor', mentor: { connect: grandMentor.id } },
      });

      const person = await client.db.Person.create({
        data: { name: 'Mentee', mentor: { connect: mentor.id } },
      });

      const result = await client.db.Person.findOne({
        where: { id: person.id },
        include: {
          mentor: {
            include: { mentor: true },
          },
        },
      });

      expect(result?.mentor?.name).toBe('Mentor');
      expect(result?.mentor?.mentor?.name).toBe('Grand Mentor');
      // Third level not included in query, so undefined (not fetched)
      // @ts-expect-error - Type inference doesn't fully resolve deeply nested includes, testing runtime behavior
      expect(result?.mentor?.mentor?.mentor).toBeUndefined();
    });
  });

  describe('include in findMany', () => {
    test('should include mentors for multiple people', async () => {
      const mentor = await client.db.Person.create({
        data: { name: 'Shared Mentor' },
      });

      await client.db.Person.create({
        data: { name: 'P1', mentor: { connect: mentor.id } },
      });
      await client.db.Person.create({
        data: { name: 'P2', mentor: { connect: mentor.id } },
      });
      await client.db.Person.create({
        data: { name: 'P3' }, // No mentor
      });

      const people = await client.db.Person.findMany({
        include: { mentor: true },
        orderBy: { name: 'asc' },
      });

      expect(people).toHaveLength(4); // Including the mentor
      const mentees = people.filter((p) => p.name.startsWith('P'));
      expect(mentees[0]?.mentor?.name).toBe('Shared Mentor');
      expect(mentees[1]?.mentor?.name).toBe('Shared Mentor');
      expect(mentees[2]?.mentor).toBeNull();
    });
  });
});
