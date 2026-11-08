/**
 * Unit Tests: CerialId Send Transformation
 *
 * Tests for transforming RecordIdInput types when sending to SurrealDB.
 */

import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId } from 'surrealdb';
import { transformOrValidateRecordId } from '../../../src/query/transformers/data-transformer';
import { CerialId } from '../../../src/utils/cerial-id';

describe('CerialId Send Transformation', () => {
  describe('transformRecordId', () => {
    test('transforms CerialId to RecordId', () => {
      const cerialId = new CerialId('user:abc123');
      const result = transformOrValidateRecordId('user', cerialId, undefined);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc123');
    });

    test('transforms plain string to RecordId', () => {
      const result = transformOrValidateRecordId('user', 'abc123', undefined);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc123');
    });

    test('transforms RecordId (passthrough with validation)', () => {
      const original = new RecordId('user', 'abc123');
      const result = transformOrValidateRecordId('user', original, undefined);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
    });

    test('sends a StringRecordId unparsed, so the server reads its key', () => {
      const stringRecordId = new StringRecordId('user:abc123');
      const result = transformOrValidateRecordId('user', stringRecordId, undefined);
      expect(result).toBe(stringRecordId);
    });
  });

  describe('transformOrValidateRecordId', () => {
    describe('with CerialId input', () => {
      test('validates matching table', () => {
        const cerialId = new CerialId('user:abc123');
        const result = transformOrValidateRecordId('user', cerialId, undefined);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('throws on table mismatch', () => {
        const cerialId = new CerialId('other:abc123');
        expect(() => transformOrValidateRecordId('user', cerialId, undefined)).toThrow(
          'CerialId table "other" does not match expected table "user"',
        );
      });

      test('sets table when CerialId has no table', () => {
        const cerialId = new CerialId('abc123');
        const result = transformOrValidateRecordId('user', cerialId, undefined);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });
    });

    describe('with RecordId input', () => {
      test('validates matching table', () => {
        const recordId = new RecordId('user', 'abc123');
        const result = transformOrValidateRecordId('user', recordId, undefined);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
      });

      test('throws on table mismatch', () => {
        const recordId = new RecordId('other', 'abc123');
        expect(() => transformOrValidateRecordId('user', recordId, undefined)).toThrow(
          'RecordId table "other" does not match expected table "user"',
        );
      });
    });

    describe('with StringRecordId input', () => {
      test('checks the table and passes the value on unparsed', () => {
        const stringRecordId = new StringRecordId('user:abc123');
        expect(transformOrValidateRecordId('user', stringRecordId, undefined)).toBe(stringRecordId);
      });

      test('keeps an int key an int for the server to read', () => {
        const stringRecordId = new StringRecordId('int_id:1');
        const result = transformOrValidateRecordId('int_id', stringRecordId, ['int']);
        expect(String(result)).toBe('int_id:1');
        expect(result).not.toBeInstanceOf(RecordId);
      });

      test('throws on a string that names no table', () => {
        expect(() => transformOrValidateRecordId('user', new StringRecordId('abc123'), undefined)).toThrow(
          'does not name its table',
        );
      });

      test('throws on table mismatch', () => {
        const stringRecordId = new StringRecordId('other:abc123');
        expect(() => transformOrValidateRecordId('user', stringRecordId, undefined)).toThrow(
          'Table "other" does not match expected table "user"',
        );
      });
    });

    describe('with string input', () => {
      test('parses table:id format and validates', () => {
        const result = transformOrValidateRecordId('user', 'user:abc123', undefined);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('creates RecordId from plain id with expected table', () => {
        const result = transformOrValidateRecordId('user', 'abc123', undefined);
        expect(result).toBeInstanceOf(RecordId);
        expect(result.table.name).toBe('user');
        expect(result.id).toBe('abc123');
      });

      test('throws on table mismatch in string', () => {
        expect(() => transformOrValidateRecordId('user', 'other:abc123', undefined)).toThrow(
          'Table "other" does not match expected table "user"',
        );
      });
    });
  });

  describe('array transformation', () => {
    test('transforms array of CerialIds', () => {
      const ids = [new CerialId('user:abc'), new CerialId('user:def'), new CerialId('user:ghi')];

      const results = ids.map((id) => transformOrValidateRecordId('user', id, undefined));
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

      const results = inputs.map((input) => transformOrValidateRecordId('user', input, undefined));
      expect(results).toHaveLength(5);
      expect(results.map((r) => String(r))).toEqual(['user:abc', 'user:def', 'user:ghi', 'user:jkl', 'user:mno']);
    });
  });

  describe('special character handling', () => {
    test('handles table with dash', () => {
      const cerialId = new CerialId('test-table:abc');
      const result = transformOrValidateRecordId('test-table', cerialId, undefined);
      expect(result.table.name).toBe('test-table');
      expect(result.id).toBe('abc');
    });

    test('handles id with dash', () => {
      const cerialId = new CerialId('user:my-id');
      const result = transformOrValidateRecordId('user', cerialId, undefined);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('my-id');
    });

    test('handles UUID-style id', () => {
      const cerialId = new CerialId('user:550e8400-e29b-41d4-a716-446655440000');
      const result = transformOrValidateRecordId('user', cerialId, undefined);
      expect(result.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
