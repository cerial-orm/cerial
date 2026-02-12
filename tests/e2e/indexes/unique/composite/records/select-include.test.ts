/**
 * E2E Tests: Composite Unique (Records) — select & include
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests select projections and relation includes with composite unique key queries
 * where the key fields are Record types.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import { setupIndexClient, CerialClient } from '../../../test-helper';

describe('Composite Unique Records: select & include', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = await setupIndexClient();
  });

  afterEach(async () => {
    await client.disconnect();
  });

  test('findUnique with composite key and select returns only selected fields', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      select: { id: true, role: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeInstanceOf(CerialId);
    expect(result!.role).toBe('student');
    // Non-selected fields should be absent
    expect((result as Record<string, unknown>).attendeeId).toBeUndefined();
    expect((result as Record<string, unknown>).workshopId).toBeUndefined();
  });

  test('findUnique with composite key and include (attendee relation)', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'instructor' },
    });

    const result = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      include: { attendee: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeInstanceOf(CerialId);
    expect(result!.role).toBe('instructor');
    expect(result!.attendee).toBeDefined();
    expect(result!.attendee.id.equals(attendee.id)).toBe(true);
    expect(result!.attendee.name).toBe('Bob');
  });

  test('findUnique with composite key and include (workshop relation)', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Carol' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'Docker Deep Dive' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'ta' },
    });

    const result = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      include: { workshop: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.workshop).toBeDefined();
    expect(result!.workshop.id.equals(workshop.id)).toBe(true);
    expect(result!.workshop.title).toBe('Docker Deep Dive');
  });

  test('findUnique with composite key and include (both relations)', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Dave' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'Kubernetes Intro' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.findUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      include: { attendee: true, workshop: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.attendee).toBeDefined();
    expect(result!.attendee.name).toBe('Dave');
    expect(result!.workshop).toBeDefined();
    expect(result!.workshop.title).toBe('Kubernetes Intro');
  });

  test('updateUnique with composite key and select returns only selected fields', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Eve' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'React Workshop' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const result = await client.db.Registration.updateUnique({
      where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      data: { role: 'ta' },
      select: { id: true, role: true },
    });

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(result!.id).toBeInstanceOf(CerialId);
    expect(result!.role).toBe('ta');
    // Non-selected fields should be absent
    expect((result as Record<string, unknown>).attendeeId).toBeUndefined();
    expect((result as Record<string, unknown>).workshopId).toBeUndefined();
  });
});
