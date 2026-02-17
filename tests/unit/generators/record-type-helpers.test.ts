import { describe, it, expect } from 'bun:test';
import {
  getRecordOutputType,
  getRecordInputType,
  getIdCreateInputType,
  isIdOptionalInCreate,
} from '../../../src/generators/types/record-type-helpers';
import type { FieldMetadata, TupleRegistry, ObjectRegistry } from '../../../src/types';

/** Helper to create a minimal FieldMetadata for record fields */
function makeField(overrides: Partial<FieldMetadata> = {}): FieldMetadata {
  return {
    name: 'testField',
    type: 'record',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

describe('record-type-helpers', () => {
  // ─── getRecordOutputType ───────────────────────────────────────────

  describe('getRecordOutputType', () => {
    it('should return broad CerialId for plain Record (no recordIdTypes)', () => {
      const field = makeField();

      expect(getRecordOutputType(field)).toBe('CerialId');
    });

    it('should return broad CerialId for empty recordIdTypes', () => {
      const field = makeField({ recordIdTypes: [] });

      expect(getRecordOutputType(field)).toBe('CerialId');
    });

    it('should return CerialId<number> for Record(int)', () => {
      const field = makeField({ recordIdTypes: ['int'] });

      expect(getRecordOutputType(field)).toBe('CerialId<number>');
    });

    it('should return CerialId<number> for Record(float)', () => {
      const field = makeField({ recordIdTypes: ['float'] });

      expect(getRecordOutputType(field)).toBe('CerialId<number>');
    });

    it('should return CerialId<number> for Record(number)', () => {
      const field = makeField({ recordIdTypes: ['number'] });

      expect(getRecordOutputType(field)).toBe('CerialId<number>');
    });

    it('should return CerialId<string> for Record(string)', () => {
      const field = makeField({ recordIdTypes: ['string'] });

      expect(getRecordOutputType(field)).toBe('CerialId<string>');
    });

    it('should return CerialId<string> for Record(uuid)', () => {
      const field = makeField({ recordIdTypes: ['uuid'] });

      expect(getRecordOutputType(field)).toBe('CerialId<string>');
    });

    it('should return CerialId<string | number> for Record(string, int)', () => {
      const field = makeField({ recordIdTypes: ['string', 'int'] });

      expect(getRecordOutputType(field)).toBe('CerialId<string | number>');
    });

    it('should return CerialId<number | string> for Record(int, string)', () => {
      const field = makeField({ recordIdTypes: ['int', 'string'] });

      expect(getRecordOutputType(field)).toBe('CerialId<number | string>');
    });

    it('should return CerialId<number | number> for Record(int, float) (no dedup)', () => {
      const field = makeField({ recordIdTypes: ['int', 'float'] });

      expect(getRecordOutputType(field)).toBe('CerialId<number | number>');
    });

    it('should return CerialId<string | string> for Record(string, uuid) (no dedup)', () => {
      const field = makeField({ recordIdTypes: ['string', 'uuid'] });

      expect(getRecordOutputType(field)).toBe('CerialId<string | string>');
    });

    it('should handle tuple reference with registry', () => {
      const tupleRegistry: TupleRegistry = {
        Coordinate: {
          name: 'Coordinate',
          elements: [
            { index: 0, type: 'float', isOptional: false },
            { index: 1, type: 'float', isOptional: false },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['Coordinate'] });

      expect(getRecordOutputType(field, tupleRegistry)).toBe('CerialId<[number, number]>');
    });

    it('should handle object reference with registry', () => {
      const objectRegistry: ObjectRegistry = {
        CompoundKey: {
          name: 'CompoundKey',
          fields: [
            { name: 'service', type: 'string', isId: false, isUnique: false, isRequired: true },
            { name: 'ts', type: 'int', isId: false, isUnique: false, isRequired: true },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['CompoundKey'] });

      expect(getRecordOutputType(field, undefined, objectRegistry)).toBe('CerialId<{ service: string; ts: number }>');
    });

    it('should handle object with optional field', () => {
      const objectRegistry: ObjectRegistry = {
        OptKey: {
          name: 'OptKey',
          fields: [
            { name: 'a', type: 'string', isId: false, isUnique: false, isRequired: true },
            { name: 'b', type: 'int', isId: false, isUnique: false, isRequired: false },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['OptKey'] });

      expect(getRecordOutputType(field, undefined, objectRegistry)).toBe('CerialId<{ a: string; b?: number }>');
    });

    it('should handle mixed primitive and tuple in union', () => {
      const tupleRegistry: TupleRegistry = {
        Pair: {
          name: 'Pair',
          elements: [
            { index: 0, type: 'int', isOptional: false },
            { index: 1, type: 'int', isOptional: false },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['string', 'Pair'] });

      expect(getRecordOutputType(field, tupleRegistry)).toBe('CerialId<string | [number, number]>');
    });

    it('should handle nested tuple in tuple', () => {
      const tupleRegistry: TupleRegistry = {
        Inner: {
          name: 'Inner',
          elements: [
            { index: 0, type: 'int', isOptional: false },
            { index: 1, type: 'int', isOptional: false },
          ],
        },
        Outer: {
          name: 'Outer',
          elements: [
            { index: 0, type: 'string', isOptional: false },
            {
              index: 1,
              type: 'tuple',
              isOptional: false,
              tupleInfo: {
                tupleName: 'Inner',
                elements: [
                  { index: 0, type: 'int', isOptional: false },
                  { index: 1, type: 'int', isOptional: false },
                ],
              },
            },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['Outer'] });

      expect(getRecordOutputType(field, tupleRegistry)).toBe('CerialId<[string, [number, number]]>');
    });

    it('should handle object in tuple', () => {
      const objectRegistry: ObjectRegistry = {
        Point: {
          name: 'Point',
          fields: [
            { name: 'x', type: 'float', isId: false, isUnique: false, isRequired: true },
            { name: 'y', type: 'float', isId: false, isUnique: false, isRequired: true },
          ],
        },
      };
      const tupleRegistry: TupleRegistry = {
        Located: {
          name: 'Located',
          elements: [
            { index: 0, type: 'string', isOptional: false },
            {
              index: 1,
              type: 'object',
              isOptional: false,
              objectInfo: {
                objectName: 'Point',
                fields: [
                  { name: 'x', type: 'float', isId: false, isUnique: false, isRequired: true },
                  { name: 'y', type: 'float', isId: false, isUnique: false, isRequired: true },
                ],
              },
            },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['Located'] });

      expect(getRecordOutputType(field, tupleRegistry, objectRegistry)).toBe(
        'CerialId<[string, { x: number; y: number }]>',
      );
    });

    it('should fall back to raw name for unknown type without registries', () => {
      const field = makeField({ recordIdTypes: ['UnknownType'] });

      expect(getRecordOutputType(field)).toBe('CerialId<UnknownType>');
    });
  });

  // ─── getRecordInputType ────────────────────────────────────────────

  describe('getRecordInputType', () => {
    it('should return broad RecordIdInput for plain Record', () => {
      const field = makeField();

      expect(getRecordInputType(field)).toBe('RecordIdInput');
    });

    it('should return broad RecordIdInput for empty recordIdTypes', () => {
      const field = makeField({ recordIdTypes: [] });

      expect(getRecordInputType(field)).toBe('RecordIdInput');
    });

    it('should return RecordIdInput<number> for Record(int)', () => {
      const field = makeField({ recordIdTypes: ['int'] });

      expect(getRecordInputType(field)).toBe('RecordIdInput<number>');
    });

    it('should return RecordIdInput<string> for Record(string)', () => {
      const field = makeField({ recordIdTypes: ['string'] });

      expect(getRecordInputType(field)).toBe('RecordIdInput<string>');
    });

    it('should return RecordIdInput<string> for Record(uuid)', () => {
      const field = makeField({ recordIdTypes: ['uuid'] });

      expect(getRecordInputType(field)).toBe('RecordIdInput<string>');
    });

    it('should return RecordIdInput<string | number> for Record(string, int)', () => {
      const field = makeField({ recordIdTypes: ['string', 'int'] });

      expect(getRecordInputType(field)).toBe('RecordIdInput<string | number>');
    });

    it('should handle tuple reference', () => {
      const tupleRegistry: TupleRegistry = {
        Coord: {
          name: 'Coord',
          elements: [
            { index: 0, type: 'float', isOptional: false },
            { index: 1, type: 'float', isOptional: false },
          ],
        },
      };
      const field = makeField({ recordIdTypes: ['Coord'] });

      expect(getRecordInputType(field, tupleRegistry)).toBe('RecordIdInput<[number, number]>');
    });

    it('should handle object reference', () => {
      const objectRegistry: ObjectRegistry = {
        Key: {
          name: 'Key',
          fields: [{ name: 'ns', type: 'string', isId: false, isUnique: false, isRequired: true }],
        },
      };
      const field = makeField({ recordIdTypes: ['Key'] });

      expect(getRecordInputType(field, undefined, objectRegistry)).toBe('RecordIdInput<{ ns: string }>');
    });
  });

  // ─── getIdCreateInputType ──────────────────────────────────────────

  describe('getIdCreateInputType', () => {
    it('should return string for plain Record @id', () => {
      const field = makeField({ isId: true });

      expect(getIdCreateInputType(field)).toBe('string');
    });

    it('should return string for empty recordIdTypes', () => {
      const field = makeField({ isId: true, recordIdTypes: [] });

      expect(getIdCreateInputType(field)).toBe('string');
    });

    it('should return number for Record(int) @id', () => {
      const field = makeField({ isId: true, recordIdTypes: ['int'] });

      expect(getIdCreateInputType(field)).toBe('number');
    });

    it('should return number for Record(float) @id', () => {
      const field = makeField({ isId: true, recordIdTypes: ['float'] });

      expect(getIdCreateInputType(field)).toBe('number');
    });

    it('should return string for Record(string) @id', () => {
      const field = makeField({ isId: true, recordIdTypes: ['string'] });

      expect(getIdCreateInputType(field)).toBe('string');
    });

    it('should return string for Record(uuid) @id', () => {
      const field = makeField({ isId: true, recordIdTypes: ['uuid'] });

      expect(getIdCreateInputType(field)).toBe('string');
    });

    it('should return string | number for Record(string, int) @id', () => {
      const field = makeField({ isId: true, recordIdTypes: ['string', 'int'] });

      expect(getIdCreateInputType(field)).toBe('string | number');
    });

    it('should return tuple shape for Record(TupleName) @id', () => {
      const tupleRegistry: TupleRegistry = {
        Coord: {
          name: 'Coord',
          elements: [
            { index: 0, type: 'float', isOptional: false },
            { index: 1, type: 'float', isOptional: false },
          ],
        },
      };
      const field = makeField({ isId: true, recordIdTypes: ['Coord'] });

      expect(getIdCreateInputType(field, tupleRegistry)).toBe('[number, number]');
    });

    it('should return object shape for Record(ObjectName) @id', () => {
      const objectRegistry: ObjectRegistry = {
        CompoundKey: {
          name: 'CompoundKey',
          fields: [
            { name: 'service', type: 'string', isId: false, isUnique: false, isRequired: true },
            { name: 'ts', type: 'int', isId: false, isUnique: false, isRequired: true },
          ],
        },
      };
      const field = makeField({ isId: true, recordIdTypes: ['CompoundKey'] });

      expect(getIdCreateInputType(field, undefined, objectRegistry)).toBe('{ service: string; ts: number }');
    });

    it('should return union for mixed primitive and tuple', () => {
      const tupleRegistry: TupleRegistry = {
        Pair: {
          name: 'Pair',
          elements: [
            { index: 0, type: 'int', isOptional: false },
            { index: 1, type: 'int', isOptional: false },
          ],
        },
      };
      const field = makeField({ isId: true, recordIdTypes: ['int', 'Pair'] });

      expect(getIdCreateInputType(field, tupleRegistry)).toBe('number | [number, number]');
    });
  });

  // ─── isIdOptionalInCreate ──────────────────────────────────────────

  describe('isIdOptionalInCreate', () => {
    it('should return true for undefined recordIdTypes (plain Record @id)', () => {
      expect(isIdOptionalInCreate(undefined)).toBe(true);
    });

    it('should return true for empty recordIdTypes', () => {
      expect(isIdOptionalInCreate([])).toBe(true);
    });

    it('should return true when string is in the union', () => {
      expect(isIdOptionalInCreate(['string'])).toBe(true);
    });

    it('should return true when string is in a multi-type union', () => {
      expect(isIdOptionalInCreate(['string', 'int'])).toBe(true);
    });

    it('should return true when string is not first in union', () => {
      expect(isIdOptionalInCreate(['int', 'string'])).toBe(true);
    });

    it('should return true for uuid alone', () => {
      expect(isIdOptionalInCreate(['uuid'])).toBe(true);
    });

    it('should return false for int alone', () => {
      expect(isIdOptionalInCreate(['int'])).toBe(false);
    });

    it('should return false for float alone', () => {
      expect(isIdOptionalInCreate(['float'])).toBe(false);
    });

    it('should return false for number alone', () => {
      expect(isIdOptionalInCreate(['number'])).toBe(false);
    });

    it('should return false for tuple name alone', () => {
      expect(isIdOptionalInCreate(['Coordinate'])).toBe(false);
    });

    it('should return false for object name alone', () => {
      expect(isIdOptionalInCreate(['CompoundKey'])).toBe(false);
    });

    it('should return false for int + float (no string, no uuid)', () => {
      expect(isIdOptionalInCreate(['int', 'float'])).toBe(false);
    });

    it('should return false for uuid + int (uuid not alone)', () => {
      expect(isIdOptionalInCreate(['uuid', 'int'])).toBe(false);
    });

    it('should return false for tuple + object (no string)', () => {
      expect(isIdOptionalInCreate(['Coordinate', 'CompoundKey'])).toBe(false);
    });
  });
});
