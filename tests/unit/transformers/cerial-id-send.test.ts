/**
 * Unit Tests: CerialId Send Transformation
 *
 * Tests for transforming RecordIdInput types when sending to SurrealDB.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';
import { transformOrValidateRecordId, transformRecordId } from '../../../src/query/transformers/data-transformer';

describe('CerialId Send Transformation', () => {
  describe('transformRecordId', () => {
    test('transforms CerialId to RecordId', () => {
      const cerialId = new CerialId('user:abc123');
      const result = transformRecordId('user', cerialId);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc123');
    });

    test('transforms plain string to RecordId', () => {
      const result = transformRecordId('user', 'abc123');
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc123');
    });

    test('transforms RecordId (passthrough with validation)', () => {
      const original = new RecordId('user', 'abc123');
      const result = transformRecordId('user', original);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
    });

    test('transforms StringRecordId to RecordId', () => {
      const stringRecordId = new StringRecordId('user:abc123');
      const result = transformRecordId('user', stringRecordId);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc123');
    });
  });

  describe('transformOrValidateRecordId', () => {
    describe('with CerialId input', () => {
      test('validates matching table', () => {
        const cerialId = new CerialId('user:abc123');
        const result = transformOrValidateRecordId('user', cerialId);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('throws on table mismatch', () => {
        const cerialId = new CerialId('other:abc123');
        expect(() => transformOrValidateRecordId('user', cerialId)).toThrow(
          'CerialId table "other" does not match expected table "user"',
        );
      });

      test('sets table when CerialId has no table', () => {
        const cerialId = new CerialId('abc123');
        const result = transformOrValidateRecordId('user', cerialId);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });
    });

    describe('with RecordId input', () => {
      test('validates matching table', () => {
        const recordId = new RecordId('user', 'abc123');
        const result = transformOrValidateRecordId('user', recordId);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
      });

      test('throws on table mismatch', () => {
        const recordId = new RecordId('other', 'abc123');
        expect(() => transformOrValidateRecordId('user', recordId)).toThrow(
          'RecordId table "other" does not match expected table "user"',
        );
      });
    });

    describe('with StringRecordId input', () => {
      test('parses and validates', () => {
        const stringRecordId = new StringRecordId('user:abc123');
        const result = transformOrValidateRecordId('user', stringRecordId);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('throws on table mismatch', () => {
        const stringRecordId = new StringRecordId('other:abc123');
        expect(() => transformOrValidateRecordId('user', stringRecordId)).toThrow(
          'Table "other" does not match expected table "user"',
        );
      });
    });

    describe('with string input', () => {
      test('parses table:id format and validates', () => {
        const result = transformOrValidateRecordId('user', 'user:abc123');
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('creates RecordId from plain id with expected table', () => {
        const result = transformOrValidateRecordId('user', 'abc123');
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('throws on table mismatch in string', () => {
        expect(() => transformOrValidateRecordId('user', 'other:abc123')).toThrow(
          'Table "other" does not match expected table "user"',
        );
      });
    });
  });

  describe('array transformation', () => {
    test('transforms array of CerialIds', () => {
      const ids = [new CerialId('user:abc'), new CerialId('user:def'), new CerialId('user:ghi')];

      const results = ids.map((id) => transformOrValidateRecordId('user', id));
      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
      });
    });

    test('transforms mixed input types', () => {
      const inputs = [
        new CerialId('user:abc'),
        new RecordId('user', 'def'),
        new StringRecordId('user:ghi'),
        'user:jkl',
        'mno', // plain id
      ];

      const results = inputs.map((input) => transformOrValidateRecordId('user', input));
      expect(results).toHaveLength(5);
      expect(results.map((r) => r.id)).toEqual(['abc', 'def', 'ghi', 'jkl', 'mno']);
    });
  });

  describe('special character handling', () => {
    test('handles table with dash', () => {
      const cerialId = new CerialId('test-table:abc');
      const result = transformOrValidateRecordId('test-table', cerialId);
      expect(result.table.name).toBe('test-table');
      expect(result.id).toBe('abc');
    });

    test('handles id with dash', () => {
      const cerialId = new CerialId('user:my-id');
      const result = transformOrValidateRecordId('user', cerialId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('my-id');
    });

    test('handles UUID-style id', () => {
      const cerialId = new CerialId('user:550e8400-e29b-41d4-a716-446655440000');
      const result = transformOrValidateRecordId('user', cerialId);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
