/**
 * E2E Tests: unknown data keys — negative cases
 *
 * A key that is not a model field must throw instead of being silently dropped.
 * Known-but-excluded fields (@now) are not unknown.
 *
 * Schema: timestamps.cerial
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

describe('Unknown data keys — negative cases', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.timestamps);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.timestamps);
  });

  test('create throws on a typo key and names it', () => {
    expect(() => {
      client.db.TimestampTest.create({
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        data: { name: 'A', nmae: 'typo' },
      });
    }).toThrow("Invalid data: Unknown field 'nmae' on model TimestampTest");
  });

  test('create throws listing every unknown key', () => {
    expect(() => {
      client.db.TimestampTest.create({
        // @ts-expect-error — unknown keys, testing runtime guard
        data: { name: 'A', foo: 1, bar: 2 },
      });
    }).toThrow(/Unknown field 'foo'.*Unknown field 'bar'/);
  });

  test('updateUnique throws on a typo key and leaves the record untouched', async () => {
    const record = await client.db.TimestampTest.create({ data: { name: 'Before' } });

    expect(() => {
      client.db.TimestampTest.updateUnique({
        where: { id: record.id },
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        data: { nmae: 'After' },
      });
    }).toThrow("Invalid data: Unknown field 'nmae' on model TimestampTest");

    const after = await client.db.TimestampTest.findOne({ where: { id: record.id } });
    expect(after!.name).toBe('Before');
  });

  test('updateMany throws on a typo key', () => {
    expect(() => {
      client.db.TimestampTest.updateMany({
        where: { name: 'A' },
        // @ts-expect-error — 'nmae' is not a field, testing runtime guard
        data: { nmae: 'After' },
      });
    }).toThrow("Unknown field 'nmae'");
  });

  test('upsert throws on an unknown key in create', () => {
    expect(() => {
      client.db.TimestampTest.upsert({
        where: { name: 'A' },
        // @ts-expect-error — unknown key in create, testing runtime guard
        create: { name: 'A', nmae: 'x' },
        update: { name: 'B' },
      });
    }).toThrow("Invalid data: Unknown field 'nmae'");
  });

  test('upsert throws on an unknown key in update', () => {
    expect(() => {
      client.db.TimestampTest.upsert({
        where: { name: 'A' },
        create: { name: 'A' },
        // @ts-expect-error — unknown key in update, testing runtime guard
        update: { nmae: 'x' },
      });
    }).toThrow("Invalid data: Unknown field 'nmae'");
  });

  test('known-but-computed @now field is still accepted and ignored on create', async () => {
    const record = await client.db.TimestampTest.create({
      data: {
        name: 'Known',
        // @ts-expect-error — accessedAt is @now (COMPUTED), excluded from CreateInput
        accessedAt: new Date('2000-01-01T00:00:00Z'),
      },
    });

    expect(record.name).toBe('Known');
  });
});
