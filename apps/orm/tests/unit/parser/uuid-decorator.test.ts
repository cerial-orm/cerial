import { describe, expect, test } from 'bun:test';
import {
  isUuid4Decorator,
  isUuid7Decorator,
  isUuidDecorator,
  parseUuid4Decorator,
  parseUuid7Decorator,
  parseUuidDecorator,
} from '../../../src/parser/types/field-decorators/uuid-decorator-parser';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

describe('UUID Decorator Parsers', () => {
  describe('isUuidDecorator', () => {
    test('should return true for @uuid', () => {
      expect(isUuidDecorator('@uuid')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isUuidDecorator('@uuid4')).toBe(false);
      expect(isUuidDecorator('@uuid7')).toBe(false);
      expect(isUuidDecorator('@id')).toBe(false);
      expect(isUuidDecorator('@default')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isUuidDecorator('uuid')).toBe(false);
      expect(isUuidDecorator('@UUID')).toBe(false);
    });
  });

  describe('isUuid4Decorator', () => {
    test('should return true for @uuid4', () => {
      expect(isUuid4Decorator('@uuid4')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isUuid4Decorator('@uuid')).toBe(false);
      expect(isUuid4Decorator('@uuid7')).toBe(false);
    });
  });

  describe('isUuid7Decorator', () => {
    test('should return true for @uuid7', () => {
      expect(isUuid7Decorator('@uuid7')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isUuid7Decorator('@uuid')).toBe(false);
      expect(isUuid7Decorator('@uuid4')).toBe(false);
    });
  });

  describe('parseUuidDecorator', () => {
    test('should produce ASTDecorator with type uuid', () => {
      const result = parseUuidDecorator('@uuid', range);
      expect(result.type).toBe('uuid');
      expect(result.range).toBe(range);
    });
  });

  describe('parseUuid4Decorator', () => {
    test('should produce ASTDecorator with type uuid4', () => {
      const result = parseUuid4Decorator('@uuid4', range);
      expect(result.type).toBe('uuid4');
      expect(result.range).toBe(range);
    });
  });

  describe('parseUuid7Decorator', () => {
    test('should produce ASTDecorator with type uuid7', () => {
      const result = parseUuid7Decorator('@uuid7', range);
      expect(result.type).toBe('uuid7');
      expect(result.range).toBe(range);
    });
  });
});
