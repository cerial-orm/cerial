/**
 * E2E Tests: Composite Unique (Records) — deleteUnique
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests deleting records by composite unique key where the key fields are Record types.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { cleanAndPrepare, truncateIndexTables, createTestClient, CerialClient, testConfig } from '../../../test-helper';

describe('Composite Unique Records: deleteUnique', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanAndPrepare(client);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateIndexTables(client);
  });

  test('delete by composite key, verify record is gone', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    // Verify record exists
    const before = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });
    expect(before).not.toBeNull();

    // Delete by composite key
    const result = await client.db.Registration.deleteUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });

    expect(result).toBe(true);

    // Verify record is gone
    const after = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });
    expect(after).toBeNull();
  });

  test('delete with return: true returns true when record exists', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'instructor' },
    });

    const result = await client.db.Registration.deleteUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      return: true,
    });

    expect(result).toBe(true);
  });

  test('delete with return: true returns false when record does not exist', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Nobody' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'Nonexistent' } });

    const result = await client.db.Registration.deleteUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      return: true,
    });

    expect(result).toBe(false);
  });

  test("delete with return: 'before' returns deleted record", async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Carol' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'Docker Deep Dive' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'ta' },
    });

    const result = await client.db.Registration.deleteUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      return: 'before',
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeInstanceOf(CerialId);
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
    expect(result!.role).toBe('ta');

    // Verify record is gone
    const after = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });
    expect(after).toBeNull();
  });
});
