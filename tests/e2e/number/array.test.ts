import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const NUMBER_TABLES = tables.number;

describe('E2E Number: Array Operations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, NUMBER_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, NUMBER_TABLES);
  });

  test('create with empty Number array', async () => {
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'EmptyScores',
        price: 10.0,
        weight: null,
      },
    });

    expect(Array.isArray(result.scores)).toBe(true);
    expect(result.scores.length).toBe(0);
  });

  test('create with Number array', async () => {
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'WithScores',
        price: 20.0,
        weight: null,
        scores: [85.5, 90.0, 78.25],
      },
    });

    expect(result.scores.length).toBe(3);
    expect(result.scores[0]).toBe(85.5);
    expect(result.scores[1]).toBe(90.0);
    expect(result.scores[2]).toBe(78.25);
  });

  test('updateUnique Number array', async () => {
    const created = await client.db.NumberBasic.create({
      data: {
        name: 'UpdateScores',
        price: 30.0,
        weight: null,
        scores: [70, 75],
      },
    });

    const updated = await client.db.NumberBasic.updateUnique({
      where: { id: created.id },
      data: {
        scores: [80, 85, 90],
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.scores.length).toBe(3);
    expect(updated!.scores[0]).toBe(80);
    expect(updated!.scores[1]).toBe(85);
    expect(updated!.scores[2]).toBe(90);
  });
});
