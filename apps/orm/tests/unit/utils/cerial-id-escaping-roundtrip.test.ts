/**
 * Unit Tests: CerialId
 */

import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId', () => {
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
