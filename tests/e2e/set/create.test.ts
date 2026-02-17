import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { isCerialId, type CerialSet } from 'cerial';

const SET_TABLES = tables.set;

const set = <T>(arr: T[]): CerialSet<T> => arr as CerialSet<T>;

describe('E2E Set: Create', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, SET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, SET_TABLES);
  });

  test('create with duplicates — deduplicates automatically', async () => {
    const result = await client.db.SetBasic.create({
      data: { name: 'dedup', tags: ['b', 'a', 'b', 'c', 'a'], numbers: [3, 1, 2, 1], uuids: [] },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('dedup');
    expect(result.tags).toEqual(set(['a', 'b', 'c']));
    expect(result.numbers).toEqual(set([1, 2, 3]));
    expect(result.uuids).toEqual(set([]));
  });

  test('create with already sorted unique input — preserves order', async () => {
    const result = await client.db.SetBasic.create({
      data: { name: 'sorted', tags: ['alpha', 'beta', 'gamma'], numbers: [10, 20, 30], uuids: [] },
    });

    expect(result.tags).toEqual(set(['alpha', 'beta', 'gamma']));
    expect(result.numbers).toEqual(set([10, 20, 30]));
  });

  test('create with empty arrays — returns empty', async () => {
    const result = await client.db.SetBasic.create({
      data: { name: 'empty', tags: [], numbers: [], uuids: [] },
    });

    expect(result.tags).toEqual(set<string>([]));
    expect(result.numbers).toEqual(set<number>([]));
    expect(result.uuids).toEqual(set([]));
  });

  test('create with single element — returns single element', async () => {
    const result = await client.db.SetBasic.create({
      data: { name: 'single', tags: ['only'], numbers: [42], uuids: [] },
    });

    expect(result.tags).toEqual(set(['only']));
    expect(result.numbers).toEqual(set([42]));
  });

  test('create without optional array fields — defaults to empty', async () => {
    const result = await client.db.SetBasic.create({
      data: { name: 'defaults' },
    });

    expect(result.tags).toEqual(set<string>([]));
    expect(result.numbers).toEqual(set<number>([]));
    expect(result.uuids).toEqual(set([]));
  });

  test('numbers are sorted numerically', async () => {
    const result = await client.db.SetBasic.create({
      data: { name: 'num-sort', tags: [], numbers: [100, 2, 30, 1, 50], uuids: [] },
    });

    expect(result.numbers).toEqual(set([1, 2, 30, 50, 100]));
  });
});
