/**
 * E2E Tests: Composite Unique (Records) — $transaction
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests composite unique key queries inside $transaction where the key fields are Record types.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { isCerialId } from 'cerial';
import { cleanAndPrepare, truncateIndexTables, createTestClient, CerialClient, testConfig } from '../../../test-helper';

describe('Composite Unique Records: $transaction', () => {
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

  test('$transaction with findUnique by composite key', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    const [result] = await client.$transaction([
      client.db.Registration.findUnique({
        where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      }),
    ]);

    expect(result).toBeDefined();
    expect(result).not.toBeNull();
    expect(isCerialId(result!.id)).toBe(true);
    expect(result!.attendeeId.equals(attendee.id)).toBe(true);
    expect(result!.workshopId.equals(workshop.id)).toBe(true);
    expect(result!.role).toBe('student');
  });

  test('$transaction: create attendee + workshop, then findUnique registration', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'instructor' },
    });

    const [newAttendee, newWorkshop, reg] = await client.$transaction([
      client.db.Attendee.create({ data: { name: 'Carol' } }),
      client.db.Workshop.create({ data: { title: 'Docker Deep Dive' } }),
      client.db.Registration.findUnique({
        where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop.id } },
      }),
    ]);

    expect(newAttendee).toBeDefined();
    expect(isCerialId(newAttendee.id)).toBe(true);
    expect(newAttendee.name).toBe('Carol');

    expect(newWorkshop).toBeDefined();
    expect(isCerialId(newWorkshop.id)).toBe(true);
    expect(newWorkshop.title).toBe('Docker Deep Dive');

    expect(reg).not.toBeNull();
    expect(reg!.role).toBe('instructor');
    expect(reg!.attendeeId.equals(attendee.id)).toBe(true);
    expect(reg!.workshopId.equals(workshop.id)).toBe(true);
  });

  test('$transaction with multiple composite key queries', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Dave' } });
    const workshop1 = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    const workshop2 = await client.db.Workshop.create({ data: { title: 'Rust Basics' } });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop1.id, role: 'student' },
    });
    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop2.id, role: 'ta' },
    });

    const [reg1, reg2, count] = await client.$transaction([
      client.db.Registration.findUnique({
        where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop1.id } },
      }),
      client.db.Registration.findUnique({
        where: { attendeeWorkshop: { attendeeId: attendee.id, workshopId: workshop2.id } },
      }),
      client.db.Registration.count(),
    ]);

    expect(reg1).not.toBeNull();
    expect(reg1!.role).toBe('student');

    expect(reg2).not.toBeNull();
    expect(reg2!.role).toBe('ta');

    expect(count).toBe(2);
  });
});
