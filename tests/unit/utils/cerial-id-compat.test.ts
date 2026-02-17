/**
 * CerialId Cross-Language Compatibility & Inverse Tests
 *
 * Verifies CerialId works correctly with all RecordIdValue types
 * as they would be returned by any SurrealDB SDK (Rust, Go, Python, JS, etc.)
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import { CerialId, isCerialId, isRecordIdInput } from '../../../src/utils/cerial-id';

describe('CerialId Cross-Language Compatibility', () => {
  describe('SDK-inserted data: number IDs', () => {
    test('integer ID via fromRecordId preserves number type', () => {
      const rid = new RecordId('user', 42);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.table).toBe('user');
      expect(cid.id).toBe(42);
      expect(typeof cid.id).toBe('number');
    });

    test('float ID via fromRecordId preserves float', () => {
      const rid = new RecordId('metric', 99.99);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(99.99);
      expect(typeof cid.id).toBe('number');
    });

    test('negative integer ID', () => {
      const rid = new RecordId('ledger', -100);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(-100);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('negative float ID', () => {
      const rid = new RecordId('temp', -273.15);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(-273.15);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('zero ID preserves value and type', () => {
      const rid = new RecordId('counter', 0);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(0);
      expect(typeof cid.id).toBe('number');
      expect(cid.isComplete).toBe(true);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('SDK-inserted data: string IDs', () => {
    test('simple string ID', () => {
      const rid = new RecordId('user', 'abc');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('abc');
      expect(typeof cid.id).toBe('string');
    });

    test('UUID-format string ID', () => {
      const rid = new RecordId('session', '550e8400-e29b-41d4-a716-446655440000');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    test('string ID with hyphens', () => {
      const rid = new RecordId('slug', 'my-blog-post');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('my-blog-post');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('string ID with underscores', () => {
      const rid = new RecordId('config', 'app_setting_v2');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('app_setting_v2');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('SDK-inserted data: array IDs', () => {
    test('coordinate pair array', () => {
      const rid = new RecordId('location', [51.5, -0.1]);
      const cid = CerialId.fromRecordId(rid);
      expect(Array.isArray(cid.id)).toBe(true);
      expect(cid.id).toEqual([51.5, -0.1]);
    });

    test('string + number mixed array', () => {
      const rid = new RecordId('weather', ['London', 2024]);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(['London', 2024]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('triple-element array', () => {
      const rid = new RecordId('point', [1, 2, 3]);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual([1, 2, 3]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('single-element array', () => {
      const rid = new RecordId('tag', ['solo']);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(['solo']);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('SDK-inserted data: object IDs', () => {
    test('service + timestamp composite key', () => {
      const rid = new RecordId('metric', { service: 'api', ts: 123 });
      const cid = CerialId.fromRecordId(rid);
      expect(typeof cid.id).toBe('object');
      expect(cid.id).toEqual({ service: 'api', ts: 123 });
    });

    test('multi-field composite key', () => {
      const rid = new RecordId('event', { year: 2024, month: 6, day: 15 });
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ year: 2024, month: 6, day: 15 });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('object with boolean value', () => {
      const rid = new RecordId('flag', { active: true, name: 'feature_x' });
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ active: true, name: 'feature_x' });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('SDK-inserted data: bigint IDs', () => {
    test('bigint beyond MAX_SAFE_INTEGER', () => {
      const rid = new RecordId('counter', 9007199254740993n);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(9007199254740993n);
      expect(typeof cid.id).toBe('bigint');
    });

    test('small bigint value', () => {
      const rid = new RecordId('seq', 1n);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(1n);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('zero bigint', () => {
      const rid = new RecordId('seq', 0n);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(0n);
      expect(typeof cid.id).toBe('bigint');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('negative bigint', () => {
      const rid = new RecordId('offset', -9007199254740993n);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(-9007199254740993n);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('SDK-inserted data: Uuid IDs', () => {
    test('Uuid ID preserves instance', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const rid = new RecordId('session', uuid);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBeInstanceOf(Uuid);
      expect(cid.id).toBe(uuid);
    });

    test('Uuid round-trip through toRecordId', () => {
      const uuid = new Uuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      const rid = new RecordId('token', uuid);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('cross-type comparison', () => {
    test('number 42 vs string "42" → false (different types)', () => {
      const numId = CerialId.fromRecordId(new RecordId('user', 42));
      const strId = CerialId.fromRecordId(new RecordId('user', '42'));
      expect(numId.equals(strId)).toBe(false);
    });

    test('bigint 42n vs number 42 → delegates to SDK', () => {
      const bigId = CerialId.fromRecordId(new RecordId('user', 42n));
      const numId = CerialId.fromRecordId(new RecordId('user', 42));
      // SDK RecordId equality determines the outcome
      const sdkResult = new RecordId('user', 42n).equals(new RecordId('user', 42));
      expect(bigId.equals(numId)).toBe(sdkResult);
    });

    test('bigint 42n vs string "42" → false', () => {
      const bigId = CerialId.fromRecordId(new RecordId('user', 42n));
      const strId = CerialId.fromRecordId(new RecordId('user', '42'));
      expect(bigId.equals(strId)).toBe(false);
    });

    test('number with RecordId directly → true when same', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(new RecordId('user', 42))).toBe(true);
    });

    test('number with RecordId directly → false when different value', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(new RecordId('user', 43))).toBe(false);
    });

    test('array ID vs different-length array → false', () => {
      const a = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      const b = CerialId.fromRecordId(new RecordId('t', [1, 2, 3]));
      expect(a.equals(b)).toBe(false);
    });

    test('object ID vs object with extra key → false', () => {
      const a = CerialId.fromRecordId(new RecordId('t', { x: 1 }));
      const b = CerialId.fromRecordId(new RecordId('t', { x: 1, y: 2 }));
      expect(a.equals(b)).toBe(false);
    });

    test('object ID vs object with different value → false', () => {
      const a = CerialId.fromRecordId(new RecordId('t', { x: 1 }));
      const b = CerialId.fromRecordId(new RecordId('t', { x: 2 }));
      expect(a.equals(b)).toBe(false);
    });

    test('array [1, "a"] vs array ["a", 1] → false (order matters)', () => {
      const a = CerialId.fromRecordId(new RecordId('t', [1, 'a']));
      const b = CerialId.fromRecordId(new RecordId('t', ['a', 1]));
      expect(a.equals(b)).toBe(false);
    });

    test('object {a:1, b:2} equals {b:2, a:1} (key order irrelevant)', () => {
      const a = CerialId.fromRecordId(new RecordId('t', { a: 1, b: 2 }));
      const b = CerialId.fromRecordId(new RecordId('t', { b: 2, a: 1 }));
      expect(a.equals(b)).toBe(true);
    });

    test('CerialId with number equals RecordId with same number', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(new RecordId('user', 42))).toBe(true);
    });

    test('CerialId with array equals RecordId with same array', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', [1, 2, 3]));
      expect(cid.equals(new RecordId('t', [1, 2, 3]))).toBe(true);
    });

    test('CerialId with object equals RecordId with same object', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', { k: 'v' }));
      expect(cid.equals(new RecordId('t', { k: 'v' }))).toBe(true);
    });
  });

  describe('boundary values', () => {
    test('Number.MAX_SAFE_INTEGER round-trip', () => {
      const rid = new RecordId('t', Number.MAX_SAFE_INTEGER);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(Number.MAX_SAFE_INTEGER);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('Number.MIN_SAFE_INTEGER round-trip', () => {
      const rid = new RecordId('t', Number.MIN_SAFE_INTEGER);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(Number.MIN_SAFE_INTEGER);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('Number.MAX_SAFE_INTEGER preserved as number type', () => {
      const cid = new CerialId(Number.MAX_SAFE_INTEGER, 't');
      expect(typeof cid.id).toBe('number');
      expect(cid.id).toBe(9007199254740991);
    });

    test('Number.MIN_SAFE_INTEGER preserved as number type', () => {
      const cid = new CerialId(Number.MIN_SAFE_INTEGER, 't');
      expect(typeof cid.id).toBe('number');
      expect(cid.id).toBe(-9007199254740991);
    });

    test('very large bigint', () => {
      const big = 99999999999999999999999999999999n;
      const rid = new RecordId('t', big);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe(big);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('empty string ID via RecordId', () => {
      const rid = new RecordId('t', '');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('');
      expect(cid.isComplete).toBe(false);
    });

    test('empty array ID via RecordId', () => {
      const rid = new RecordId('t', []);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual([]);
      expect(cid.isComplete).toBe(true);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('empty object ID via RecordId', () => {
      const rid = new RecordId('t', {});
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({});
      expect(cid.isComplete).toBe(true);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('large array ID (20 elements)', () => {
      const arr = Array.from({ length: 20 }, (_, i) => i);
      const rid = new RecordId('t', arr);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(arr);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('deeply nested object ID', () => {
      const obj = { a: { b: { c: { d: { e: 42 } } } } };
      const rid = new RecordId('t', obj);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(obj);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('Infinity as number ID', () => {
      const cid = new CerialId(Infinity, 't');
      expect(cid.id).toBe(Infinity);
      expect(typeof cid.id).toBe('number');
    });

    test('-Infinity as number ID', () => {
      const cid = new CerialId(-Infinity, 't');
      expect(cid.id).toBe(-Infinity);
      expect(typeof cid.id).toBe('number');
    });

    test('NaN as number ID (stored as NaN)', () => {
      const cid = new CerialId(NaN, 't');
      expect(Number.isNaN(cid.id)).toBe(true);
      expect(typeof cid.id).toBe('number');
    });
  });

  describe('special characters in string IDs', () => {
    test('ID with colons via RecordId', () => {
      const rid = new RecordId('user', 'id:with:colons');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('id:with:colons');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with brackets via RecordId', () => {
      const rid = new RecordId('data', 'val[0]');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('val[0]');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with braces via RecordId', () => {
      const rid = new RecordId('data', '{key}');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('{key}');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with single quotes via RecordId', () => {
      const rid = new RecordId('text', "it's");
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe("it's");
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with double quotes via RecordId', () => {
      const rid = new RecordId('text', 'say "hello"');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('say "hello"');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with unicode characters via RecordId', () => {
      const rid = new RecordId('i18n', 'café');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('café');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with emoji via RecordId', () => {
      const rid = new RecordId('emoji', '🚀🌍');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('🚀🌍');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with CJK characters via RecordId', () => {
      const rid = new RecordId('i18n', '你好世界');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('你好世界');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with newline via RecordId', () => {
      const rid = new RecordId('text', 'line1\nline2');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('line1\nline2');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with tab via RecordId', () => {
      const rid = new RecordId('text', 'col1\tcol2');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('col1\tcol2');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with spaces via RecordId', () => {
      const rid = new RecordId('user', 'John Doe');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('John Doe');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('ID with backslash via RecordId', () => {
      const rid = new RecordId('path', 'C:\\Users\\test');
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toBe('C:\\Users\\test');
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('nested complex IDs', () => {
    test('array with string and object', () => {
      const id = ['London', { year: 2024, month: 1 }];
      const rid = new RecordId('event', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(['London', { year: 2024, month: 1 }]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('object with array and number', () => {
      const id = { geo: [51.5, -0.1], ts: 1234567890 };
      const rid = new RecordId('reading', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ geo: [51.5, -0.1], ts: 1234567890 });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('array with nested array', () => {
      const id = [
        [1, 2],
        [3, 4],
        [5, 6],
      ];
      const rid = new RecordId('matrix', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('object with nested object and array', () => {
      const id = { user: { name: 'Alice', tags: ['admin', 'dev'] }, version: 3 };
      const rid = new RecordId('snapshot', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ user: { name: 'Alice', tags: ['admin', 'dev'] }, version: 3 });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('array with mixed primitives', () => {
      const id = ['text', 42, true, null];
      const rid = new RecordId('mixed', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(['text', 42, true, null]);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('deeply nested 5-level structure', () => {
      const id = { l1: { l2: { l3: { l4: { l5: 'deep' } } } } };
      const rid = new RecordId('deep', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual(id);
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });

    test('object with null values', () => {
      const id = { present: 'yes', absent: null };
      const rid = new RecordId('nullable', id);
      const cid = CerialId.fromRecordId(rid);
      expect(cid.id).toEqual({ present: 'yes', absent: null });
      expect(cid.toRecordId().equals(rid)).toBe(true);
    });
  });

  describe('cross-SDK round-trip: constructor → toRecordId → fromRecordId', () => {
    test('number: CerialId(42, table) → toRecordId → fromRecordId → equals', () => {
      const cid1 = new CerialId(42, 'user');
      const rid = cid1.toRecordId();
      const cid2 = CerialId.fromRecordId(rid);
      expect(cid1.equals(cid2)).toBe(true);
      expect(cid2.id).toBe(42);
    });

    test('array: CerialId([1,2], table) → toRecordId → fromRecordId → equals', () => {
      const cid1 = new CerialId([1, 2], 'data');
      const rid = cid1.toRecordId();
      const cid2 = CerialId.fromRecordId(rid);
      expect(cid1.equals(cid2)).toBe(true);
      expect(cid2.id).toEqual([1, 2]);
    });

    test('object: CerialId({k:v}, table) → toRecordId → fromRecordId → equals', () => {
      const cid1 = new CerialId({ service: 'api' }, 'metric');
      const rid = cid1.toRecordId();
      const cid2 = CerialId.fromRecordId(rid);
      expect(cid1.equals(cid2)).toBe(true);
      expect(cid2.id).toEqual({ service: 'api' });
    });

    test('bigint: CerialId(100n, table) → toRecordId → fromRecordId → equals', () => {
      const cid1 = new CerialId(100n, 'seq');
      const rid = cid1.toRecordId();
      const cid2 = CerialId.fromRecordId(rid);
      expect(cid1.equals(cid2)).toBe(true);
      expect(cid2.id).toBe(100n);
    });
  });

  describe('StringRecordId interop with typed IDs', () => {
    test('StringRecordId with simple id', () => {
      const srid = new StringRecordId('user:abc123');
      const cid = new CerialId(srid);
      expect(cid.table).toBe('user');
      expect(cid.id).toBe('abc123');
    });

    test('CerialId with number equals StringRecordId with matching string', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 'abc'));
      const srid = new StringRecordId('user:abc');
      expect(cid.equals(srid)).toBe(true);
    });

    test('CerialId.from(StringRecordId) preserves table and id', () => {
      const srid = new StringRecordId('data:test');
      const cid = CerialId.from(srid);
      expect(cid.table).toBe('data');
      expect(cid.id).toBe('test');
    });
  });

  describe('parse() with typed IDs and expected table', () => {
    test('parse number with matching table', () => {
      const rid = new RecordId('user', 42);
      const cid = CerialId.parse(rid, 'user');
      expect(cid.table).toBe('user');
      expect(cid.id).toBe(42);
    });

    test('parse number with mismatched table throws', () => {
      const rid = new RecordId('post', 42);
      expect(() => CerialId.parse(rid, 'user')).toThrow('Table "post" does not match expected table "user"');
    });

    test('parse array without table gets table assigned', () => {
      const cid = CerialId.parse([1, 2, 3], 'points');
      expect(cid.table).toBe('points');
      expect(cid.id).toEqual([1, 2, 3]);
    });

    test('parse object without table gets table assigned', () => {
      const cid = CerialId.parse({ k: 'v' }, 'data');
      expect(cid.table).toBe('data');
      expect(cid.id).toEqual({ k: 'v' });
    });
  });

  describe('isRecordIdInput type guard with all types', () => {
    test('recognizes number', () => {
      expect(isRecordIdInput(42)).toBe(true);
    });

    test('recognizes bigint', () => {
      expect(isRecordIdInput(100n)).toBe(true);
    });

    test('recognizes array', () => {
      expect(isRecordIdInput([1, 2])).toBe(true);
    });

    test('recognizes plain object', () => {
      expect(isRecordIdInput({ a: 1 })).toBe(true);
    });

    test('recognizes CerialId', () => {
      expect(isRecordIdInput(new CerialId('t:a'))).toBe(true);
    });

    test('recognizes RecordId', () => {
      expect(isRecordIdInput(new RecordId('t', 1))).toBe(true);
    });

    test('recognizes StringRecordId', () => {
      expect(isRecordIdInput(new StringRecordId('t:a'))).toBe(true);
    });

    test('recognizes string', () => {
      expect(isRecordIdInput('t:abc')).toBe(true);
    });

    test('rejects null', () => {
      expect(isRecordIdInput(null)).toBe(false);
    });

    test('rejects undefined', () => {
      expect(isRecordIdInput(undefined)).toBe(false);
    });
  });
});

describe('CerialId Inverse / Negative Tests', () => {
  describe('equals() failures', () => {
    test('wrong table name: user vs post', () => {
      const a = CerialId.fromRecordId(new RecordId('user', 42));
      const b = CerialId.fromRecordId(new RecordId('post', 42));
      expect(a.equals(b)).toBe(false);
    });

    test('wrong table name with string IDs', () => {
      const a = new CerialId('user:abc');
      const b = new CerialId('post:abc');
      expect(a.equals(b)).toBe(false);
    });

    test('wrong table name with array IDs', () => {
      const a = CerialId.fromRecordId(new RecordId('x', [1, 2]));
      const b = CerialId.fromRecordId(new RecordId('y', [1, 2]));
      expect(a.equals(b)).toBe(false);
    });

    test('wrong table name with object IDs', () => {
      const a = CerialId.fromRecordId(new RecordId('x', { k: 1 }));
      const b = CerialId.fromRecordId(new RecordId('y', { k: 1 }));
      expect(a.equals(b)).toBe(false);
    });

    test('null passed to equals → false', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(null)).toBe(false);
    });

    test('undefined passed to equals → false', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(undefined)).toBe(false);
    });

    test('boolean passed to equals → false', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(true)).toBe(false);
      expect(cid.equals(false)).toBe(false);
    });

    test('plain number passed to equals → false', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 42));
      expect(cid.equals(42)).toBe(false);
    });

    test('plain array passed to equals → false', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', [1, 2]));
      expect(cid.equals([1, 2])).toBe(false);
    });

    test('plain object passed to equals → false', () => {
      const cid = CerialId.fromRecordId(new RecordId('t', { a: 1 }));
      expect(cid.equals({ a: 1 })).toBe(false);
    });

    test('Date passed to equals → false', () => {
      const cid = new CerialId('user:abc');
      expect(cid.equals(new Date())).toBe(false);
    });

    test('RegExp passed to equals → false', () => {
      const cid = new CerialId('user:abc');
      expect(cid.equals(/abc/)).toBe(false);
    });

    test('CerialId without table: equals always false', () => {
      const noTable = new CerialId(42);
      const withTable = CerialId.fromRecordId(new RecordId('t', 42));
      expect(noTable.equals(withTable)).toBe(false);
    });

    test('other CerialId without table: equals returns false', () => {
      const a = CerialId.fromRecordId(new RecordId('t', 42));
      const b = new CerialId(42);
      expect(a.equals(b)).toBe(false);
    });

    test('string without table: equals returns false', () => {
      const cid = CerialId.fromRecordId(new RecordId('user', 'abc'));
      expect(cid.equals('abc')).toBe(false);
    });

    test('type mismatch in equals: number 0 vs string "0"', () => {
      const numId = CerialId.fromRecordId(new RecordId('t', 0));
      const strId = CerialId.fromRecordId(new RecordId('t', '0'));
      expect(numId.equals(strId)).toBe(false);
    });

    test('type mismatch in equals: empty array [] vs empty object {}', () => {
      const arrId = CerialId.fromRecordId(new RecordId('t', []));
      const objId = CerialId.fromRecordId(new RecordId('t', {}));
      // SDK RecordId determines result — these are different types
      const sdkResult = new RecordId('t', []).equals(new RecordId('t', {}));
      expect(arrId.equals(objId)).toBe(sdkResult);
    });
  });

  describe('toRecordId() failures', () => {
    test('throws for string id without table', () => {
      expect(() => new CerialId('abc').toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('throws for number id without table', () => {
      expect(() => new CerialId(42).toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('throws for bigint id without table', () => {
      expect(() => new CerialId(100n).toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('throws for array id without table', () => {
      expect(() => new CerialId([1, 2]).toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });

    test('throws for object id without table', () => {
      expect(() => new CerialId({ a: 1 }).toRecordId()).toThrow('Cannot create RecordId: table is undefined');
    });
  });

  describe('constructor failures', () => {
    test('boolean input throws', () => {
      expect(() => new CerialId(true as any)).toThrow('Invalid input type for CerialId');
    });

    test('false input throws', () => {
      expect(() => new CerialId(false as any)).toThrow('Invalid input type for CerialId');
    });
  });

  describe('parse() failures', () => {
    test('parse throws when table does not match expected', () => {
      expect(() => CerialId.parse('user:abc', 'post')).toThrow('Table "user" does not match expected table "post"');
    });

    test('parse throws for RecordId with wrong table', () => {
      const rid = new RecordId('wrong', 42);
      expect(() => CerialId.parse(rid, 'right')).toThrow('Table "wrong" does not match expected table "right"');
    });

    test('parse throws for CerialId with wrong table', () => {
      const cid = CerialId.fromRecordId(new RecordId('alpha', 'x'));
      expect(() => CerialId.parse(cid, 'beta')).toThrow('Table "alpha" does not match expected table "beta"');
    });
  });

  describe('isCerialId rejects non-CerialId values', () => {
    test('rejects RecordId', () => {
      expect(isCerialId(new RecordId('t', 42))).toBe(false);
    });

    test('rejects StringRecordId', () => {
      expect(isCerialId(new StringRecordId('t:abc'))).toBe(false);
    });

    test('rejects plain string', () => {
      expect(isCerialId('user:abc')).toBe(false);
    });

    test('rejects plain number', () => {
      expect(isCerialId(42)).toBe(false);
    });

    test('rejects plain object', () => {
      expect(isCerialId({ table: 'user', id: 'abc' })).toBe(false);
    });

    test('rejects null', () => {
      expect(isCerialId(null)).toBe(false);
    });

    test('rejects undefined', () => {
      expect(isCerialId(undefined)).toBe(false);
    });
  });

  describe('mutation isolation: clone prevents cross-contamination', () => {
    test('mutating cloned nested array does not affect original', () => {
      const original = CerialId.fromRecordId(
        new RecordId('t', [
          [1, 2],
          [3, 4],
        ]),
      );
      const cloned = original.clone();
      ((cloned.id as unknown[])[0] as number[])[0] = 999;
      expect(((original.id as unknown[])[0] as number[])[0]).toBe(1);
    });

    test('mutating cloned deeply nested object does not affect original', () => {
      const original = CerialId.fromRecordId(new RecordId('t', { a: { b: { c: 42 } } }));
      const cloned = original.clone();
      ((cloned.id as Record<string, any>).a.b as Record<string, unknown>).c = 0;
      expect((original.id as Record<string, any>).a.b.c).toBe(42);
    });
  });
});
