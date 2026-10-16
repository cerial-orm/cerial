/**
 * Unit Tests: CerialId
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, Uuid } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
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
      // The id type parameter is inferred, so a boolean satisfies the constructor overloads and the
      // runtime guard is the only thing rejecting it. No cast or expectation is needed to call this.
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
});
