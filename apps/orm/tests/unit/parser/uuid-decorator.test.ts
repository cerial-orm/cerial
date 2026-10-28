import { describe, expect, test } from 'bun:test';
import { isDecoratorToken } from './registry/helpers';
import {
  parseUuid4Decorator,
  parseUuid7Decorator,
  parseUuidDecorator,
} from '../../../src/parser/types/field-decorators/uuid-decorator-parser';

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 9 },
};

describe('UUID Decorator Parsers', () => {
  describe('matchDecoratorToken @uuid', () => {
    test('should return true for @uuid', () => {
      expect(isDecoratorToken('@uuid', '@uuid')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@uuid', '@uuid4')).toBe(false);
      expect(isDecoratorToken('@uuid', '@uuid7')).toBe(false);
      expect(isDecoratorToken('@uuid', '@id')).toBe(false);
      expect(isDecoratorToken('@uuid', '@default')).toBe(false);
    });

    test('should return false for invalid format', () => {
      expect(isDecoratorToken('@uuid', 'uuid')).toBe(false);
      expect(isDecoratorToken('@uuid', '@UUID')).toBe(false);
    });
  });

  describe('matchDecoratorToken @uuid4', () => {
    test('should return true for @uuid4', () => {
      expect(isDecoratorToken('@uuid4', '@uuid4')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@uuid4', '@uuid')).toBe(false);
      expect(isDecoratorToken('@uuid4', '@uuid7')).toBe(false);
    });
  });

  describe('matchDecoratorToken @uuid7', () => {
    test('should return true for @uuid7', () => {
      expect(isDecoratorToken('@uuid7', '@uuid7')).toBe(true);
    });

    test('should return false for other decorators', () => {
      expect(isDecoratorToken('@uuid7', '@uuid')).toBe(false);
      expect(isDecoratorToken('@uuid7', '@uuid4')).toBe(false);
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
