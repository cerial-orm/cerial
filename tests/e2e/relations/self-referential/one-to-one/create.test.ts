/**
 * E2E Tests: Self-Referential One-to-One - Create
 *
 * Schema: self-ref-one-to-one.cerial
 * - Person: id, name, mentorId (Record?), mentor (Relation? @field)
 *
 * Tests one-directional 1-1 self-reference (A has mentor B).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../test-helper';

describe('E2E Self-Ref One-to-One: Create', () => {
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

  describe('create with mentor', () => {
    test('should create person with mentor connect', async () => {
      const mentor = await client.db.Person.create({
        data: { name: 'Mentor' },
      });

      const person = await client.db.Person.create({
        data: {
          name: 'Mentee',
          mentor: { connect: mentor.id },
        },
      });

      expect(person.mentorId?.equals(mentor.id)).toBe(true);
    });

    test('should create person with nested mentor create', async () => {
      const person = await client.db.Person.create({
        data: {
          name: 'Mentee',
          mentor: {
            create: { name: 'New Mentor' },
          },
        },
      });

      expect(person.mentorId).toBeDefined();

      // Verify mentor exists
      const mentor = await client.db.Person.findOne({
        where: { id: person.mentorId! },
      });
      expect(mentor?.name).toBe('New Mentor');
    });
  });

  describe('create without mentor', () => {
    test('should create person without mentor', async () => {
      const person = await client.db.Person.create({
        data: { name: 'Solo' },
      });

      expect(person.mentorId).toBeNull();
    });
  });

  describe('one-directional relationship', () => {
    test('A having mentor B does not mean B has mentor A', async () => {
      const senior = await client.db.Person.create({
        data: { name: 'Senior' },
      });

      const junior = await client.db.Person.create({
        data: {
          name: 'Junior',
          mentor: { connect: senior.id },
        },
      });

      // Junior has Senior as mentor
      expect(junior.mentorId?.equals(senior.id)).toBe(true);

      // Senior has no mentor
      const seniorRefresh = await client.db.Person.findOne({
        where: { id: senior.id },
      });
      expect(seniorRefresh?.mentorId).toBeNull();
    });
  });
});
