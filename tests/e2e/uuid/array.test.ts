import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';
import { CerialUuid } from 'cerial';

const UUID_TABLES = tables.uuid;
const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const UUID_C = '00000000-0000-4000-8000-000000000003';

describe('E2E UUID: Array Operations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, UUID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, UUID_TABLES);
  });

  test('create with UUID array', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'arr', token: UUID_A, tags: [UUID_A, UUID_B] },
    });

    expect(result.tags).toHaveLength(2);
    expect(result.tags.every((t) => CerialUuid.is(t))).toBe(true);
  });

  test('create with empty UUID array', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'empty', token: UUID_A, tags: [] },
    });

    expect(result.tags).toEqual([]);
  });

  test('update: set UUID array', async () => {
    const created = await client.db.UuidBasic.create({
      data: { name: 'set-arr', token: UUID_A, tags: [UUID_A] },
    });

    const updated = await client.db.UuidBasic.updateUnique({
      where: { id: created.id },
      data: { tags: [UUID_B, UUID_C] },
    });

    expect(updated).not.toBeNull();
    expect(updated!.tags).toHaveLength(2);
    expect(updated!.tags[0]!.toString()).toBe(UUID_B);
    expect(updated!.tags[1]!.toString()).toBe(UUID_C);
  });

  test('update: push single UUID to array', async () => {
    const created = await client.db.UuidBasic.create({
      data: { name: 'push-single', token: UUID_A, tags: [UUID_A] },
    });

    const updated = await client.db.UuidBasic.updateUnique({
      where: { id: created.id },
      data: { tags: { push: UUID_B } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.tags).toHaveLength(2);
    expect(updated!.tags.some((t) => t.toString() === UUID_A)).toBe(true);
    expect(updated!.tags.some((t) => t.toString() === UUID_B)).toBe(true);
  });

  test('update: push multiple UUIDs to array', async () => {
    const created = await client.db.UuidBasic.create({
      data: { name: 'push-multi', token: UUID_A, tags: [] },
    });

    const updated = await client.db.UuidBasic.updateUnique({
      where: { id: created.id },
      data: { tags: { push: [UUID_A, UUID_B, UUID_C] } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.tags).toHaveLength(3);
  });

  test('update: replace entire array', async () => {
    const created = await client.db.UuidBasic.create({
      data: { name: 'replace', token: UUID_A, tags: [UUID_A, UUID_B, UUID_C] },
    });

    const updated = await client.db.UuidBasic.updateUnique({
      where: { id: created.id },
      data: { tags: [UUID_C] },
    });

    expect(updated).not.toBeNull();
    expect(updated!.tags).toHaveLength(1);
    expect(updated!.tags[0]!.toString()).toBe(UUID_C);
  });
});
