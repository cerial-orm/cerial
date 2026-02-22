import { describe, expect, test } from 'bun:test';
import { parseFieldType } from '../../../src/parser/types/field-types';
import {
  getRecordFieldType,
  isRecordArray,
  isRecordType,
  parseRecordIdTypes,
} from '../../../src/parser/types/field-types/record-parser';
import { parseFieldDeclaration } from '../../../src/parser/types/model/field-declaration-parser';

describe('Record Type Parser', () => {
  describe('isRecordType', () => {
    test('should return true for plain Record', () => {
      expect(isRecordType('Record')).toBe(true);
    });

    test('should return true for Record[]', () => {
      expect(isRecordType('Record[]')).toBe(true);
    });

    test('should return true for Record(int)', () => {
      expect(isRecordType('Record(int)')).toBe(true);
    });

    test('should return true for Record(string)', () => {
      expect(isRecordType('Record(string)')).toBe(true);
    });

    test('should return true for Record(number)', () => {
      expect(isRecordType('Record(number)')).toBe(true);
    });

    test('should return true for Record(uuid)', () => {
      expect(isRecordType('Record(uuid)')).toBe(true);
    });

    test('should return true for Record(string, int)', () => {
      expect(isRecordType('Record(string, int)')).toBe(true);
    });

    test('should return true for Record(MyTuple)', () => {
      expect(isRecordType('Record(MyTuple)')).toBe(true);
    });

    test('should return true for Record(int)[]', () => {
      expect(isRecordType('Record(int)[]')).toBe(true);
    });

    test('should return true for Record(string, int)[]', () => {
      expect(isRecordType('Record(string, int)[]')).toBe(true);
    });

    test('should return false for non-Record types', () => {
      expect(isRecordType('String')).toBe(false);
      expect(isRecordType('Int')).toBe(false);
      expect(isRecordType('Relation')).toBe(false);
      expect(isRecordType('record')).toBe(false);
      expect(isRecordType('RECORD')).toBe(false);
    });

    test('should return false for malformed Record types', () => {
      expect(isRecordType('Record(')).toBe(false);
      expect(isRecordType('Record()')).toBe(false);
      expect(isRecordType('RecordX')).toBe(false);
      expect(isRecordType('Record(int')).toBe(false);
    });
  });

  describe('isRecordArray', () => {
    test('should return true for Record[]', () => {
      expect(isRecordArray('Record[]')).toBe(true);
    });

    test('should return true for Record(int)[]', () => {
      expect(isRecordArray('Record(int)[]')).toBe(true);
    });

    test('should return true for Record(string, int)[]', () => {
      expect(isRecordArray('Record(string, int)[]')).toBe(true);
    });

    test('should return false for non-array Record', () => {
      expect(isRecordArray('Record')).toBe(false);
      expect(isRecordArray('Record(int)')).toBe(false);
    });

    test('should return false for non-Record types', () => {
      expect(isRecordArray('String[]')).toBe(false);
      expect(isRecordArray('Int')).toBe(false);
    });
  });

  describe('getRecordFieldType', () => {
    test('should return record', () => {
      expect(getRecordFieldType()).toBe('record');
    });
  });

  describe('parseRecordIdTypes', () => {
    test('should return undefined for plain Record', () => {
      expect(parseRecordIdTypes('Record')).toBeUndefined();
    });

    test('should return undefined for Record[]', () => {
      expect(parseRecordIdTypes('Record[]')).toBeUndefined();
    });

    test('should return undefined for Record() with empty parens (regex rejects it)', () => {
      expect(parseRecordIdTypes('Record()')).toBeUndefined();
    });

    test('should parse single primitive type - int', () => {
      expect(parseRecordIdTypes('Record(int)')).toEqual(['int']);
    });

    test('should parse single primitive type - string', () => {
      expect(parseRecordIdTypes('Record(string)')).toEqual(['string']);
    });

    test('should parse single primitive type - number', () => {
      expect(parseRecordIdTypes('Record(number)')).toEqual(['number']);
    });

    test('should parse single primitive type - uuid', () => {
      expect(parseRecordIdTypes('Record(uuid)')).toEqual(['uuid']);
    });

    test('should parse union types - string, int', () => {
      expect(parseRecordIdTypes('Record(string, int)')).toEqual(['string', 'int']);
    });

    test('should parse union types - three types', () => {
      expect(parseRecordIdTypes('Record(string, int, uuid)')).toEqual(['string', 'int', 'uuid']);
    });

    test('should handle spaces around commas', () => {
      expect(parseRecordIdTypes('Record(string,int)')).toEqual(['string', 'int']);
      expect(parseRecordIdTypes('Record(string , int)')).toEqual(['string', 'int']);
      expect(parseRecordIdTypes('Record( string , int )')).toEqual(['string', 'int']);
    });

    test('should parse name references (tuple/object names)', () => {
      expect(parseRecordIdTypes('Record(MyTuple)')).toEqual(['MyTuple']);
      expect(parseRecordIdTypes('Record(MyObject)')).toEqual(['MyObject']);
    });

    test('should parse typed array Record(int)[]', () => {
      expect(parseRecordIdTypes('Record(int)[]')).toEqual(['int']);
    });

    test('should parse typed union array Record(string, int)[]', () => {
      expect(parseRecordIdTypes('Record(string, int)[]')).toEqual(['string', 'int']);
    });

    test('should accept tupleNames and objectNames params without error', () => {
      const tupleNames = new Set(['MyTuple']);
      const objectNames = new Set(['MyObject']);
      expect(parseRecordIdTypes('Record(MyTuple)', tupleNames, objectNames)).toEqual(['MyTuple']);
      expect(parseRecordIdTypes('Record(int)', tupleNames, objectNames)).toEqual(['int']);
    });
  });

  describe('parseFieldType integration', () => {
    test('should parse plain Record to record', () => {
      expect(parseFieldType('Record')).toBe('record');
    });

    test('should parse Record[] to record', () => {
      expect(parseFieldType('Record[]')).toBe('record');
    });

    test('should parse Record(int) to record', () => {
      expect(parseFieldType('Record(int)')).toBe('record');
    });

    test('should parse Record(string, int) to record', () => {
      expect(parseFieldType('Record(string, int)')).toBe('record');
    });

    test('should parse Record(MyTuple) to record', () => {
      expect(parseFieldType('Record(MyTuple)')).toBe('record');
    });

    test('should parse Record(int)[] to record', () => {
      expect(parseFieldType('Record(int)[]')).toBe('record');
    });

    test('should not conflict with other types', () => {
      expect(parseFieldType('String')).toBe('string');
      expect(parseFieldType('Int')).toBe('int');
      expect(parseFieldType('Relation')).toBe('relation');
    });
  });

  describe('parseFieldDeclaration integration', () => {
    test('plain Record backward compat - no recordIdTypes', () => {
      const result = parseFieldDeclaration('profileId Record', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('profileId');
      expect(result.field!.type).toBe('record');
      expect(result.field!.isOptional).toBe(false);
      expect(result.field!.isArray).toBeUndefined();
      expect(result.field!.recordIdTypes).toBeUndefined();
    });

    test('plain Record[] backward compat - no recordIdTypes', () => {
      const result = parseFieldDeclaration('postIds Record[]', 1);
      expect(result.error).toBeNull();
      expect(result.field).not.toBeNull();
      expect(result.field!.name).toBe('postIds');
      expect(result.field!.type).toBe('record');
      expect(result.field!.isArray).toBe(true);
      expect(result.field!.recordIdTypes).toBeUndefined();
    });

    test('optional plain Record backward compat', () => {
      const result = parseFieldDeclaration('profileId Record?', 1);
      expect(result.error).toBeNull();
      expect(result.field!.name).toBe('profileId');
      expect(result.field!.type).toBe('record');
      expect(result.field!.isOptional).toBe(true);
      expect(result.field!.recordIdTypes).toBeUndefined();
    });

    test('Record(int) - single typed ID', () => {
      const result = parseFieldDeclaration('profileId Record(int)', 1);
      expect(result.error).toBeNull();
      expect(result.field!.name).toBe('profileId');
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['int']);
    });

    test('Record(string) - string typed ID', () => {
      const result = parseFieldDeclaration('userId Record(string)', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['string']);
    });

    test('Record(uuid) - uuid typed ID', () => {
      const result = parseFieldDeclaration('userId Record(uuid)', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['uuid']);
    });

    test('Record(number) - number typed ID', () => {
      const result = parseFieldDeclaration('userId Record(number)', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['number']);
    });

    test('Record(string, int) - union typed ID', () => {
      const result = parseFieldDeclaration('userId Record(string, int)', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['string', 'int']);
    });

    test('Record(MyTuple) - tuple name reference', () => {
      const tupleNames = new Set(['MyTuple']);
      const result = parseFieldDeclaration('userId Record(MyTuple)', 1, undefined, tupleNames);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['MyTuple']);
    });

    test('Record(MyObject) - object name reference', () => {
      const objectNames = new Set(['MyObject']);
      const result = parseFieldDeclaration('userId Record(MyObject)', 1, objectNames);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['MyObject']);
    });

    test('Record(int)[] - typed array', () => {
      const result = parseFieldDeclaration('postIds Record(int)[]', 1);
      expect(result.error).toBeNull();
      expect(result.field!.name).toBe('postIds');
      expect(result.field!.type).toBe('record');
      expect(result.field!.isArray).toBe(true);
      expect(result.field!.recordIdTypes).toEqual(['int']);
    });

    test('Record(string, int)[] - typed union array', () => {
      const result = parseFieldDeclaration('postIds Record(string, int)[]', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.isArray).toBe(true);
      expect(result.field!.recordIdTypes).toEqual(['string', 'int']);
    });

    test('Record(int)? - typed optional', () => {
      const result = parseFieldDeclaration('profileId Record(int)?', 1);
      expect(result.error).toBeNull();
      expect(result.field!.name).toBe('profileId');
      expect(result.field!.type).toBe('record');
      expect(result.field!.isOptional).toBe(true);
      expect(result.field!.recordIdTypes).toEqual(['int']);
    });

    test('Record(int) with @id decorator', () => {
      const result = parseFieldDeclaration('id Record(int) @id', 1);
      expect(result.error).toBeNull();
      expect(result.field!.name).toBe('id');
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['int']);
      expect(result.field!.decorators).toHaveLength(1);
      expect(result.field!.decorators[0]!.type).toBe('id');
    });

    test('Record(string) with @unique decorator', () => {
      const result = parseFieldDeclaration('externalId Record(string) @unique', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toEqual(['string']);
      expect(result.field!.decorators).toHaveLength(1);
      expect(result.field!.decorators[0]!.type).toBe('unique');
    });

    test('Record(int)? with @nullable decorator', () => {
      const result = parseFieldDeclaration('profileId Record(int)? @nullable', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.isOptional).toBe(true);
      expect(result.field!.isNullable).toBe(true);
      expect(result.field!.recordIdTypes).toEqual(['int']);
    });

    test('Record with @id still works (backward compat with decorators)', () => {
      const result = parseFieldDeclaration('id Record @id', 1);
      expect(result.error).toBeNull();
      expect(result.field!.type).toBe('record');
      expect(result.field!.recordIdTypes).toBeUndefined();
      expect(result.field!.decorators[0]!.type).toBe('id');
    });
  });
});
