import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Typed IDs: Object ID', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.typedIds);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.typedIds);
  });

  test('create with object id', async () => {
    const result = await client.db.ObjectIdModel.create({
      data: { id: { service: 'api', timestamp: 123 }, value: 9.5 },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(typeof result.id.id).toBe('object');
    const idObj = result.id.id;
    expect(idObj.service).toBe('api');
    expect(idObj.timestamp).toBe(123);
    expect(result.value).toBe(9.5);
  });

  test('findOne by object id using CerialId', async () => {
    const created = await client.db.ObjectIdModel.create({
      data: { id: { service: 'api', timestamp: 123 }, value: 9.5 },
    });

    const found = await client.db.ObjectIdModel.findOne({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found!.value).toBe(9.5);
    const idObj = found!.id.id;
    expect(idObj.service).toBe('api');
  });

  test('findMany returns object ids', async () => {
    await client.db.ObjectIdModel.create({
      data: { id: { service: 'web', timestamp: 1 }, value: 1.0 },
    });
    await client.db.ObjectIdModel.create({
      data: { id: { service: 'mobile', timestamp: 2 }, value: 2.0 },
    });

    const results = await client.db.ObjectIdModel.findMany();

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.id).toBeInstanceOf(CerialId);
      expect(typeof r.id.id).toBe('object');
    }
  });

  test('deleteMany by object id using CerialId', async () => {
    const created = await client.db.ObjectIdModel.create({
      data: { id: { service: 'del', timestamp: 999 }, value: 0 },
    });

    const count = await client.db.ObjectIdModel.deleteMany({
      where: { id: created.id },
    });

    expect(count).toBe(1);
  });
});
