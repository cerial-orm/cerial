/**
 * Unit Tests: Extends/Abstract Parser
 *
 * Tests parsing of `abstract model`, `extends`, pick/omit bracket syntax
 * across all type kinds (model, object, tuple, enum, literal).
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import {
  isMixedPickOmit,
  parseExtendsBracket,
  parseModelDeclaration,
} from '../../../src/parser/types/model/model-declaration-parser';

describe('Extends Parser', () => {
  // ──────────────────────────────────────────────
  // H0. parseExtendsBracket unit tests
  // ──────────────────────────────────────────────
  describe('parseExtendsBracket', () => {
    test('should return empty pick filter for empty string', () => {
      expect(parseExtendsBracket('')).toEqual({ mode: 'pick', fields: [] });
    });

    test('should return empty pick filter for whitespace-only string', () => {
      expect(parseExtendsBracket('  ')).toEqual({ mode: 'pick', fields: [] });
    });

    test('should return pick filter for single field', () => {
      expect(parseExtendsBracket('id')).toEqual({ mode: 'pick', fields: ['id'] });
    });

    test('should return omit filter for single omit field', () => {
      expect(parseExtendsBracket('!id')).toEqual({ mode: 'omit', fields: ['id'] });
    });

    test('should return pick filter for multiple fields', () => {
      expect(parseExtendsBracket('id, name')).toEqual({ mode: 'pick', fields: ['id', 'name'] });
    });

    test('should return undefined for mixed pick/omit', () => {
      expect(parseExtendsBracket('id, !name')).toBeUndefined();
    });

    describe('isMixedPickOmit', () => {
      test('should return false for empty string', () => {
        expect(isMixedPickOmit('')).toBe(false);
      });

      test('should return false for pick-only items', () => {
        expect(isMixedPickOmit('id, name')).toBe(false);
      });

      test('should return false for omit-only items', () => {
        expect(isMixedPickOmit('!id, !name')).toBe(false);
      });

      test('should return true for mixed pick and omit', () => {
        expect(isMixedPickOmit('id, !name')).toBe(true);
      });

      test('should return true for mixed omit and pick', () => {
        expect(isMixedPickOmit('!id, name')).toBe(true);
      });

      test('should return true for multiple mixed items', () => {
        expect(isMixedPickOmit('id, name, !secret, !password')).toBe(true);
      });
    });
  });

  // ──────────────────────────────────────────────
  // H. Pick/Omit bracket edge cases
  // ──────────────────────────────────────────────
  describe('bracket parsing edge cases', () => {
    test('should handle spaces in bracket list', () => {
      const result = parseModelDeclaration('model X extends Base[ id , name , email ] {');
      expect(result).not.toBeNull();
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: ['id', 'name', 'email'] });
    });

    test('should handle spaces in omit bracket list', () => {
      const result = parseModelDeclaration('model X extends Base[ !id , !name ] {');
      expect(result).not.toBeNull();
      expect(result!.extendsFilter).toEqual({ mode: 'omit', fields: ['id', 'name'] });
    });

    test('should handle extends without brackets', () => {
      const result = parseModelDeclaration('model X extends Base {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Base');
      expect(result!.extendsFilter).toBeUndefined();
    });

    test('should parse empty brackets as empty pick filter', () => {
      const result = parseModelDeclaration('model X extends Y[] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Y');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });

    test('should parse whitespace-only brackets as empty pick filter', () => {
      const result = parseModelDeclaration('model X extends Y[  ] {');
      expect(result).not.toBeNull();
      expect(result!.extends_).toBe('Y');
      expect(result!.extendsFilter).toEqual({ mode: 'pick', fields: [] });
    });

    test('should handle multi-level chain parsing', () => {
      const schema = `
abstract model L1 {
  id Record @id
}

abstract model L2 extends L1 {
  name String
}

model L3 extends L2 {
  email Email
}
`;
      const { ast, errors } = parse(schema);
      expect(errors).toHaveLength(0);
      expect(ast.models).toHaveLength(3);
      expect(ast.models[0]!.abstract).toBe(true);
      expect(ast.models[1]!.abstract).toBe(true);
      expect(ast.models[1]!.extends).toBe('L1');
      expect(ast.models[2]!.abstract).toBeUndefined();
      expect(ast.models[2]!.extends).toBe('L2');
    });
  });
});
