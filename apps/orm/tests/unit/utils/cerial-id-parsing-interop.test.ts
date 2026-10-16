/**
 * Unit Tests: CerialId
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
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
