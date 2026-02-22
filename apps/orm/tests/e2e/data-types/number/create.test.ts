import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Number: Create', () => {
  const { getClient } = setupDataTypeTests(tables.number);

  test('create with required Number field', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'Widget',
        price: 19.99,
        weight: null,
      },
    });

    expect(result.price).toBe(19.99);
    expect(typeof result.price).toBe('number');
  });

  test('create with integer Number field', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'Gadget',
        price: 42,
        weight: null,
      },
    });

    expect(result.price).toBe(42);
  });

  test('create with optional Number field omitted', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'Item',
        price: 9.99,
        weight: null,
      },
    });

    expect(result.rating).toBeUndefined();
  });

  test('create with optional Number field provided', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'Item',
        price: 9.99,
        weight: null,
        rating: 4.5,
      },
    });

    expect(result.rating).toBe(4.5);
  });

  test('create with nullable Number field set to null', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'Thing',
        price: 5.5,
        weight: null,
      },
    });

    expect(result.weight).toBeNull();
  });

  test('create with nullable Number field set to value', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'Thing',
        price: 5.5,
        weight: 2.5,
      },
    });

    expect(result.weight).toBe(2.5);
  });

  test('create with Number array defaults to empty', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'NoScores',
        price: 15.0,
        weight: null,
      },
    });

    expect(Array.isArray(result.scores)).toBe(true);
    expect(result.scores.length).toBe(0);
  });

  test('create with Number array provided', async () => {
    const client = getClient();
    const result = await client.db.NumberBasic.create({
      data: {
        name: 'WithScores',
        price: 25.0,
        weight: null,
        scores: [85.5, 90.0, 78.25],
      },
    });

    expect(result.scores.length).toBe(3);
    expect(result.scores[0]).toBe(85.5);
    expect(result.scores[1]).toBe(90.0);
    expect(result.scores[2]).toBe(78.25);
  });

  test('create with @default Number field', async () => {
    const client = getClient();
    const result = await client.db.NumberDecorated.create({
      data: {
        name: 'DefaultTest',
      },
    });

    expect(result.score).toBe(0);
  });

  test('create with @default Number field overridden', async () => {
    const client = getClient();
    const result = await client.db.NumberDecorated.create({
      data: {
        name: 'OverrideTest',
        score: 95,
      },
    });

    expect(result.score).toBe(95);
  });

  test('create with @defaultAlways Number field', async () => {
    const client = getClient();
    const result = await client.db.NumberDecorated.create({
      data: {
        name: 'DefaultAlwaysTest',
      },
    });

    expect(result.multiplier).toBe(1);
  });

  test('create with @defaultAlways Number field overridden', async () => {
    const client = getClient();
    const result = await client.db.NumberDecorated.create({
      data: {
        name: 'DefaultAlwaysOverride',
        multiplier: 2.5,
      },
    });

    expect(result.multiplier).toBe(2.5);
  });

  test('create with Number in object field', async () => {
    const client = getClient();
    const result = await client.db.NumberWithObject.create({
      data: {
        name: 'ObjectTest',
        stats: {
          views: 100,
          downloads: 50,
          rating: 4.5,
        },
      },
    });

    expect(result.stats.views).toBe(100);
    expect(result.stats.downloads).toBe(50);
    expect(result.stats.rating).toBe(4.5);
  });

  test('create with Number in object field with defaults', async () => {
    const client = getClient();
    const result = await client.db.NumberWithObject.create({
      data: {
        name: 'ObjectDefaults',
        stats: {
          views: 200,
        },
      },
    });

    expect(result.stats.views).toBe(200);
    expect(result.stats.downloads).toBeUndefined();
    expect(result.stats.rating).toBe(0);
  });

  test('create with optional object field omitted', async () => {
    const client = getClient();
    const result = await client.db.NumberWithObject.create({
      data: {
        name: 'NoOptStats',
        stats: {
          views: 150,
        },
      },
    });

    expect(result.optStats).toBeUndefined();
  });

  test('create with optional object field provided', async () => {
    const client = getClient();
    const result = await client.db.NumberWithObject.create({
      data: {
        name: 'WithOptStats',
        stats: {
          views: 150,
        },
        optStats: {
          views: 300,
          downloads: 100,
        },
      },
    });

    expect(result.optStats).toBeDefined();
    expect(result.optStats!.views).toBe(300);
    expect(result.optStats!.downloads).toBe(100);
  });

  test('create with Number in tuple field', async () => {
    const client = getClient();
    const result = await client.db.NumberWithTuple.create({
      data: {
        name: 'TupleTest',
        coord: [10.5, 20.5, 30.5],
      },
    });

    expect(result.coord[0]).toBe(10.5);
    expect(result.coord[1]).toBe(20.5);
    expect(result.coord[2]).toBe(30.5);
  });

  test('create with Number in tuple field with optional element omitted (object form)', async () => {
    const client = getClient();
    const result = await client.db.NumberWithTuple.create({
      data: {
        name: 'TupleOptional',
        coord: { 0: 15, 1: 25 },
      },
    });

    expect(result.coord[0]).toBe(15);
    expect(result.coord[1]).toBe(25);
    // Nullable element omitted → SurrealDB returns null → mapper returns null
    expect(result.coord[2]).toBeNull();
  });

  test('create with optional tuple field omitted', async () => {
    const client = getClient();
    const result = await client.db.NumberWithTuple.create({
      data: {
        name: 'NoOptCoord',
        coord: [5, 10, 15],
      },
    });

    expect(result.optCoord).toBeUndefined();
  });

  test('create with optional tuple field provided', async () => {
    const client = getClient();
    const result = await client.db.NumberWithTuple.create({
      data: {
        name: 'WithOptCoord',
        coord: [5, 10, 15],
        optCoord: [100, 200, 300],
      },
    });

    expect(result.optCoord).toBeDefined();
    expect(result.optCoord![0]).toBe(100);
    expect(result.optCoord![1]).toBe(200);
    expect(result.optCoord![2]).toBe(300);
  });
});
