/**
 * Unit Tests: CerialId
 */

import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
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
