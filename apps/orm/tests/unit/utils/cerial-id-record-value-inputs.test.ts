/**
 * Unit Tests: CerialId
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
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
});
