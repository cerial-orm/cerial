import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Any: Where', () => {
  const { getClient } = setupDataTypeTests(tables.any);

  test('filter by exact string value', async () => {
    const client = getClient();
    await client.db.AnyBasic.create({ data: { name: 'a', data: 'match' } });
    await client.db.AnyBasic.create({ data: { name: 'b', data: 'other' } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { eq: 'match' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('a');
  });

  test('filter by numeric comparison', async () => {
    const client = getClient();
    await client.db.AnyBasic.create({ data: { name: 'low', data: 10 } });
    await client.db.AnyBasic.create({ data: { name: 'high', data: 100 } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { gt: 50 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('high');
  });

  test('filter by neq', async () => {
    const client = getClient();
    await client.db.AnyBasic.create({ data: { name: 'keep', data: 'yes' } });
    await client.db.AnyBasic.create({ data: { name: 'skip', data: 'no' } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { neq: 'no' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('keep');
  });

  test('filter with in operator', async () => {
    const client = getClient();
    await client.db.AnyBasic.create({ data: { name: 'one', data: 1 } });
    await client.db.AnyBasic.create({ data: { name: 'two', data: 2 } });
    await client.db.AnyBasic.create({ data: { name: 'three', data: 3 } });

    const results = await client.db.AnyBasic.findMany({
      where: { data: { in: [1, 3] } },
    });

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['one', 'three']);
  });
});
