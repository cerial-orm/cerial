/**
 * E2E Tests: Composite Unique (Records) — updateUnique
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests updating records by composite unique key where the key fields are Record types.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  INDEX_TABLES,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite Unique Records: updateUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, INDEX_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, INDEX_TABLES);
  });

  test('update record by composite key (change role)', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.updateUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      data: { role: 'instructor' },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.role).toBe('instructor');
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
  });

  test('return null when composite key not found', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop1 = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    const workshop2 = await client.db.Workshop.create({ data: { title: 'Rust Basics' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop1.id, role: 'student' },
    });

    const result = await client.db.Registration.updateUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop2.id } },
      data: { role: 'instructor' },
    });

    expect(result).toBeNull();

    // Verify original record unchanged
    const original = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop1.id } },
    });
    expect(original).not.toBeNull();
    expect(original!.role).toBe('student');
  });

  test('update with return: true returns boolean', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const resultExists = await client.db.Registration.updateUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      data: { role: 'ta' },
      return: true,
    });

    expect(resultExists).toBe(true);

    // Verify data was actually updated
    const found = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });
    expect(found!.role).toBe('ta');

    // Non-existent composite key
    const otherWorkshop = await client.db.Workshop.create({ data: { title: 'Missing' } });
    const resultMissing = await client.db.Registration.updateUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: otherWorkshop.id } },
      data: { role: 'instructor' },
      return: true,
    });

    expect(resultMissing).toBe(false);
  });

  test("update with return: 'before' returns pre-update state", async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Carol' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'Docker Deep Dive' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.updateUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      data: { role: 'instructor' },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.role).toBe('student');
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);

    // Verify the update actually happened
    const after = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });
    expect(after!.role).toBe('instructor');
  });
});
