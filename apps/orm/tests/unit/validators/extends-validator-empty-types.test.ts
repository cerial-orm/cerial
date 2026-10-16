/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateEmptyTypes, validateExtends } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, field, literal, model, obj, tuple, tupleElement } from './helpers';

describe('validateEmptyTypes', () => {
  describe('models', () => {
    test('empty model without extends → error', () => {
      const a = ast({ models: [model({ name: 'Empty', fields: [] })] });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Empty');
      expect(errors[0]!.message).toContain('no fields');
      expect(errors[0]!.model).toBe('Empty');
    });

    test('empty model with extends → no error', () => {
      const a = ast({
        models: [
          model({ name: 'Base', abstract: true, fields: [field({ name: 'id' })] }),
          model({ name: 'Child', fields: [], extends: 'Base' }),
        ],
      });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(0);
    });

    test('model with fields and no extends → no error', () => {
      const a = ast({ models: [model({ name: 'Valid', fields: [field({ name: 'id' })] })] });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });

    test('abstract empty model without extends → error', () => {
      const a = ast({ models: [model({ name: 'AbsEmpty', abstract: true, fields: [] })] });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('AbsEmpty');
    });
  });

  describe('objects', () => {
    test('empty object without extends → error', () => {
      const a = ast({ objects: [obj({ name: 'EmptyObj', fields: [] })] });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyObj');
      expect(errors[0]!.message).toContain('no fields');
    });

    test('empty object with extends → no error', () => {
      const a = ast({
        objects: [
          obj({ name: 'Base', fields: [field({ name: 'x' })] }),
          obj({ name: 'Child', fields: [], extends: 'Base' }),
        ],
      });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });

    test('object with fields → no error', () => {
      const a = ast({ objects: [obj({ name: 'Valid', fields: [field({ name: 'x' })] })] });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });
  });

  describe('tuples', () => {
    test('empty tuple without extends → error', () => {
      const a = ast({ tuples: [tuple({ name: 'EmptyTup', elements: [] })] });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyTup');
      expect(errors[0]!.message).toContain('no elements');
    });

    test('empty tuple with extends → no error', () => {
      const a = ast({
        tuples: [
          tuple({ name: 'Base', elements: [tupleElement()] }),
          tuple({ name: 'Child', elements: [], extends: 'Base' }),
        ],
      });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });

    test('tuple with elements → no error', () => {
      const a = ast({ tuples: [tuple({ name: 'Valid', elements: [tupleElement()] })] });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });
  });

  describe('enums', () => {
    test('empty enum without extends → error', () => {
      const a = ast({ enums: [enumNode({ name: 'EmptyEn', values: [] })] });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyEn');
      expect(errors[0]!.message).toContain('no values');
    });

    test('empty enum with extends → no error', () => {
      const a = ast({
        enums: [enumNode({ name: 'Base', values: ['A'] }), enumNode({ name: 'Child', values: [], extends: 'Base' })],
      });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });

    test('enum with values → no error', () => {
      const a = ast({ enums: [enumNode({ name: 'Valid', values: ['X'] })] });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });
  });

  describe('literals', () => {
    test('empty literal without extends → error', () => {
      const a = ast({ literals: [literal({ name: 'EmptyLit', variants: [] })] });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyLit');
      expect(errors[0]!.message).toContain('no variants');
    });

    test('empty literal with extends → no error', () => {
      const a = ast({
        literals: [
          literal({ name: 'Base', variants: [{ kind: 'string', value: 'a' }] }),
          literal({ name: 'Child', variants: [], extends: 'Base' }),
        ],
      });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });

    test('literal with variants → no error', () => {
      const a = ast({
        literals: [literal({ name: 'Valid', variants: [{ kind: 'string', value: 'x' }] })],
      });
      expect(validateEmptyTypes(a)).toHaveLength(0);
    });
  });

  describe('multiple empty types at once', () => {
    test('reports errors for all empty types', () => {
      const a = ast({
        models: [model({ name: 'EmptyModel', fields: [] })],
        objects: [obj({ name: 'EmptyObj', fields: [] })],
        tuples: [tuple({ name: 'EmptyTup', elements: [] })],
        enums: [enumNode({ name: 'EmptyEn', values: [] })],
        literals: [literal({ name: 'EmptyLit', variants: [] })],
      });
      const errors = validateEmptyTypes(a);
      expect(errors).toHaveLength(5);
    });
  });

  describe('integration with validateExtends orchestrator', () => {
    test('empty model without extends is caught by validateExtends', () => {
      const a = ast({ models: [model({ name: 'Empty', fields: [] })] });
      const errors = validateExtends(a);
      expect(errors.some((e) => e.message.includes('no fields'))).toBe(true);
    });
  });
});

// ── validateResolvedTypes (Rule 2: post-resolution) ─────────────────────
