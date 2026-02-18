import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';
import { CerialUuid, isCerialId } from 'cerial';
import { Uuid } from 'surrealdb';

const UUID_TABLES = tables.uuid;
const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000';
const SAMPLE_UUID2 = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('E2E UUID: Create', () => {
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

  test('create with explicit UUID string', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('test');
    expect(CerialUuid.is(result.token)).toBe(true);
    expect(result.token.toString()).toBe(SAMPLE_UUID);
  });

  test('create with CerialUuid input', async () => {
    const input = new CerialUuid(SAMPLE_UUID);
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: input },
    });

    expect(CerialUuid.is(result.token)).toBe(true);
    expect(result.token.equals(input)).toBe(true);
  });

  test('create with SDK Uuid input', async () => {
    const native = new Uuid(SAMPLE_UUID);
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: native },
    });

    expect(CerialUuid.is(result.token)).toBe(true);
    expect(result.token.toString()).toBe(SAMPLE_UUID);
  });

  test('optional UUID omitted returns undefined', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID },
    });

    expect(result.optionalToken).toBeUndefined();
  });

  test('optional UUID provided returns CerialUuid', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID, optionalToken: SAMPLE_UUID2 },
    });

    expect(CerialUuid.is(result.optionalToken)).toBe(true);
    expect(result.optionalToken!.toString()).toBe(SAMPLE_UUID2);
  });

  test('nullable UUID set to null returns null', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID, nullableToken: null },
    });

    expect(result.nullableToken).toBeNull();
  });

  test('nullable UUID set to value returns CerialUuid', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID, nullableToken: SAMPLE_UUID2 },
    });

    expect(CerialUuid.is(result.nullableToken)).toBe(true);
    expect(result.nullableToken!.toString()).toBe(SAMPLE_UUID2);
  });

  test('UUID array defaults to empty when omitted', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID },
    });

    expect(result.tags).toEqual([]);
  });

  test('UUID array with values', async () => {
    const result = await client.db.UuidBasic.create({
      data: { name: 'test', token: SAMPLE_UUID, tags: [SAMPLE_UUID, SAMPLE_UUID2] },
    });

    expect(result.tags).toHaveLength(2);
    expect(CerialUuid.is(result.tags[0])).toBe(true);
    expect(CerialUuid.is(result.tags[1])).toBe(true);
    expect(result.tags[0]!.toString()).toBe(SAMPLE_UUID);
    expect(result.tags[1]!.toString()).toBe(SAMPLE_UUID2);
  });

  test('findUnique reads back UUID correctly', async () => {
    const created = await client.db.UuidBasic.create({
      data: {
        name: 'roundtrip',
        token: SAMPLE_UUID,
        optionalToken: SAMPLE_UUID2,
        nullableToken: SAMPLE_UUID,
        tags: [SAMPLE_UUID2],
      },
    });

    const found = await client.db.UuidBasic.findUnique({ where: { id: created.id } });

    expect(found).not.toBeNull();
    expect(CerialUuid.is(found!.token)).toBe(true);
    expect(found!.token.toString()).toBe(SAMPLE_UUID);
    expect(found!.optionalToken!.toString()).toBe(SAMPLE_UUID2);
    expect(found!.nullableToken!.toString()).toBe(SAMPLE_UUID);
    expect(found!.tags[0]!.toString()).toBe(SAMPLE_UUID2);
  });

  test('update UUID field', async () => {
    const created = await client.db.UuidBasic.create({
      data: { name: 'upd', token: SAMPLE_UUID },
    });

    const updated = await client.db.UuidBasic.updateUnique({
      where: { id: created.id },
      data: { token: SAMPLE_UUID2 },
    });

    expect(updated).not.toBeNull();
    expect(updated!.token.toString()).toBe(SAMPLE_UUID2);
  });

  test('delete record with UUID fields', async () => {
    const created = await client.db.UuidBasic.create({
      data: { name: 'del', token: SAMPLE_UUID },
    });

    await client.db.UuidBasic.deleteUnique({ where: { id: created.id } });

    const found = await client.db.UuidBasic.findUnique({ where: { id: created.id } });
    expect(found).toBeNull();
  });
});
