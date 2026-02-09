/**
 * Unit Tests: CerialId
 *
 * Tests for the CerialId class - a wrapper for SurrealDB record IDs.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId } from 'surrealdb';
import { CerialId, isCerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
  describe('construction', () => {
    test('from simple string "table:id"', () => {
      const id = new CerialId('user:abc123');
      expect(id.table).toBe('user');
      expect(id.id).toBe('abc123');
    });

    test('from string without colon (id only)', () => {
      const id = new CerialId('abc123');
      expect(id.table).toBeUndefined();
      expect(id.id).toBe('abc123');
    });

    test('from string with special chars in table (dash)', () => {
      const id = new CerialId('test-table:abc');
      expect(id.table).toBe('test-table');
      expect(id.id).toBe('abc');
    });

    test('from string with special chars in id (dash)', () => {
      const id = new CerialId('user:my-id');
      expect(id.table).toBe('user');
      expect(id.id).toBe('my-id');
    });

    test('from angle-bracket escaped string (from SurrealDB output)', () => {
      const id = new CerialId('⟨test-table⟩:abc');
      expect(id.table).toBe('test-table');
      expect(id.id).toBe('abc');
    });

    test('from both escaped string', () => {
      const id = new CerialId('⟨test-table⟩:⟨my-id⟩');
      expect(id.table).toBe('test-table');
      expect(id.id).toBe('my-id');
    });

    test('from RecordId', () => {
      const recordId = new RecordId('user', 'abc123');
      const id = new CerialId(recordId);
      expect(id.table).toBe('user');
      expect(id.id).toBe('abc123');
    });

    test('from StringRecordId', () => {
      const stringRecordId = new StringRecordId('user:abc123');
      const id = new CerialId(stringRecordId);
      expect(id.table).toBe('user');
      expect(id.id).toBe('abc123');
    });

    test('from another CerialId (clone)', () => {
      const original = new CerialId('user:abc123');
      const cloned = new CerialId(original);
      expect(cloned.table).toBe('user');
      expect(cloned.id).toBe('abc123');
      // Should be a different instance
      expect(cloned).not.toBe(original);
    });

    test('with table override', () => {
      const id = new CerialId('abc123', 'user');
      expect(id.table).toBe('user');
      expect(id.id).toBe('abc123');
    });

    test('handles UUID format id', () => {
      const id = new CerialId('user:550e8400-e29b-41d4-a716-446655440000');
      expect(id.table).toBe('user');
      expect(id.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    test('handles id with colons', () => {
      const recordId = new RecordId('user', 'id:with:colons');
      const id = CerialId.fromRecordId(recordId);
      expect(id.table).toBe('user');
      expect(id.id).toBe('id:with:colons');
    });
  });

  describe('static methods', () => {
    describe('is()', () => {
      test('returns true for CerialId instance', () => {
        const id = new CerialId('user:abc');
        expect(CerialId.is(id)).toBe(true);
      });

      test('returns false for RecordId', () => {
        const id = new RecordId('user', 'abc');
        expect(CerialId.is(id)).toBe(false);
      });

      test('returns false for string', () => {
        expect(CerialId.is('user:abc')).toBe(false);
      });

      test('returns false for null/undefined', () => {
        expect(CerialId.is(null)).toBe(false);
        expect(CerialId.is(undefined)).toBe(false);
      });
    });

    describe('from()', () => {
      test('creates from string', () => {
        const id = CerialId.from('user:abc');
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc');
      });

      test('creates from string with table override', () => {
        const id = CerialId.from('abc', 'user');
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc');
      });
    });

    describe('fromString()', () => {
      test('parses table:id format', () => {
        const id = CerialId.fromString('user:abc123');
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc123');
      });
    });

    describe('fromRecordId()', () => {
      test('extracts from RecordId', () => {
        const recordId = new RecordId('user', 'abc');
        const id = CerialId.fromRecordId(recordId);
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc');
      });
    });

    describe('parse()', () => {
      test('parses value without validation', () => {
        const id = CerialId.parse('user:abc');
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc');
      });

      test('validates table matches expected', () => {
        expect(() => CerialId.parse('other:abc', 'user')).toThrow('Table "other" does not match expected table "user"');
      });

      test('sets table if missing', () => {
        const id = CerialId.parse('abc123', 'user');
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc123');
      });

      test('passes when table matches', () => {
        const id = CerialId.parse('user:abc', 'user');
        expect(id.table).toBe('user');
        expect(id.id).toBe('abc');
      });
    });
  });

  describe('instance methods', () => {
    describe('toString()', () => {
      test('returns escaped format when table has special chars', () => {
        const id = new CerialId('test-table:abc');
        // RecordId escapes with ⟨⟩
        expect(id.toString()).toBe('⟨test-table⟩:abc');
      });

      test('returns simple format when no special chars', () => {
        const id = new CerialId('user:abc123');
        expect(id.toString()).toBe('user:abc123');
      });

      test('returns just id when no table', () => {
        const id = new CerialId('abc123');
        expect(id.toString()).toBe('abc123');
      });
    });

    describe('toJSON()', () => {
      test('returns same as toString()', () => {
        const id = new CerialId('user:abc');
        expect(id.toJSON()).toBe(id.toString());
      });

      test('works with JSON.stringify', () => {
        const id = new CerialId('user:abc');
        expect(JSON.stringify({ id })).toBe('{"id":"user:abc"}');
      });
    });

    describe('valueOf()', () => {
      test('returns same as toString()', () => {
        const id = new CerialId('user:abc');
        expect(id.valueOf()).toBe(id.toString());
      });

      test('enables == comparison with string', () => {
        const id = new CerialId('user:abc');
        // @ts-expect-error - Testing valueOf() enables == comparison with strings at runtime
        expect(id == 'user:abc').toBe(true);
      });
    });

    describe('equals()', () => {
      test('compares equal CerialIds', () => {
        const id1 = new CerialId('user:abc');
        const id2 = new CerialId('user:abc');
        expect(id1.equals(id2)).toBe(true);
      });

      test('compares different CerialIds', () => {
        const id1 = new CerialId('user:abc');
        const id2 = new CerialId('user:xyz');
        expect(id1.equals(id2)).toBe(false);
      });

      test('compares with RecordId', () => {
        const cerialId = new CerialId('user:abc');
        const recordId = new RecordId('user', 'abc');
        expect(cerialId.equals(recordId)).toBe(true);
      });

      test('compares with string', () => {
        const id = new CerialId('user:abc');
        expect(id.equals('user:abc')).toBe(true);
        expect(id.equals('user:xyz')).toBe(false);
      });

      test('compares escaped and unescaped formats', () => {
        const id1 = new CerialId('test-table:abc');
        const id2 = new CerialId('⟨test-table⟩:abc');
        expect(id1.equals(id2)).toBe(true);
      });

      test('returns false when table is undefined', () => {
        const id = new CerialId('abc');
        expect(id.equals('user:abc')).toBe(false);
      });
    });

    describe('clone()', () => {
      test('creates independent copy', () => {
        const original = new CerialId('user:abc');
        const cloned = original.clone();
        expect(cloned.table).toBe('user');
        expect(cloned.id).toBe('abc');
        expect(cloned).not.toBe(original);
      });
    });

    describe('withTable()', () => {
      test('creates new CerialId with different table', () => {
        const original = new CerialId('user:abc');
        const modified = original.withTable('other');
        expect(modified.table).toBe('other');
        expect(modified.id).toBe('abc');
        // Original unchanged
        expect(original.table).toBe('user');
      });
    });

    describe('withId()', () => {
      test('creates new CerialId with different id', () => {
        const original = new CerialId('user:abc');
        const modified = original.withId('xyz');
        expect(modified.table).toBe('user');
        expect(modified.id).toBe('xyz');
        // Original unchanged
        expect(original.id).toBe('abc');
      });
    });

    describe('toRecordId()', () => {
      test('creates RecordId when table is set', () => {
        const cerialId = new CerialId('user:abc');
        const recordId = cerialId.toRecordId();
        expect(recordId).toBeInstanceOf(RecordId);
        expect(recordId.table.name).toBe('user');
        expect(recordId.id).toBe('abc');
      });

      test('throws when table is undefined', () => {
        const cerialId = new CerialId('abc');
        expect(() => cerialId.toRecordId()).toThrow('Cannot create RecordId: table is undefined');
      });
    });
  });

  describe('getters', () => {
    describe('hasTable', () => {
      test('returns true when table is set', () => {
        const id = new CerialId('user:abc');
        expect(id.hasTable).toBe(true);
      });

      test('returns false when table is undefined', () => {
        const id = new CerialId('abc');
        expect(id.hasTable).toBe(false);
      });
    });

    describe('isComplete', () => {
      test('returns true when both table and id exist', () => {
        const id = new CerialId('user:abc');
        expect(id.isComplete).toBe(true);
      });

      test('returns false when table is missing', () => {
        const id = new CerialId('abc');
        expect(id.isComplete).toBe(false);
      });
    });
  });

  describe('isCerialId function', () => {
    test('returns true for CerialId', () => {
      expect(isCerialId(new CerialId('user:abc'))).toBe(true);
    });

    test('returns false for other types', () => {
      expect(isCerialId('string')).toBe(false);
      expect(isCerialId(new RecordId('user', 'abc'))).toBe(false);
      expect(isCerialId(null)).toBe(false);
    });
  });

  describe('edge cases - escaping', () => {
    test('handles table with dash', () => {
      const id = new CerialId('test-table:abc');
      expect(id.table).toBe('test-table');
      expect(id.id).toBe('abc');
      expect(id.toString()).toBe('⟨test-table⟩:abc');
    });

    test('handles id with dash', () => {
      const id = new CerialId('user:my-id');
      expect(id.id).toBe('my-id');
      expect(id.toString()).toBe('user:⟨my-id⟩');
    });

    test('handles both table and id with dashes', () => {
      const id = new CerialId('test-table:my-id');
      expect(id.toString()).toBe('⟨test-table⟩:⟨my-id⟩');
    });

    test('parses angle bracket escaped format', () => {
      const id = new CerialId('⟨test-table⟩:⟨my-id⟩');
      expect(id.table).toBe('test-table');
      expect(id.id).toBe('my-id');
    });

    test('equals compares normalized values', () => {
      const id1 = new CerialId('test-table:abc');
      const id2 = new CerialId('⟨test-table⟩:abc');
      expect(id1.equals(id2)).toBe(true);
    });
  });

  describe('roundtrip', () => {
    test('string -> CerialId -> toString -> CerialId -> equals original', () => {
      const inputs = ['user:abc123', 'test-table:my-id', 'user:550e8400-e29b-41d4-a716-446655440000'];

      for (const input of inputs) {
        const id1 = new CerialId(input);
        const str = id1.toString();
        const id2 = new CerialId(str);
        expect(id1.equals(id2)).toBe(true);
      }
    });

    test('RecordId -> CerialId -> toRecordId -> equals original', () => {
      const original = new RecordId('user', 'abc123');
      const cerialId = CerialId.fromRecordId(original);
      const roundtrip = cerialId.toRecordId();
      expect(roundtrip.equals(original)).toBe(true);
    });
  });
});
