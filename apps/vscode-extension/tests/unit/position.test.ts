import { describe, expect, it } from 'bun:test';
import { cerialRangeToLsp, cerialToLsp, lspRangeToCerial, lspToCerial } from '../../server/src/utils/position';

describe('Position Conversion', () => {
  describe('cerialToLsp', () => {
    it('should convert origin position (line 1 → line 0)', () => {
      const result = cerialToLsp({ line: 1, column: 0, offset: 0 });
      expect(result).toEqual({ line: 0, character: 0 });
    });

    it('should subtract 1 from line and preserve column as character', () => {
      const result = cerialToLsp({ line: 5, column: 10, offset: 50 });
      expect(result).toEqual({ line: 4, character: 10 });
    });

    it('should handle large line numbers', () => {
      const result = cerialToLsp({ line: 1000, column: 42, offset: 9999 });
      expect(result).toEqual({ line: 999, character: 42 });
    });

    it('should discard offset (not present in LSP position)', () => {
      const a = cerialToLsp({ line: 3, column: 5, offset: 100 });
      const b = cerialToLsp({ line: 3, column: 5, offset: 200 });
      expect(a).toEqual(b);
    });
  });

  describe('lspToCerial', () => {
    it('should convert origin position (line 0 → line 1)', () => {
      const result = lspToCerial({ line: 0, character: 0 });
      expect(result).toEqual({ line: 1, column: 0, offset: 0 });
    });

    it('should add 1 to line and preserve character as column', () => {
      const result = lspToCerial({ line: 4, character: 10 });
      expect(result).toEqual({ line: 5, column: 10, offset: 0 });
    });

    it('should always set offset to 0', () => {
      const result = lspToCerial({ line: 99, character: 50 });
      expect(result.offset).toBe(0);
    });

    it('should handle large line numbers', () => {
      const result = lspToCerial({ line: 999, character: 42 });
      expect(result).toEqual({ line: 1000, column: 42, offset: 0 });
    });
  });

  describe('roundtrip', () => {
    it('should preserve line and column through cerialToLsp → lspToCerial', () => {
      const original = { line: 7, column: 15, offset: 120 };
      const roundtripped = lspToCerial(cerialToLsp(original));
      expect(roundtripped.line).toBe(original.line);
      expect(roundtripped.column).toBe(original.column);
      // offset is lost (set to 0) since LSP positions don't carry it
      expect(roundtripped.offset).toBe(0);
    });

    it('should preserve line and character through lspToCerial → cerialToLsp', () => {
      const original = { line: 12, character: 30 };
      const roundtripped = cerialToLsp(lspToCerial(original));
      expect(roundtripped.line).toBe(original.line);
      expect(roundtripped.character).toBe(original.character);
    });

    it('should roundtrip multiple positions consistently', () => {
      const positions = [
        { line: 1, column: 0, offset: 0 },
        { line: 50, column: 25, offset: 500 },
        { line: 100, column: 80, offset: 3000 },
      ];
      for (const pos of positions) {
        const rt = lspToCerial(cerialToLsp(pos));
        expect(rt.line).toBe(pos.line);
        expect(rt.column).toBe(pos.column);
      }
    });
  });

  describe('cerialRangeToLsp', () => {
    it('should convert both start and end positions', () => {
      const result = cerialRangeToLsp({
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 10, offset: 10 },
      });
      expect(result).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      });
    });

    it('should handle multi-line ranges', () => {
      const result = cerialRangeToLsp({
        start: { line: 5, column: 2, offset: 40 },
        end: { line: 10, column: 15, offset: 120 },
      });
      expect(result).toEqual({
        start: { line: 4, character: 2 },
        end: { line: 9, character: 15 },
      });
    });
  });

  describe('lspRangeToCerial', () => {
    it('should convert both start and end positions', () => {
      const result = lspRangeToCerial({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      });
      expect(result).toEqual({
        start: { line: 1, column: 0, offset: 0 },
        end: { line: 1, column: 10, offset: 0 },
      });
    });

    it('should handle multi-line ranges', () => {
      const result = lspRangeToCerial({
        start: { line: 4, character: 2 },
        end: { line: 9, character: 15 },
      });
      expect(result).toEqual({
        start: { line: 5, column: 2, offset: 0 },
        end: { line: 10, column: 15, offset: 0 },
      });
    });
  });

  describe('range roundtrip', () => {
    it('should preserve range through cerialRangeToLsp → lspRangeToCerial', () => {
      const original = {
        start: { line: 3, column: 5, offset: 30 },
        end: { line: 8, column: 20, offset: 100 },
      };
      const roundtripped = lspRangeToCerial(cerialRangeToLsp(original));
      expect(roundtripped.start.line).toBe(original.start.line);
      expect(roundtripped.start.column).toBe(original.start.column);
      expect(roundtripped.end.line).toBe(original.end.line);
      expect(roundtripped.end.column).toBe(original.end.column);
      // offsets reset to 0
      expect(roundtripped.start.offset).toBe(0);
      expect(roundtripped.end.offset).toBe(0);
    });

    it('should preserve range through lspRangeToCerial → cerialRangeToLsp', () => {
      const original = {
        start: { line: 0, character: 0 },
        end: { line: 20, character: 45 },
      };
      const roundtripped = cerialRangeToLsp(lspRangeToCerial(original));
      expect(roundtripped).toEqual(original);
    });
  });
});
