import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Number: Nesting in Objects and Tuples', () => {
  const { getClient } = setupDataTypeTests(tables.number);

  test('select Number fields from object', async () => {
    const client = getClient();
    const created = await client.db.NumberWithObject.create({
      data: {
        name: 'ObjectSelect',
        stats: {
          views: 500,
          downloads: 100,
          rating: 4.5,
        },
      },
    });

    const result = await client.db.NumberWithObject.findOne({
      where: { id: created.id },
      select: { name: true, stats: true },
    });

    expect(result?.stats.views).toBe(500);
    expect(result?.stats.downloads).toBe(100);
    expect(result?.stats.rating).toBe(4.5);
  });

  test('updateUnique Number field in object', async () => {
    const client = getClient();
    const created = await client.db.NumberWithObject.create({
      data: {
        name: 'ObjectUpdate',
        stats: {
          views: 600,
          downloads: 50,
        },
      },
    });

    const updated = await client.db.NumberWithObject.updateUnique({
      where: { id: created.id },
      data: {
        stats: {
          views: 700,
          downloads: 150,
        },
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.stats.views).toBe(700);
    expect(updated!.stats.downloads).toBe(150);
  });

  test('select Number elements from tuple', async () => {
    const client = getClient();
    const created = await client.db.NumberWithTuple.create({
      data: {
        name: 'TupleSelect',
        coord: [7.5, 12.5, 17.5],
      },
    });

    const result = await client.db.NumberWithTuple.findOne({
      where: { id: created.id },
      select: { name: true, coord: true },
    });

    expect(result?.coord[0]).toBe(7.5);
    expect(result?.coord[1]).toBe(12.5);
    expect(result?.coord[2]).toBe(17.5);
  });

  test('updateUnique Number elements in tuple', async () => {
    const client = getClient();
    const created = await client.db.NumberWithTuple.create({
      data: {
        name: 'TupleUpdate',
        coord: [8, 13, 18],
      },
    });

    const updated = await client.db.NumberWithTuple.updateUnique({
      where: { id: created.id },
      data: {
        coord: [9, 14, 19],
      },
    });

    expect(updated).not.toBeNull();
    expect(updated!.coord[0]).toBe(9);
    expect(updated!.coord[1]).toBe(14);
    expect(updated!.coord[2]).toBe(19);
  });

  test('filter by Number in object field', async () => {
    const client = getClient();
    await client.db.NumberWithObject.create({
      data: {
        name: 'FilterObject1',
        stats: {
          views: 1000,
          downloads: 100,
        },
      },
    });
    await client.db.NumberWithObject.create({
      data: {
        name: 'FilterObject2',
        stats: {
          views: 2000,
          downloads: 200,
        },
      },
    });

    const results = await client.db.NumberWithObject.findMany({
      where: { stats: { views: { gt: 1500 } } },
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r: (typeof results)[0]) => r.name === 'FilterObject2')).toBe(true);
  });
});
