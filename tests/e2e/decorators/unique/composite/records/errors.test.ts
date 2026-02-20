/**
 * E2E Tests: Composite Unique (Records) — error handling
 *
 * Schema: composite-unique-records.cerial
 * Model: Registration with @@unique(attendeeWorkshop, [attendeeId, workshopId])
 *
 * Tests that duplicate composite key violations are rejected by the database,
 * and that partial matches on the composite key do not violate the constraint.
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

describe('Composite Unique Records: errors', () => {
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

  test('DB rejects duplicate attendeeId + workshopId combination', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Alice' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });

    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'student' },
    });

    // Same attendeeId + workshopId = composite unique violation
    let threw = false;
    try {
      await client.db.Registration.create({
        data: { attendeeId: attendee.id, workshopId: workshop.id, role: 'instructor' },
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test('allows same attendee with different workshop (not a violation)', async () => {
    const attendee = await client.db.Attendee.create({ data: { name: 'Bob' } });
    const workshop1 = await client.db.Workshop.create({ data: { title: 'TypeScript 101' } });
    const workshop2 = await client.db.Workshop.create({ data: { title: 'Rust Basics' } });

    await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop1.id, role: 'student' },
    });

    // Same attendeeId but different workshopId — should succeed
    const result = await client.db.Registration.create({
      data: { attendeeId: attendee.id, workshopId: workshop2.id, role: 'instructor' },
    });

    expect(result).toBeDefined();
    expect(result.attendeeId.equals(attendee.id)).toBe(true);
    expect(result.workshopId.equals(workshop2.id)).toBe(true);
    expect(result.role).toBe('instructor');

    // Verify both registrations exist
    const count = await client.db.Registration.count();
    expect(count).toBe(2);
  });

  test('allows same workshop with different attendee (not a violation)', async () => {
    const attendee1 = await client.db.Attendee.create({ data: { name: 'Carol' } });
    const attendee2 = await client.db.Attendee.create({ data: { name: 'Dave' } });
    const workshop = await client.db.Workshop.create({ data: { title: 'GraphQL Workshop' } });

    await client.db.Registration.create({
      data: { attendeeId: attendee1.id, workshopId: workshop.id, role: 'student' },
    });

    // Same workshopId but different attendeeId — should succeed
    const result = await client.db.Registration.create({
      data: { attendeeId: attendee2.id, workshopId: workshop.id, role: 'student' },
    });

    expect(result).toBeDefined();
    expect(result.attendeeId.equals(attendee2.id)).toBe(true);
    expect(result.workshopId.equals(workshop.id)).toBe(true);

    // Verify both registrations exist
    const count = await client.db.Registration.count();
    expect(count).toBe(2);
  });
});
