import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import type { CerialSet } from 'cerial';

const SET_TABLES = tables.set;

const set = <T>(arr: T[]): CerialSet<T> => arr as CerialSet<T>;

describe('E2E Set: Operations', () => {
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

  test('push duplicate values — SurrealDB deduplicates', async () => {
    const created = await client.db.SetBasic.create({
      data: { name: 'push-dedup', tags: ['a', 'b'], numbers: [1, 2], uuids: [] },
    });

    await client.db.SetBasic.updateMany({
      where: { id: created.id },
      data: { tags: { push: 'a' } },
    });

    const result = await client.db.SetBasic.findOne({
      where: { id: created.id },
    });

    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(set(['a', 'b']));
  });

  test('push new values — sorted into correct position', async () => {
    const created = await client.db.SetBasic.create({
      data: { name: 'push-new', tags: ['b', 'd'], numbers: [], uuids: [] },
    });

    await client.db.SetBasic.updateMany({
      where: { id: created.id },
      data: { tags: { push: ['a', 'c'] } },
    });

    const result = await client.db.SetBasic.findOne({
      where: { id: created.id },
    });

    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(set(['a', 'b', 'c', 'd']));
  });

  test('full replace with duplicates — deduplicates', async () => {
    const created = await client.db.SetBasic.create({
      data: { name: 'replace', tags: ['x'], numbers: [], uuids: [] },
    });

    await client.db.SetBasic.updateMany({
      where: { id: created.id },
      data: { tags: ['z', 'a', 'z', 'm'] },
    });

    const result = await client.db.SetBasic.findOne({
      where: { id: created.id },
    });

    expect(result).not.toBeNull();
    expect(result!.tags).toEqual(set(['a', 'm', 'z']));
  });

  test('push number duplicates — deduplicates and sorts', async () => {
    const created = await client.db.SetBasic.create({
      data: { name: 'num-push', tags: [], numbers: [5, 10], uuids: [] },
    });

    await client.db.SetBasic.updateMany({
      where: { id: created.id },
      data: { numbers: { push: [10, 1, 20] } },
    });

    const result = await client.db.SetBasic.findOne({
      where: { id: created.id },
    });

    expect(result).not.toBeNull();
    expect(result!.numbers).toEqual(set([1, 5, 10, 20]));
  });
});
