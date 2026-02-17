/**
 * Unit Tests: CerialId
 *
 * Tests for the CerialId class - a wrapper for SurrealDB record IDs.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
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

  describe('A: RecordIdValue round-trip (fromRecordId → toRecordId → equals)', () => {
    const SAMPLE_UUID = '550e8400-e29b-41d4-a716-446655440000';

    test('string round-trip', () => {
      const rid = new RecordId('user', 'abc123');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('number (int) round-trip — 42', () => {
      const rid = new RecordId('user', 42);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(42);
      expect(typeof cid.id).toBe('number');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('number (float) round-trip — 3.14', () => {
      const rid = new RecordId('metric', 3.14);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(3.14);
      expect(typeof cid.id).toBe('number');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('bigint round-trip — beyond MAX_SAFE_INTEGER', () => {
      const rid = new RecordId('counter', 9007199254740993n);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(9007199254740993n);
      expect(typeof cid.id).toBe('bigint');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('Uuid round-trip', () => {
      const uuid = new Uuid(SAMPLE_UUID);
      const rid = new RecordId('session', uuid);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(uuid);
      expect(cid.id).toBeInstanceOf(Uuid);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('array round-trip — ["London", 42]', () => {
      const rid = new RecordId('weather', ['London', 42]);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(['London', 42]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('nested array round-trip — ["London", [1, 2, 3]]', () => {
      const rid = new RecordId('data', ['London', [1, 2, 3]]);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(['London', [1, 2, 3]]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('object round-trip — { service: "api", ts: 123 }', () => {
      const rid = new RecordId('metric', { service: 'api', ts: 123 });
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ service: 'api', ts: 123 });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('nested object round-trip — { geo: { lat: 51.5, lng: -0.1 }, ts: 123 }', () => {
      const rid = new RecordId('location', { geo: { lat: 51.5, lng: -0.1 }, ts: 123 });
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ geo: { lat: 51.5, lng: -0.1 }, ts: 123 });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('B: Constructor input types (all should work)', () => {
    test('CerialId (clone)', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 42));
      const cloned = new CerialId(original);
      expect(cloned.id).toBe(42);
      expect(cloned.table).toBe('t');
      expect(cloned).not.toBe(original);
    });

    test('RecordId with number', () => {
      const cid = new CerialId(new RecordId('t', 99));
      expect(cid.id).toBe(99);
      expect(cid.table).toBe('t');
    });

    test('RecordId with array', () => {
      const cid = new CerialId(new RecordId('t', [1, 'a']));
      expect(cid.id).toEqual([1, 'a']);
      expect(cid.table).toBe('t');
    });

    test('RecordId with object', () => {
      const cid = new CerialId(new RecordId('t', { k: 'v' }));
      expect(cid.id).toEqual({ k: 'v' });
      expect(cid.table).toBe('t');
    });

    test('RecordId with bigint', () => {
      const cid = new CerialId(new RecordId('t', 100n));
      expect(cid.id).toBe(100n);
      expect(cid.table).toBe('t');
    });

    test('RecordId with Uuid', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const cid = new CerialId(new RecordId('t', uuid));
      expect(cid.id).toBe(uuid);
      expect(cid.table).toBe('t');
    });

    test('StringRecordId', () => {
      const cid = new CerialId(new StringRecordId('t:abc'));
      expect(cid.id).toBe('abc');
      expect(cid.table).toBe('t');
    });

    test('string', () => {
      const cid = new CerialId('t:hello');
      expect(cid.id).toBe('hello');
      expect(cid.table).toBe('t');
    });

    test('number (direct)', () => {
      const cid = new CerialId(42);
      expect(cid.id).toBe(42);
      expect(cid.table).toBeUndefined();
    });

    test('bigint (direct)', () => {
      const cid = new CerialId(999n);
      expect(cid.id).toBe(999n);
      expect(cid.table).toBeUndefined();
    });

    test('array (direct)', () => {
      const cid = new CerialId(['a', 1]);
      expect(cid.id).toEqual(['a', 1]);
      expect(cid.table).toBeUndefined();
    });

    test('object (direct)', () => {
      const cid = new CerialId({ x: 10 });
      expect(cid.id).toEqual({ x: 10 });
      expect(cid.table).toBeUndefined();
    });
  });

  describe('C: Inverse/negative tests', () => {
    test('equals() returns false for array', () => {
      const cid = new CerialId('user:abc');
      expect(cid.equals([1, 2])).toBe(false);
    });

    test('equals() returns false for Date', () => {
      const cid = new CerialId('user:abc');
      expect(cid.equals(new Date())).toBe(false);
    });

    test('equals() type mismatch: number 42 vs string "42"', () => {
      const numId = CerialId.fromRecordId(new RecordId('t', 42));
      const strId = CerialId.fromRecordId(new RecordId('t', '42'));
      expect(numId.equals(strId)).toBe(false);
    });

    test('equals() different tables same id', () => {
      const a = new CerialId('user:abc');
      const b = new CerialId('post:abc');
      expect(a.equals(b)).toBe(false);
    });

    test('toRecordId() throws when table is undefined — string id', () => {
      const cid = new CerialId('abc');
      expect(() => cid.toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('toRecordId() throws when table is undefined — number id', () => {
      const cid = new CerialId(42);
      expect(() => cid.toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('toRecordId() throws when table is undefined — bigint id', () => {
      const cid = new CerialId(100n);
      expect(() => cid.toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('toRecordId() throws when table is undefined — array id', () => {
      const cid = new CerialId(['a', 1]);
      expect(() => cid.toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('toRecordId() throws when table is undefined — object id', () => {
      const cid = new CerialId({ k: 'v' });
      expect(() => cid.toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('clone() returns different instance — string', () => {
      const original = new CerialId('user:abc');
      const cloned = original.clone();
      expect(cloned).not.toBe(original);
      expect(cloned.id).toBe(original.id);
    });

    test('clone() returns different instance — number', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 42));
      const cloned = original.clone();
      expect(cloned).not.toBe(original);
      expect(cloned.id).toBe(42);
    });

    test('clone() returns different instance — bigint', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 100n));
      const cloned = original.clone();
      expect(cloned).not.toBe(original);
      expect(cloned.id).toBe(100n);
    });

    test('clone() returns different instance — array', () => {
      const original = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      const cloned = original.clone();
      expect(cloned).not.toBe(original);
      expect(cloned.id).toEqual([1, 2]);
    });

    test('clone() returns different instance — object', () => {
      const original = CerialId.fromRecordId(new RecordId('t', { a: 1 }));
      const cloned = original.clone();
      expect(cloned).not.toBe(original);
      expect(cloned.id).toEqual({ a: 1 });
    });

    test('isComplete returns false when table is undefined — number id', () => {
      expect(new CerialId(42).isComplete).toBe(false);
    });

    test('isComplete returns false when table is undefined — array id', () => {
      expect(new CerialId([1]).isComplete).toBe(false);
    });

    test('isComplete returns false when table is undefined — object id', () => {
      expect(new CerialId({ a: 1 }).isComplete).toBe(false);
    });

    test('isComplete returns false when table is undefined — bigint id', () => {
      expect(new CerialId(99n).isComplete).toBe(false);
    });

    test('invalid constructor input throws', () => {
      // @ts-expect-error — testing runtime error for invalid input type (boolean)
      expect(() => new CerialId(true)).toThrow('Invalid input type for CerialId');
    });

    test('equals() returns false when this has no table', () => {
      const cid = new CerialId(42);
      expect(cid.equals(CerialId.fromRecordId(new RecordId('t', 42)))).toBe(false);
    });

    test('equals() returns false when other CerialId has no table', () => {
      const a = CerialId.fromRecordId(new RecordId('t', 42));
      const b = new CerialId(42);
      expect(a.equals(b)).toBe(false);
    });

    test('equals() with string that has no table returns false', () => {
      const cid = new CerialId('user:abc');
      expect(cid.equals('abc')).toBe(false);
    });
  });

  describe('D: Cross-type equality', () => {
    test('number 42 vs bigint 42n — check SDK behavior', () => {
      const numId = CerialId.fromRecordId(new RecordId('t', 42));
      const bigId = CerialId.fromRecordId(new RecordId('t', 42n));
      // SDK RecordId equality is type-strict: number ≠ bigint
      const sdkEqual = new RecordId('t', 42).equals(new RecordId('t', 42n));
      expect(numId.equals(bigId)).toBe(sdkEqual);
    });

    test('number 42 vs string "42" — MUST be false', () => {
      const numId = CerialId.fromRecordId(new RecordId('t', 42));
      const strId = CerialId.fromRecordId(new RecordId('t', '42'));
      expect(numId.equals(strId)).toBe(false);
    });

    test('array [1,2] vs array [1,2] — same values, same type, equal', () => {
      const a = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      const b = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      expect(a.equals(b)).toBe(true);
    });

    test('array [1,2] vs array [2,1] — different order, not equal', () => {
      const a = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      const b = CerialId.fromRecordId(new RecordId('t', [2, 1]));
      expect(a.equals(b)).toBe(false);
    });

    test('object {a:1, b:2} vs object {b:2, a:1} — same keys, equal', () => {
      const a = CerialId.fromRecordId(new RecordId('t', { a: 1, b: 2 }));
      const b = CerialId.fromRecordId(new RecordId('t', { b: 2, a: 1 }));
      // SDK RecordId.equals is deep-equal regardless of key order
      expect(a.equals(b)).toBe(true);
    });
  });

  describe('E: Clone deep copy verification', () => {
    test('array: mutate cloned → original unaffected', () => {
      const original = CerialId.fromRecordId(new RecordId('t', ['a', 'b']));
      const cloned = original.clone();
      (cloned.id as unknown[])[0] = 'z';
      expect((original.id as unknown[])[0]).toBe('a');
    });

    test('object: mutate cloned → original unaffected', () => {
      const original = CerialId.fromRecordId(new RecordId('t', { x: 1, y: 2 }));
      const cloned = original.clone();
      (cloned.id as Record<string, unknown>).x = 999;
      expect((original.id as Record<string, unknown>).x).toBe(1);
    });

    test('nested array: mutate inner array → original unaffected', () => {
      const original = CerialId.fromRecordId(new RecordId('t', ['a', [10, 20]]));
      const cloned = original.clone();
      ((cloned.id as unknown[])[1] as number[])[0] = 999;
      expect(((original.id as unknown[])[1] as number[])[0]).toBe(10);
    });

    test('nested object: mutate inner object → original unaffected', () => {
      const original = CerialId.fromRecordId(new RecordId('t', { inner: { val: 42 } }));
      const cloned = original.clone();
      ((cloned.id as Record<string, unknown>).inner as Record<string, unknown>).val = 0;
      expect(((original.id as Record<string, unknown>).inner as Record<string, unknown>).val).toBe(42);
    });

    test('primitive (string): clone produces same value', () => {
      const original = new CerialId('user:abc');
      const cloned = original.clone();
      expect(cloned.id).toBe('abc');
    });

    test('primitive (number): clone produces same value', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 42));
      const cloned = original.clone();
      expect(cloned.id).toBe(42);
    });

    test('primitive (bigint): clone produces same value', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 999n));
      const cloned = original.clone();
      expect(cloned.id).toBe(999n);
    });

    test('Uuid: clone returns same instance (immutable)', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const original = CerialId.fromRecordId(new RecordId('t', uuid));
      const cloned = original.clone();
      // Uuid is immutable — cloneIdValue returns as-is for class instances
      expect(cloned.id).toBe(uuid);
    });
  });

  describe('F: withId() with all RecordIdValue types', () => {
    test('withId(42) — number', () => {
      const original = new CerialId('user:abc');
      const modified = original.withId(42);
      expect(modified.id).toBe(42);
      expect(typeof modified.id).toBe('number');
      expect(modified.table).toBe('user');
    });

    test('withId("abc") — string', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 42));
      const modified = original.withId('abc');
      expect(modified.id).toBe('abc');
      expect(typeof modified.id).toBe('string');
    });

    test('withId(42n) — bigint', () => {
      const original = new CerialId('user:abc');
      const modified = original.withId(42n);
      expect(modified.id).toBe(42n);
      expect(typeof modified.id).toBe('bigint');
      expect(modified.table).toBe('user');
    });

    test('withId(["a", 1]) — array', () => {
      const original = new CerialId('user:abc');
      const modified = original.withId(['a', 1]);
      expect(modified.id).toEqual(['a', 1]);
      expect(modified.table).toBe('user');
    });

    test('withId({ k: "v" }) — object', () => {
      const original = new CerialId('user:abc');
      const modified = original.withId({ k: 'v' });
      expect(modified.id).toEqual({ k: 'v' });
      expect(modified.table).toBe('user');
    });

    test('withId preserves original — number', () => {
      const original = new CerialId('user:abc');
      original.withId(42);
      expect(original.id).toBe('abc');
    });

    test('withId preserves original — array', () => {
      const original = new CerialId('user:abc');
      original.withId([1, 2]);
      expect(original.id).toBe('abc');
    });

    test('withId preserves original — object', () => {
      const original = new CerialId('user:abc');
      original.withId({ a: 1 });
      expect(original.id).toBe('abc');
    });
  });

  describe('G: withTable() preserves typed .id', () => {
    test('number id + withTable → id stays number', () => {
      const cid = CerialId.fromRecordId(new RecordId('a', 42));
      const changed = cid.withTable('b');
      expect(changed.table).toBe('b');
      expect(changed.id).toBe(42);
      expect(typeof changed.id).toBe('number');
    });

    test('array id + withTable → id stays array', () => {
      const cid = CerialId.fromRecordId(new RecordId('a', [1, 2]));
      const changed = cid.withTable('b');
      expect(changed.table).toBe('b');
      expect(changed.id).toEqual([1, 2]);
    });

    test('object id + withTable → id stays object', () => {
      const cid = CerialId.fromRecordId(new RecordId('a', { k: 'v' }));
      const changed = cid.withTable('b');
      expect(changed.table).toBe('b');
      expect(changed.id).toEqual({ k: 'v' });
    });

    test('bigint id + withTable → id stays bigint', () => {
      const cid = CerialId.fromRecordId(new RecordId('a', 100n));
      const changed = cid.withTable('b');
      expect(changed.table).toBe('b');
      expect(changed.id).toBe(100n);
      expect(typeof changed.id).toBe('bigint');
    });

    test('Uuid id + withTable → id stays Uuid', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const cid = CerialId.fromRecordId(new RecordId('a', uuid));
      const changed = cid.withTable('b');
      expect(changed.table).toBe('b');
      expect(changed.id).toBe(uuid);
    });

    test('withTable does not mutate original', () => {
      const original = CerialId.fromRecordId(new RecordId('a', [1, 2]));
      original.withTable('b');
      expect(original.table).toBe('a');
    });
  });

  describe('H: toString() for all types', () => {
    test('string id with table', () => {
      const cid = new CerialId('user:abc');
      expect(cid.toString()).toBe('user:abc');
    });

    test('number id with table matches RecordId.toString()', () => {
      const rid = new RecordId('user', 42);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toString()).toBe(rid.toString());
    });

    test('array id with table matches RecordId.toString()', () => {
      const rid = new RecordId('w', ['London', 42]);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toString()).toBe(rid.toString());
    });

    test('object id with table matches RecordId.toString()', () => {
      const rid = new RecordId('m', { a: 1 });
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toString()).toBe(rid.toString());
    });

    test('bigint id with table matches RecordId.toString()', () => {
      const rid = new RecordId('c', 9007199254740993n);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toString()).toBe(rid.toString());
    });

    test('string id without table → just the id', () => {
      const cid = new CerialId('abc123');
      expect(cid.toString()).toBe('abc123');
    });

    test('number id without table → String(id)', () => {
      const cid = new CerialId(42);
      expect(cid.toString()).toBe('42');
    });

    test('bigint id without table → String(id)', () => {
      const cid = new CerialId(100n);
      expect(cid.toString()).toBe('100');
    });

    test('array id without table → String(id)', () => {
      const cid = new CerialId([1, 2]);
      expect(cid.toString()).toBe(String([1, 2]));
    });

    test('object id without table → String(id)', () => {
      const cid = new CerialId({ a: 1 });
      expect(cid.toString()).toBe(String({ a: 1 }));
    });
  });

  describe('I: toJSON() and valueOf() for all types', () => {
    test('toJSON equals toString for number id with table', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', 42));
      expect(cid.toJSON()).toBe(cid.toString());
    });

    test('valueOf equals toString for number id with table', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', 42));
      expect(cid.valueOf()).toBe(cid.toString());
    });

    test('toJSON equals toString for array id with table', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      expect(cid.toJSON()).toBe(cid.toString());
    });

    test('valueOf equals toString for array id with table', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      expect(cid.valueOf()).toBe(cid.toString());
    });

    test('toJSON equals toString for object id with table', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', { a: 1 }));
      expect(cid.toJSON()).toBe(cid.toString());
    });

    test('toJSON equals toString for bigint id with table', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', 100n));
      expect(cid.toJSON()).toBe(cid.toString());
    });

    test('toJSON equals toString for number id without table', () => {
      const cid = new CerialId(42);
      expect(cid.toJSON()).toBe(cid.toString());
    });

    test('JSON.stringify with array id', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      const json = JSON.stringify({ id: cid });
      expect(json).toContain(cid.toString());
    });

    test('JSON.stringify with object id', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', { a: 1 }));
      const parsed = JSON.parse(JSON.stringify({ id: cid }));
      expect(parsed.id).toBe(cid.toString());
    });
  });

  describe('J: parseRecordString edge cases', () => {
    test('colons in IDs: "user:id:with:colons"', () => {
      const cid = new CerialId('user:id:with:colons');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('id:with:colons');
    });

    test('special chars: "user:abc-def"', () => {
      const cid = new CerialId('user:abc-def');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('abc-def');
    });

    test('backtick escaping: "`table`:id"', () => {
      const cid = new CerialId('`my-table`:id');
      expect(cid.table).toBe('my-table');
      expect(cid.id).toBe('id');
    });

    test('backtick table + backtick id: "`tbl`:`my-id`"', () => {
      const cid = new CerialId('`my-tbl`:`my-id`');
      expect(cid.table).toBe('my-tbl');
      expect(cid.id).toBe('my-id');
    });

    test('backtick table + angle bracket id: "`tbl`:⟨my-id⟩"', () => {
      const cid = new CerialId('`my-tbl`:⟨my-id⟩');
      expect(cid.table).toBe('my-tbl');
      expect(cid.id).toBe('my-id');
    });

    test('angle brackets: "⟨table⟩:⟨id⟩"', () => {
      const cid = new CerialId('⟨my-table⟩:⟨my-id⟩');
      expect(cid.table).toBe('my-table');
      expect(cid.id).toBe('my-id');
    });

    test('angle bracket table only: "⟨table⟩:plain-id"', () => {
      const cid = new CerialId('⟨my-table⟩:plain-id');
      expect(cid.table).toBe('my-table');
      expect(cid.id).toBe('plain-id');
    });

    test('angle bracket id only: "table:⟨my-id⟩"', () => {
      const cid = new CerialId('user:⟨special-id⟩');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('special-id');
    });

    test('empty string ID: "user:"', () => {
      const cid = new CerialId('user:');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('');
    });

    test('just ID no table: "abc123"', () => {
      const cid = new CerialId('abc123');
      expect(cid.table).toBeUndefined();
      expect(cid.id).toBe('abc123');
    });
  });

  describe('K: Boundary values', () => {
    test('empty string ID via "user:" — isComplete should be false', () => {
      const cid = new CerialId('user:');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('');
      expect(cid.isComplete).toBe(false);
    });

    test('empty array ID: RecordId("t", []) round-trip', () => {
      const rid = new RecordId('t', []);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual([]);
      expect(cid.isComplete).toBe(true);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('empty object ID: RecordId("t", {}) round-trip', () => {
      const rid = new RecordId('t', {});
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({});
      expect(cid.isComplete).toBe(true);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('zero: new CerialId(0) — id should be 0, not falsy', () => {
      const cid = new CerialId(0);
      expect(cid.id).toBe(0);
      expect(typeof cid.id).toBe('number');
      expect(cid.table).toBeUndefined();
    });

    test('zero with table is complete', () => {
      const cid = new CerialId(0, 'user');
      expect(cid.id).toBe(0);
      expect(cid.table).toBe('user');
      expect(cid.isComplete).toBe(true);
    });

    test('negative number: new CerialId(-42)', () => {
      const cid = new CerialId(-42);
      expect(cid.id).toBe(-42);
      expect(typeof cid.id).toBe('number');
    });

    test('negative number with table round-trips', () => {
      const rid = new RecordId('t', -42);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('MAX_SAFE_INTEGER: new CerialId(Number.MAX_SAFE_INTEGER)', () => {
      const cid = new CerialId(Number.MAX_SAFE_INTEGER);
      expect(cid.id).toBe(Number.MAX_SAFE_INTEGER);
      expect(typeof cid.id).toBe('number');
    });

    test('MAX_SAFE_INTEGER round-trip', () => {
      const rid = new RecordId('t', Number.MAX_SAFE_INTEGER);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('0n bigint', () => {
      const cid = new CerialId(0n);
      expect(cid.id).toBe(0n);
      expect(typeof cid.id).toBe('bigint');
    });
  });

  describe('L: SDK interop', () => {
    test('CerialId from SDK RecordId with Uuid ID → .id is Uuid instance', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const rid = new RecordId('session', uuid);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBeInstanceOf(Uuid);
      expect(cid.id).toBe(uuid);
    });

    test('CerialId → toRecordId() → SDK equals() returns true', () => {
      const rid = new RecordId('user', 42);
      const cid = CerialId.fromRecordId(rid);
      const roundtrip = cid.toRecordId();
      expect(rid.equals(roundtrip)).toBe(true);
    });

    test('fromRecordId preserves RecordId exact .id reference for Uuid (immutable)', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const rid = new RecordId('t', uuid);
      const cid = CerialId.fromRecordId(rid);
      // Same reference — no cloning for class instances
      expect(cid.id).toBe(uuid);
    });

    test('fromRecordId preserves exact string id', () => {
      const rid = new RecordId('user', 'hello-world');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(rid.id);
    });

    test('fromRecordId preserves exact number id', () => {
      const rid = new RecordId('user', 42);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(rid.id);
    });

    test('CerialId → toRecordId() → CerialId.fromRecordId() → equals original', () => {
      const original = CerialId.fromRecordId(new RecordId('user', { a: 1 }));
      const roundtrip = CerialId.fromRecordId(original.toRecordId());
      expect(original.equals(roundtrip)).toBe(true);
    });

    test('StringRecordId interop — equals via string comparison', () => {
      const cid = new CerialId('user:abc');
      const srid = new StringRecordId('user:abc');
      expect(cid.equals(srid)).toBe(true);
    });
  });

  describe('M: from() and fromString() static methods', () => {
    test('CerialId.from(42) — number', () => {
      const cid = CerialId.from(42);
      expect(cid.id).toBe(42);
      expect(cid.table).toBeUndefined();
    });

    test('CerialId.from(new RecordId("t", 42)) — RecordId', () => {
      const cid = CerialId.from(new RecordId('t', 42));
      expect(cid.id).toBe(42);
      expect(cid.table).toBe('t');
    });

    test('CerialId.from("user:abc", "override") — table override', () => {
      const cid = CerialId.from('user:abc', 'override');
      expect(cid.table).toBe('override');
      expect(cid.id).toBe('abc');
    });

    test('CerialId.fromString("user:abc") — string', () => {
      const cid = CerialId.fromString('user:abc');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('abc');
    });

    test('CerialId.from(100n) — bigint', () => {
      const cid = CerialId.from(100n);
      expect(cid.id).toBe(100n);
      expect(cid.table).toBeUndefined();
    });

    test('CerialId.from(["a", 1]) — array', () => {
      const cid = CerialId.from(['a', 1]);
      expect(cid.id).toEqual(['a', 1]);
      expect(cid.table).toBeUndefined();
    });

    test('CerialId.from({ k: "v" }) — object', () => {
      const cid = CerialId.from({ k: 'v' });
      expect(cid.id).toEqual({ k: 'v' });
      expect(cid.table).toBeUndefined();
    });

    test('CerialId.from(CerialId) — clone', () => {
      const original = CerialId.fromRecordId(new RecordId('t', 42));
      const cloned = CerialId.from(original);
      expect(cloned.id).toBe(42);
      expect(cloned.table).toBe('t');
      expect(cloned).not.toBe(original);
    });

    test('CerialId.from(StringRecordId)', () => {
      const cid = CerialId.from(new StringRecordId('user:abc'));
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('abc');
    });

    test('CerialId.from(number, table) — number with table override', () => {
      const cid = CerialId.from(42, 'user');
      expect(cid.id).toBe(42);
      expect(cid.table).toBe('user');
    });

    test('CerialId.fromString with just id (no colon)', () => {
      const cid = CerialId.fromString('abc123');
      expect(cid.table).toBeUndefined();
      expect(cid.id).toBe('abc123');
    });
  });
});
