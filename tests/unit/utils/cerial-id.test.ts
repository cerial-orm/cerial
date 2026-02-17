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

  describe('typed ID preservation', () => {
    describe('number IDs', () => {
      test('RecordId with number → CerialId preserves number .id', () => {
        const original = new RecordId('user', 42);
        const cid = CerialId.fromRecordId(original);
        expect(cid.table).toBe('user');
        expect(cid.id).toBe(42);
        expect(typeof cid.id).toBe('number');
      });

      test('number round-trip: RecordId → CerialId → toRecordId → equals', () => {
        const original = new RecordId('user', 42);
        const cid = CerialId.fromRecordId(original);
        const roundtrip = cid.toRecordId();
        expect(roundtrip.equals(original)).toBe(true);
      });

      test('direct number input: new CerialId(42)', () => {
        const cid = new CerialId(42);
        expect(cid.id).toBe(42);
        expect(typeof cid.id).toBe('number');
        expect(cid.table).toBeUndefined();
      });

      test('number with table override', () => {
        const cid = new CerialId(42, 'user');
        expect(cid.id).toBe(42);
        expect(cid.table).toBe('user');
      });

      test('toString with number id and table', () => {
        const original = new RecordId('user', 42);
        const cid = CerialId.fromRecordId(original);
        expect(cid.toString()).toBe(original.toString());
      });

      test('toString with number id and no table', () => {
        const cid = new CerialId(42);
        expect(cid.toString()).toBe('42');
      });
    });

    describe('array IDs', () => {
      test('RecordId with array → CerialId preserves array .id', () => {
        const original = new RecordId('weather', ['London', 42]);
        const cid = CerialId.fromRecordId(original);
        expect(cid.table).toBe('weather');
        expect(Array.isArray(cid.id)).toBe(true);
        expect(cid.id).toEqual(['London', 42]);
      });

      test('array round-trip: RecordId → CerialId → toRecordId → equals', () => {
        const original = new RecordId('weather', ['London', 42]);
        const cid = CerialId.fromRecordId(original);
        const roundtrip = cid.toRecordId();
        expect(roundtrip.equals(original)).toBe(true);
      });

      test('direct array input', () => {
        const cid = new CerialId(['London', 42]);
        expect(cid.id).toEqual(['London', 42]);
        expect(cid.table).toBeUndefined();
      });
    });

    describe('object IDs', () => {
      test('RecordId with object → CerialId preserves object .id', () => {
        const original = new RecordId('metric', { service: 'api', ts: 123 });
        const cid = CerialId.fromRecordId(original);
        expect(cid.table).toBe('metric');
        expect(typeof cid.id).toBe('object');
        expect(cid.id).toEqual({ service: 'api', ts: 123 });
      });

      test('object round-trip: RecordId → CerialId → toRecordId → equals', () => {
        const original = new RecordId('metric', { service: 'api', ts: 123 });
        const cid = CerialId.fromRecordId(original);
        const roundtrip = cid.toRecordId();
        expect(roundtrip.equals(original)).toBe(true);
      });

      test('direct object input', () => {
        const cid = new CerialId({ service: 'api', ts: 123 });
        expect(cid.id).toEqual({ service: 'api', ts: 123 });
        expect(cid.table).toBeUndefined();
      });
    });

    describe('bigint IDs', () => {
      test('RecordId with bigint → CerialId preserves bigint .id', () => {
        const original = new RecordId('counter', 9007199254740993n);
        const cid = CerialId.fromRecordId(original);
        expect(cid.table).toBe('counter');
        expect(cid.id).toBe(9007199254740993n);
        expect(typeof cid.id).toBe('bigint');
      });

      test('bigint round-trip: RecordId → CerialId → toRecordId → equals', () => {
        const original = new RecordId('counter', 9007199254740993n);
        const cid = CerialId.fromRecordId(original);
        const roundtrip = cid.toRecordId();
        expect(roundtrip.equals(original)).toBe(true);
      });

      test('direct bigint input', () => {
        const cid = new CerialId(9007199254740993n);
        expect(cid.id).toBe(9007199254740993n);
        expect(typeof cid.id).toBe('bigint');
        expect(cid.table).toBeUndefined();
      });
    });

    describe('string stays string (no coercion)', () => {
      test('string "42" stays string, not number', () => {
        const cid = new CerialId('user:42');
        expect(cid.table).toBe('user');
        expect(cid.id).toBe('42');
        expect(typeof cid.id).toBe('string');
      });

      test('string input never becomes typed', () => {
        const cid = new CerialId('table:[1,2,3]');
        expect(typeof cid.id).toBe('string');
        expect(cid.id).toBe('[1,2,3]');
      });
    });

    describe('type-strict equals', () => {
      test('number 42 !== string "42"', () => {
        const numId = CerialId.fromRecordId(new RecordId('user', 42));
        const strId = CerialId.fromRecordId(new RecordId('user', '42'));
        expect(numId.equals(strId)).toBe(false);
      });

      test('same number IDs are equal', () => {
        const id1 = CerialId.fromRecordId(new RecordId('user', 42));
        const id2 = CerialId.fromRecordId(new RecordId('user', 42));
        expect(id1.equals(id2)).toBe(true);
      });

      test('same array IDs are equal', () => {
        const id1 = CerialId.fromRecordId(new RecordId('w', ['London', 42]));
        const id2 = CerialId.fromRecordId(new RecordId('w', ['London', 42]));
        expect(id1.equals(id2)).toBe(true);
      });

      test('different array IDs are not equal', () => {
        const id1 = CerialId.fromRecordId(new RecordId('w', ['London', 42]));
        const id2 = CerialId.fromRecordId(new RecordId('w', ['Paris', 42]));
        expect(id1.equals(id2)).toBe(false);
      });

      test('same object IDs are equal', () => {
        const id1 = CerialId.fromRecordId(new RecordId('m', { a: 1 }));
        const id2 = CerialId.fromRecordId(new RecordId('m', { a: 1 }));
        expect(id1.equals(id2)).toBe(true);
      });
    });

    describe('equals with unknown types', () => {
      test('returns false for number', () => {
        const cid = new CerialId('user:abc');
        expect(cid.equals(42)).toBe(false);
      });

      test('returns false for null', () => {
        const cid = new CerialId('user:abc');
        expect(cid.equals(null)).toBe(false);
      });

      test('returns false for undefined', () => {
        const cid = new CerialId('user:abc');
        expect(cid.equals(undefined)).toBe(false);
      });

      test('returns false for boolean', () => {
        const cid = new CerialId('user:abc');
        expect(cid.equals(true)).toBe(false);
      });

      test('returns false for plain object', () => {
        const cid = new CerialId('user:abc');
        expect(cid.equals({ foo: 'bar' })).toBe(false);
      });
    });

    describe('clone deep copy', () => {
      test('cloned array id is independent from original', () => {
        const original = CerialId.fromRecordId(new RecordId('w', ['London', 42]));
        const cloned = original.clone();
        expect(cloned.id).toEqual(['London', 42]);
        // Mutate cloned array
        (cloned.id as unknown[])[0] = 'Paris';
        // Original should be unaffected
        expect((original.id as unknown[])[0]).toBe('London');
      });

      test('cloned object id is independent from original', () => {
        const original = CerialId.fromRecordId(new RecordId('m', { service: 'api', ts: 123 }));
        const cloned = original.clone();
        expect(cloned.id).toEqual({ service: 'api', ts: 123 });
        // Mutate cloned object
        (cloned.id as Record<string, unknown>).service = 'web';
        // Original should be unaffected
        expect((original.id as Record<string, unknown>).service).toBe('api');
      });

      test('cloned number id is same value', () => {
        const original = CerialId.fromRecordId(new RecordId('user', 42));
        const cloned = original.clone();
        expect(cloned.id).toBe(42);
        expect(cloned.table).toBe('user');
        expect(cloned).not.toBe(original);
      });
    });

    describe('withId generic', () => {
      test('withId(number) returns CerialId with number id', () => {
        const original = new CerialId('user:abc');
        const modified = original.withId(42);
        expect(modified.id).toBe(42);
        expect(typeof modified.id).toBe('number');
        expect(modified.table).toBe('user');
      });

      test('withId(string) returns CerialId with string id', () => {
        const original = CerialId.fromRecordId(new RecordId('user', 42));
        const modified = original.withId('xyz');
        expect(modified.id).toBe('xyz');
        expect(typeof modified.id).toBe('string');
        expect(modified.table).toBe('user');
      });

      test('withId preserves original', () => {
        const original = new CerialId('user:abc');
        original.withId(42);
        expect(original.id).toBe('abc');
      });

      test('withId(array) works', () => {
        const original = new CerialId('user:abc');
        const modified = original.withId(['London', 42]);
        expect(modified.id).toEqual(['London', 42]);
        expect(modified.table).toBe('user');
      });
    });

    describe('withTable with typed IDs', () => {
      test('withTable preserves number id', () => {
        const original = CerialId.fromRecordId(new RecordId('user', 42));
        const modified = original.withTable('other');
        expect(modified.table).toBe('other');
        expect(modified.id).toBe(42);
        expect(typeof modified.id).toBe('number');
      });

      test('withTable preserves array id', () => {
        const original = CerialId.fromRecordId(new RecordId('w', ['London', 42]));
        const modified = original.withTable('weather');
        expect(modified.table).toBe('weather');
        expect(modified.id).toEqual(['London', 42]);
      });
    });

    describe('fromRecordId generic preserves type', () => {
      test('fromRecordId with number preserves number', () => {
        const rid = new RecordId('user', 42);
        const cid = CerialId.fromRecordId(rid);
        expect(cid.id).toBe(42);
        expect(typeof cid.id).toBe('number');
      });

      test('fromRecordId with string preserves string', () => {
        const rid = new RecordId('user', 'abc');
        const cid = CerialId.fromRecordId(rid);
        expect(cid.id).toBe('abc');
        expect(typeof cid.id).toBe('string');
      });
    });

    describe('isComplete with typed IDs', () => {
      test('number id with table is complete', () => {
        const cid = CerialId.fromRecordId(new RecordId('user', 42));
        expect(cid.isComplete).toBe(true);
      });

      test('number id without table is not complete', () => {
        const cid = new CerialId(42);
        expect(cid.isComplete).toBe(false);
      });

      test('array id with table is complete', () => {
        const cid = CerialId.fromRecordId(new RecordId('w', ['London', 42]));
        expect(cid.isComplete).toBe(true);
      });
    });

    describe('toJSON and valueOf with typed IDs', () => {
      test('toJSON with number id and table', () => {
        const rid = new RecordId('user', 42);
        const cid = CerialId.fromRecordId(rid);
        expect(cid.toJSON()).toBe(rid.toString());
      });

      test('valueOf with number id and table', () => {
        const rid = new RecordId('user', 42);
        const cid = CerialId.fromRecordId(rid);
        expect(cid.valueOf()).toBe(rid.toString());
      });

      test('JSON.stringify with number id', () => {
        const cid = CerialId.fromRecordId(new RecordId('user', 42));
        const json = JSON.stringify({ id: cid });
        expect(json).toContain('user:42');
      });
    });

    describe('parse with typed IDs', () => {
      test('parse sets table on number id', () => {
        const cid = CerialId.parse(42, 'user');
        expect(cid.table).toBe('user');
        expect(cid.id).toBe(42);
      });

      test('parse sets table on array id', () => {
        const cid = CerialId.parse(['London', 42], 'weather');
        expect(cid.table).toBe('weather');
        expect(cid.id).toEqual(['London', 42]);
      });
    });
  });
});
