/**
 * Unit Tests: CerialId
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, Uuid } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
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
});
