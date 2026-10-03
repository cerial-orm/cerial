/**
 * E2E Tests: composite @@unique and @@index mixing record fields with primitive and object fields
 *
 * Schema: composite-unique-records.cerial, composite-unique-objects.cerial
 * Models: Ticket (record+primitive unique, record-only and record+primitive index),
 *         Booking (record+object unique and index), Depot (object-only and primitive+object index)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('Composite keys across field kinds', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.indexes);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.indexes);
  });

  describe('Ticket: @@unique over a record and a primitive', () => {
    test('finds by the composite key', async () => {
      const a = await client.db.Attendee.create({ data: { name: 'A' } });
      const w = await client.db.Workshop.create({ data: { title: 'W' } });
      await client.db.Ticket.create({ data: { attendeeId: a.id, workshopId: w.id, seat: '1A' } });

      const found = await client.db.Ticket.findUnique({
        where: { ticketWorkshopSeat: { workshopId: w.id, seat: '1A' } },
      });
      const missing = await client.db.Ticket.findUnique({
        where: { ticketWorkshopSeat: { workshopId: w.id, seat: '9Z' } },
      });

      expect(found?.seat).toBe('1A');
      expect(missing).toBeNull();
    });

    test('rejects a second ticket for the same workshop and seat', async () => {
      const a1 = await client.db.Attendee.create({ data: { name: 'A1' } });
      const a2 = await client.db.Attendee.create({ data: { name: 'A2' } });
      const w = await client.db.Workshop.create({ data: { title: 'W' } });
      await client.db.Ticket.create({ data: { attendeeId: a1.id, workshopId: w.id, seat: '1A' } });

      await expect(
        (async () => {
          await client.db.Ticket.create({ data: { attendeeId: a2.id, workshopId: w.id, seat: '1A' } });
        })(),
      ).rejects.toThrow();
      expect(await client.db.Ticket.count()).toBe(1);
    });

    test('allows the same seat in a different workshop', async () => {
      const a = await client.db.Attendee.create({ data: { name: 'A' } });
      const w1 = await client.db.Workshop.create({ data: { title: 'W1' } });
      const w2 = await client.db.Workshop.create({ data: { title: 'W2' } });
      await client.db.Ticket.create({ data: { attendeeId: a.id, workshopId: w1.id, seat: '1A' } });
      await client.db.Ticket.create({ data: { attendeeId: a.id, workshopId: w2.id, seat: '1A' } });

      expect(await client.db.Ticket.count()).toBe(2);
    });

    test('non-unique indexes over records do not reject duplicates', async () => {
      const a = await client.db.Attendee.create({ data: { name: 'A' } });
      const w1 = await client.db.Workshop.create({ data: { title: 'W1' } });
      const w2 = await client.db.Workshop.create({ data: { title: 'W2' } });
      await client.db.Ticket.create({ data: { attendeeId: a.id, workshopId: w1.id, seat: '1A' } });
      await client.db.Ticket.create({ data: { attendeeId: a.id, workshopId: w2.id, seat: '1A' } });

      const byAttendee = await client.db.Ticket.findMany({ where: { attendeeId: a.id, seat: '1A' } });
      expect(byAttendee).toHaveLength(2);
    });
  });

  describe('Booking: @@unique over a record and an object sub-field', () => {
    test('finds by the composite key using the dotted sub-field', async () => {
      const a = await client.db.Attendee.create({ data: { name: 'A' } });
      await client.db.Booking.create({ data: { attendeeId: a.id, slot: { row: 'R1' } } });

      const found = await client.db.Booking.findUnique({
        where: { bookingAttendeeRowUnique: { attendeeId: a.id, slot: { row: 'R1' } } },
      });

      expect(found?.slot.row).toBe('R1');
    });

    test('rejects the same attendee in the same row', async () => {
      const a = await client.db.Attendee.create({ data: { name: 'A' } });
      await client.db.Booking.create({ data: { attendeeId: a.id, slot: { row: 'R1' } } });

      await expect(
        (async () => {
          await client.db.Booking.create({ data: { attendeeId: a.id, slot: { row: 'R1' } } });
        })(),
      ).rejects.toThrow();
      expect(await client.db.Booking.count()).toBe(1);
    });

    test('allows the same attendee in another row and another attendee in the same row', async () => {
      const a1 = await client.db.Attendee.create({ data: { name: 'A1' } });
      const a2 = await client.db.Attendee.create({ data: { name: 'A2' } });
      await client.db.Booking.create({ data: { attendeeId: a1.id, slot: { row: 'R1' } } });
      await client.db.Booking.create({ data: { attendeeId: a1.id, slot: { row: 'R2' } } });
      await client.db.Booking.create({ data: { attendeeId: a2.id, slot: { row: 'R1' } } });

      expect(await client.db.Booking.count()).toBe(3);
    });
  });

  describe('Depot: @@index over object sub-fields', () => {
    test('stores duplicates and filters on the indexed sub-fields', async () => {
      await client.db.Depot.create({ data: { label: 'north', dock: { bay: 'B1', level: 1 } } });
      await client.db.Depot.create({ data: { label: 'north', dock: { bay: 'B1', level: 1 } } });
      await client.db.Depot.create({ data: { label: 'south', dock: { bay: 'B2', level: 1 } } });

      const objectOnly = await client.db.Depot.findMany({ where: { dock: { bay: 'B1', level: 1 } } });
      const mixed = await client.db.Depot.findMany({ where: { label: 'south', dock: { bay: 'B2' } } });

      expect(objectOnly).toHaveLength(2);
      expect(mixed).toHaveLength(1);
      expect(mixed[0]?.label).toBe('south');
    });
  });
});
