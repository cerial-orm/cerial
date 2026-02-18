import { describe, expect, test } from 'bun:test';
import { CerialUuid } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

const UUID_A = '550e8400-e29b-41d4-a716-446655440000';
const UUID_B = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('E2E UUID: Nesting (Object + Tuple)', () => {
  const { getClient } = setupDataTypeTests(tables.uuid);

  describe('UUID in object fields', () => {
    test('create with required UUID in object', async () => {
      const client = getClient();
      const result = await client.db.UuidWithObject.create({
        data: {
          name: 'nested-obj',
          meta: { label: 'tracking', trackingId: UUID_A },
        },
      });

      expect(result.meta.label).toBe('tracking');
      expect(CerialUuid.is(result.meta.trackingId)).toBe(true);
      expect(result.meta.trackingId.toString()).toBe(UUID_A);
    });

    test('create with auto-generated UUID in object (@uuid)', async () => {
      const client = getClient();
      const result = await client.db.UuidWithObject.create({
        data: {
          name: 'auto-obj',
          meta: { label: 'auto', trackingId: UUID_A },
        },
      });

      expect(CerialUuid.is(result.meta.autoGenId)).toBe(true);
    });

    test('create with optional UUID in object', async () => {
      const client = getClient();
      const result = await client.db.UuidWithObject.create({
        data: {
          name: 'opt-uuid-obj',
          meta: { label: 'has-opt', trackingId: UUID_A, optionalId: UUID_B },
        },
      });

      expect(CerialUuid.is(result.meta.optionalId)).toBe(true);
      expect(result.meta.optionalId!.toString()).toBe(UUID_B);
    });

    test('roundtrip object UUID through findUnique', async () => {
      const client = getClient();
      const created = await client.db.UuidWithObject.create({
        data: {
          name: 'roundtrip-obj',
          meta: { label: 'rt', trackingId: UUID_A, optionalId: UUID_B },
        },
      });

      const found = await client.db.UuidWithObject.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(found!.meta.trackingId.toString()).toBe(UUID_A);
      expect(found!.meta.optionalId!.toString()).toBe(UUID_B);
    });

    test('optional object field omitted returns undefined', async () => {
      const client = getClient();
      const result = await client.db.UuidWithObject.create({
        data: {
          name: 'no-opt-obj',
          meta: { label: 'base', trackingId: UUID_A },
        },
      });

      expect(result.optMeta).toBeUndefined();
    });
  });

  describe('UUID in tuple fields', () => {
    test('create with UUID tuple (array form)', async () => {
      const client = getClient();
      const result = await client.db.UuidWithTuple.create({
        data: {
          name: 'tuple-arr',
          pair: [UUID_A, UUID_B],
        },
      });

      expect(result.pair).toHaveLength(2);
      expect(CerialUuid.is(result.pair[0])).toBe(true);
      expect(CerialUuid.is(result.pair[1])).toBe(true);
      expect(result.pair[0]!.toString()).toBe(UUID_A);
      expect(result.pair[1]!.toString()).toBe(UUID_B);
    });

    test('create with UUID tuple (object form)', async () => {
      const client = getClient();
      const result = await client.db.UuidWithTuple.create({
        data: {
          name: 'tuple-obj',
          pair: { 0: UUID_A, 1: UUID_B },
        },
      });

      expect(result.pair).toHaveLength(2);
      expect(result.pair[0]!.toString()).toBe(UUID_A);
      expect(result.pair[1]!.toString()).toBe(UUID_B);
    });

    test('roundtrip tuple UUID through findUnique', async () => {
      const client = getClient();
      const created = await client.db.UuidWithTuple.create({
        data: {
          name: 'roundtrip-tuple',
          pair: [UUID_A, UUID_B],
        },
      });

      const found = await client.db.UuidWithTuple.findUnique({ where: { id: created.id } });

      expect(found).not.toBeNull();
      expect(CerialUuid.is(found!.pair[0])).toBe(true);
      expect(found!.pair[0]!.toString()).toBe(UUID_A);
      expect(found!.pair[1]!.toString()).toBe(UUID_B);
    });

    test('optional tuple field omitted returns undefined', async () => {
      const client = getClient();
      const result = await client.db.UuidWithTuple.create({
        data: {
          name: 'no-opt-tuple',
          pair: [UUID_A, UUID_B],
        },
      });

      expect(result.optPair).toBeUndefined();
    });
  });
});
