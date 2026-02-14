/**
 * E2E Tests: Composite Unique (Records) — findUnique
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests finding records by composite unique key where the key fields are Record types.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { cleanAndPrepare, truncateIndexTables, createTestClient, CerialClient, testConfig } from '../../../test-helper';

describe('Composite Unique Records: findUnique', () => {
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

  test('find by composite key with CerialId values', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeInstanceOf(CerialId);
    expect(result!.attendeeId).toBeInstanceOf(CerialId);
    expect(result!.workshopId).toBeInstanceOf(CerialId);
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
    expect(result!.role).toBe('student');
  });

  test('return null when composite key not found', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop1 = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    const workshop2 = await client.db.Workshop.create({ data: { title: 'Rust Basics' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop1.id, role: 'student' },
    });

    // Same attendee but different (unregistered) workshop
    const result = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop2.id } },
    });

    expect(result).toBeNull();
  });

  test('find with composite key and additional filter (role)', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'instructor' },
    });

    const result = await client.db.Registration.findUnique({
      where: {
        attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id },
        role: 'instructor',
      },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.role).toBe('instructor');
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
  });

  test('return null when composite matches but additional filter fails', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Carol' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'Docker Deep Dive' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.findUnique({
      where: {
        attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id },
        role: 'instructor',
      },
    });

    expect(result).toBeNull();
  });
});
