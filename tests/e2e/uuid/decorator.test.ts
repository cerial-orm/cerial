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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('E2E UUID: Decorators (@uuid, @uuid4, @uuid7)', () => {
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

  describe('@uuid (default auto-generation)', () => {
    test('auto-generates UUID when field omitted', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'auto' },
      });

      expect(CerialUuid.is(result.autoId)).toBe(true);
      expect(UUID_REGEX.test(result.autoId!.toString())).toBe(true);
    });

    test('uses provided UUID when explicitly set', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'explicit', autoId: SAMPLE_UUID },
      });

      expect(result.autoId!.toString()).toBe(SAMPLE_UUID);
    });

    test('each create generates a unique UUID', async () => {
      const r1 = await client.db.UuidDecorated.create({ data: { name: 'u1' } });
      const r2 = await client.db.UuidDecorated.create({ data: { name: 'u2' } });

      expect(r1.autoId!.toString()).not.toBe(r2.autoId!.toString());
    });
  });

  describe('@uuid4 (v4 auto-generation)', () => {
    test('auto-generates v4 UUID when field omitted', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'auto-v4' },
      });

      expect(CerialUuid.is(result.autoV4)).toBe(true);
      expect(UUID_V4_REGEX.test(result.autoV4!.toString())).toBe(true);
    });

    test('uses provided UUID when explicitly set', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'explicit-v4', autoV4: SAMPLE_UUID },
      });

      expect(result.autoV4!.toString()).toBe(SAMPLE_UUID);
    });
  });

  describe('@uuid7 (v7 auto-generation)', () => {
    test('auto-generates v7 UUID when field omitted', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'auto-v7' },
      });

      expect(CerialUuid.is(result.autoV7)).toBe(true);
      expect(UUID_V7_REGEX.test(result.autoV7!.toString())).toBe(true);
    });

    test('v7 UUIDs are time-ordered', async () => {
      const r1 = await client.db.UuidDecorated.create({ data: { name: 'ord1' } });
      await new Promise((r) => setTimeout(r, 10));
      const r2 = await client.db.UuidDecorated.create({ data: { name: 'ord2' } });

      expect(r1.autoV7!.toString() < r2.autoV7!.toString()).toBe(true);
    });
  });

  describe('optional @uuid field', () => {
    test('auto-generates when omitted (optional + @uuid)', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'opt-auto' },
      });

      expect(CerialUuid.is(result.optAutoId)).toBe(true);
    });

    test('uses provided value when explicitly set', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'opt-explicit', optAutoId: SAMPLE_UUID },
      });

      expect(result.optAutoId!.toString()).toBe(SAMPLE_UUID);
    });
  });

  describe('all decorators on same model', () => {
    test('all three decorator fields auto-generate independently', async () => {
      const result = await client.db.UuidDecorated.create({
        data: { name: 'all-auto' },
      });

      expect(CerialUuid.is(result.autoId)).toBe(true);
      expect(CerialUuid.is(result.autoV4)).toBe(true);
      expect(CerialUuid.is(result.autoV7)).toBe(true);

      const ids = [result.autoId!.toString(), result.autoV4!.toString(), result.autoV7!.toString()];
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    test('findUnique reads back all auto-generated UUIDs', async () => {
      const created = await client.db.UuidDecorated.create({
        data: { name: 'roundtrip-dec' },
      });

      const found = await client.db.UuidDecorated.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(CerialUuid.is(found!.autoId)).toBe(true);
      expect(CerialUuid.is(found!.autoV4)).toBe(true);
      expect(CerialUuid.is(found!.autoV7)).toBe(true);
    });
  });

  describe('object with @uuid decorator', () => {
    test('auto-generates UUID for object field with @uuid (autoGenId)', async () => {
      const result = await client.db.UuidWithObject.create({
        data: {
          name: 'obj-decorator',
          meta: { label: 'auto-track', trackingId: SAMPLE_UUID },
        },
      });

      expect(CerialUuid.is(result.meta.autoGenId)).toBe(true);
      expect(UUID_REGEX.test(result.meta.autoGenId!.toString())).toBe(true);
    });
  });
});
