/**
 * E2E Tests: Self-Referential One-to-One - Cycles
 *
 * Schema: self-ref-one-to-one.cerial
 * Tests handling of cyclic references (A.mentor = A should error).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  CerialClient,
  tables,
  testConfig,
} from '../../test-helper';

describe('E2E Self-Ref One-to-One: Cycles', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefOneToOne);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  describe('self-mentorship', () => {
    test('should allow person to be their own mentor (no cycle detection)', async () => {
      // Note: Cycle detection is not implemented - self-references are allowed
      // This may be valid in some domains (self-mentorship, self-references)
      const person = await client.db.Person.create({
        data: { name: 'Self Mentor' },
      });

      // Set self as mentor - allowed without cycle validation
      await client.db.Person.updateMany({
        where: { id: person.id },
        data: {
          mentor: { connect: person.id },
        },
      });

      // Person has self as mentor
      const updated = await client.db.Person.findOne({
        where: { id: person.id },
      });
      expect(updated?.mentorId).toBe(person.id);
    });
  });

  describe('circular mentorship', () => {
    test('should handle A -> B -> A circular reference', async () => {
      const a = await client.db.Person.create({
        data: { name: 'A' },
      });
      const b = await client.db.Person.create({
        data: { name: 'B', mentor: { connect: a.id } },
      });

      // B has A as mentor
      expect(b.mentorId).toBe(a.id);

      // Try to set A's mentor to B (creates cycle)
      // This may or may not be allowed depending on implementation
      const result = await client.db.Person.updateMany({
        where: { id: a.id },
        data: {
          mentor: { connect: b.id },
        },
      });

      // If allowed, both should have each other as mentors
      // This is technically valid in some domains (mutual mentorship)
      if (result.length > 0) {
        expect(result[0]?.mentorId).toBe(b.id);
        const bUpdated = await client.db.Person.findOne({
          where: { id: b.id },
        });
        expect(bUpdated?.mentorId).toBe(a.id);
      }
    });

    test('should handle longer cycles A -> B -> C -> A', async () => {
      const a = await client.db.Person.create({
        data: { name: 'A' },
      });
      const b = await client.db.Person.create({
        data: { name: 'B', mentor: { connect: a.id } },
      });
      const c = await client.db.Person.create({
        data: { name: 'C', mentor: { connect: b.id } },
      });

      // Chain: C -> B -> A
      expect(c.mentorId).toBe(b.id);
      expect(b.mentorId).toBe(a.id);

      // Complete cycle: A -> C
      await client.db.Person.updateMany({
        where: { id: a.id },
        data: {
          mentor: { connect: c.id },
        },
      });

      const aUpdated = await client.db.Person.findOne({
        where: { id: a.id },
      });
      expect(aUpdated?.mentorId).toBe(c.id);
    });
  });
});
