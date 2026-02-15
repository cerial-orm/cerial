import { describe, expect, test } from 'bun:test';
import { Uuid } from 'surrealdb';
import { CerialUuid } from '../../../src/utils/cerial-uuid';
import { transformValue } from '../../../src/query/transformers/data-transformer';
import { mapFieldValue } from '../../../src/query/mappers/result-mapper';
import { validateFieldType } from '../../../src/utils/validation-utils';

const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('UUID Transform Pipeline', () => {
  describe('transformValue for uuid', () => {
    test('should convert CerialUuid to SDK Uuid', () => {
      const input = new CerialUuid(SAMPLE_UUID);
      const result = transformValue(input, 'uuid');
      expect(result).toBeInstanceOf(Uuid);
      expect(result!.toString()).toBe(SAMPLE_UUID);
    });

    test('should pass through SDK Uuid', () => {
      const input = new Uuid(SAMPLE_UUID);
      const result = transformValue(input, 'uuid');
      expect(result).toBeInstanceOf(Uuid);
      expect(result!.toString()).toBe(SAMPLE_UUID);
    });

    test('should convert string to SDK Uuid', () => {
      const result = transformValue(SAMPLE_UUID, 'uuid');
      expect(result).toBeInstanceOf(Uuid);
      expect(result!.toString()).toBe(SAMPLE_UUID);
    });

    test('should pass through null', () => {
      expect(transformValue(null, 'uuid')).toBe(null);
    });

    test('should pass through undefined', () => {
      expect(transformValue(undefined, 'uuid')).toBe(undefined);
    });
  });

  describe('mapFieldValue for uuid', () => {
    test('should convert SDK Uuid to CerialUuid', () => {
      const input = new Uuid(SAMPLE_UUID);
      const result = mapFieldValue(input, 'uuid');
      expect(result).toBeInstanceOf(CerialUuid);
      expect((result as CerialUuid).value).toBe(SAMPLE_UUID);
    });

    test('should convert string to CerialUuid', () => {
      const result = mapFieldValue(SAMPLE_UUID, 'uuid');
      expect(result).toBeInstanceOf(CerialUuid);
      expect((result as CerialUuid).value).toBe(SAMPLE_UUID);
    });

    test('should pass through null', () => {
      expect(mapFieldValue(null, 'uuid')).toBe(null);
    });

    test('should pass through undefined', () => {
      expect(mapFieldValue(undefined, 'uuid')).toBe(undefined);
    });
  });

  describe('validateFieldType for uuid', () => {
    test('should accept CerialUuid', () => {
      expect(validateFieldType(new CerialUuid(SAMPLE_UUID), 'uuid')).toBe(true);
    });

    test('should accept SDK Uuid', () => {
      expect(validateFieldType(new Uuid(SAMPLE_UUID), 'uuid')).toBe(true);
    });

    test('should accept valid UUID string', () => {
      expect(validateFieldType(SAMPLE_UUID, 'uuid')).toBe(true);
    });

    test('should accept uppercase UUID string', () => {
      expect(validateFieldType(SAMPLE_UUID.toUpperCase(), 'uuid')).toBe(true);
    });

    test('should reject invalid string', () => {
      expect(validateFieldType('not-a-uuid', 'uuid')).toBe(false);
    });

    test('should reject number', () => {
      expect(validateFieldType(123, 'uuid')).toBe(false);
    });

    test('should reject boolean', () => {
      expect(validateFieldType(true, 'uuid')).toBe(false);
    });
  });

  describe('CerialUuid class', () => {
    test('should create from string', () => {
      const uuid = new CerialUuid(SAMPLE_UUID);
      expect(uuid.value).toBe(SAMPLE_UUID);
    });

    test('should create from SDK Uuid', () => {
      const native = new Uuid(SAMPLE_UUID);
      const uuid = CerialUuid.fromNative(native);
      expect(uuid.value).toBe(SAMPLE_UUID);
    });

    test('should clone correctly', () => {
      const uuid = new CerialUuid(SAMPLE_UUID);
      const clone = uuid.clone();
      expect(clone.value).toBe(SAMPLE_UUID);
      expect(clone).not.toBe(uuid);
    });

    test('should convert to native', () => {
      const uuid = new CerialUuid(SAMPLE_UUID);
      const native = uuid.toNative();
      expect(native).toBeInstanceOf(Uuid);
      expect(native.toString()).toBe(SAMPLE_UUID);
    });

    test('should serialize to string', () => {
      const uuid = new CerialUuid(SAMPLE_UUID);
      expect(uuid.toString()).toBe(SAMPLE_UUID);
      expect(uuid.toJSON()).toBe(SAMPLE_UUID);
      expect(uuid.valueOf()).toBe(SAMPLE_UUID);
    });

    test('should compare equality', () => {
      const a = new CerialUuid(SAMPLE_UUID);
      const b = new CerialUuid(SAMPLE_UUID);
      expect(a.equals(b)).toBe(true);
      expect(a.equals(SAMPLE_UUID)).toBe(true);
      expect(a.equals(new Uuid(SAMPLE_UUID))).toBe(true);
    });

    test('should detect inequality', () => {
      const a = new CerialUuid(SAMPLE_UUID);
      const b = new CerialUuid('00000000-0000-0000-0000-000000000000');
      expect(a.equals(b)).toBe(false);
    });

    test('should normalize to lowercase', () => {
      const uuid = new CerialUuid(SAMPLE_UUID.toUpperCase());
      expect(uuid.value).toBe(SAMPLE_UUID);
    });

    test('should reject invalid UUID string', () => {
      expect(() => new CerialUuid('not-valid')).toThrow('Invalid UUID string');
    });

    test('static is() should detect CerialUuid', () => {
      expect(CerialUuid.is(new CerialUuid(SAMPLE_UUID))).toBe(true);
      expect(CerialUuid.is('string')).toBe(false);
      expect(CerialUuid.is(null)).toBe(false);
    });
  });
});
