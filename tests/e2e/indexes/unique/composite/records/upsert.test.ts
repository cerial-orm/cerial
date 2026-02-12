/**
 * E2E Tests: Composite Unique (Records) — upsert
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests upsert operations using composite unique key where the key fields are Record types.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { setupIndexClient, CerialClient } from '../../../test-helper';

describe('Composite Unique Records: upsert', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = await setupIndexClient();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('create path: registration does not exist, creates with create data', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });

    const result = await client.db.Registration.upsert({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      create: {
        attendeeId: attendee.id,
        workshopId: workshop.id,
        role: 'student',
      },
      update: { role: 'instructor' },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(isCerialId(result!.id)).toBe(true);
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
    expect(result!.role).toBe('student');

    // Verify record exists in DB
    const found = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
    });
    expect(found).not.toBeNull();
    expect(found!.role).toBe('student');
  });

  test('update path: registration exists, updates with update data', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });

    // Create existing registration
    const created = await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.upsert({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      create: {
        attendeeId: attendee.id,
        workshopId: workshop.id,
        role: 'should-not-use',
      },
      update: { role: 'instructor' },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id.equals(created.id)).toBe(true);
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
    expect(result!.role).toBe('instructor');
  });
});
