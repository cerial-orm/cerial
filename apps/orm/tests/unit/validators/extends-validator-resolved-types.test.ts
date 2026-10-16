/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateResolvedTypes } from '../../../src/cli/validators/extends-validator';
import { resolveInheritance } from '../../../src/resolver/inheritance-resolver';
import { _dec, ast, enumNode, field, literal, model, obj, tuple, tupleElement } from './helpers';

describe('validateResolvedTypes', () => {
  describe('models', () => {
    test('model with 0 fields after resolution → error', () => {
      const a = ast({ models: [model({ name: 'Stripped', fields: [] })] });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Stripped');
      expect(errors[0]!.message).toContain('after inheritance resolution');
      expect(errors[0]!.model).toBe('Stripped');
    });

    test('model with fields after resolution → no error', () => {
      const a = ast({ models: [model({ name: 'Valid', fields: [field({ name: 'id', decorators: [_dec('id')] })] })] });
      expect(validateResolvedTypes(a)).toHaveLength(0);
    });

    test('abstract model with 0 fields after resolution → error', () => {
      const a = ast({ models: [model({ name: 'AbsEmpty', abstract: true, fields: [] })] });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('AbsEmpty');
    });
  });

  describe('objects', () => {
    test('object with 0 fields after resolution → error', () => {
      const a = ast({ objects: [obj({ name: 'EmptyObj', fields: [] })] });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyObj');
      expect(errors[0]!.message).toContain('after inheritance resolution');
    });

    test('object with fields → no error', () => {
      const a = ast({ objects: [obj({ name: 'Valid', fields: [field({ name: 'x' })] })] });
      expect(validateResolvedTypes(a)).toHaveLength(0);
    });
  });

  describe('tuples', () => {
    test('tuple with 0 elements after resolution → error', () => {
      const a = ast({ tuples: [tuple({ name: 'EmptyTup', elements: [] })] });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyTup');
      expect(errors[0]!.message).toContain('after inheritance resolution');
    });

    test('tuple with elements → no error', () => {
      const a = ast({ tuples: [tuple({ name: 'Valid', elements: [tupleElement()] })] });
      expect(validateResolvedTypes(a)).toHaveLength(0);
    });
  });

  describe('enums', () => {
    test('enum with 0 values after resolution → error', () => {
      const a = ast({ enums: [enumNode({ name: 'EmptyEn', values: [] })] });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyEn');
      expect(errors[0]!.message).toContain('after inheritance resolution');
    });

    test('enum with values → no error', () => {
      const a = ast({ enums: [enumNode({ name: 'Valid', values: ['X'] })] });
      expect(validateResolvedTypes(a)).toHaveLength(0);
    });
  });

  describe('literals', () => {
    test('literal with 0 variants after resolution → error', () => {
      const a = ast({ literals: [literal({ name: 'EmptyLit', variants: [] })] });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('EmptyLit');
      expect(errors[0]!.message).toContain('after inheritance resolution');
    });

    test('literal with variants → no error', () => {
      const a = ast({
        literals: [literal({ name: 'Valid', variants: [{ kind: 'string', value: 'x' }] })],
      });
      expect(validateResolvedTypes(a)).toHaveLength(0);
    });
  });

  describe('multiple empty resolved types', () => {
    test('reports errors for all empty types', () => {
      const a = ast({
        models: [model({ name: 'M', fields: [] })],
        objects: [obj({ name: 'O', fields: [] })],
        tuples: [tuple({ name: 'T', elements: [] })],
        enums: [enumNode({ name: 'E', values: [] })],
        literals: [literal({ name: 'L', variants: [] })],
      });
      const errors = validateResolvedTypes(a);
      expect(errors).toHaveLength(5);
    });
  });

  describe('full pipeline: resolveInheritance → validateResolvedTypes', () => {
    test('concrete model with empty body inheriting from abstract parent should NOT error', () => {
      const rawAst = ast({
        models: [
          model({
            name: 'ConvBaseEntity',
            abstract: true,
            fields: [
              field({ name: 'id', type: 'record', decorators: [_dec('id')], isPrivate: true }),
              field({ name: 'createdAt', type: 'date', decorators: [_dec('createdAt')], isPrivate: true }),
              field({ name: 'updatedAt', type: 'date', decorators: [_dec('updatedAt')] }),
            ],
          }),
          model({
            name: 'ConvEmptyChild',
            extends: 'ConvBaseEntity',
            fields: [],
          }),
        ],
      });

      const resolved = resolveInheritance(rawAst);

      // After resolution, the child should have inherited all 3 parent fields
      const child = resolved.models.find((m) => m.name === 'ConvEmptyChild');
      expect(child).toBeDefined();
      expect(child!.fields).toHaveLength(3);

      // validateResolvedTypes should produce no errors
      const errors = validateResolvedTypes(resolved);
      expect(errors).toHaveLength(0);
    });

    test('model with no fields and no extends SHOULD error after resolution', () => {
      const rawAst = ast({
        models: [model({ name: 'TrulyEmpty', fields: [] })],
      });

      const resolved = resolveInheritance(rawAst);
      const errors = validateResolvedTypes(resolved);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('TrulyEmpty');
    });

    test('child model with own fields + inherited fields passes validation', () => {
      const rawAst = ast({
        models: [
          model({
            name: 'BaseEntity',
            abstract: true,
            fields: [
              field({ name: 'id', type: 'record', decorators: [_dec('id')] }),
              field({ name: 'createdAt', type: 'date', decorators: [_dec('createdAt')] }),
            ],
          }),
          model({
            name: 'User',
            extends: 'BaseEntity',
            fields: [field({ name: 'name', type: 'string' })],
          }),
        ],
      });

      const resolved = resolveInheritance(rawAst);
      const child = resolved.models.find((m) => m.name === 'User');
      expect(child!.fields).toHaveLength(3);
      expect(validateResolvedTypes(resolved)).toHaveLength(0);
    });
  });
});

// ── Post-resolution @id check ─────────────────────────────────────────

describe('post-resolution @id check (validateResolvedTypes)', () => {
  test('concrete model that inherited @id from parent → no error', () => {
    const rawAst = ast({
      models: [
        model({
          name: 'Base',
          abstract: true,
          fields: [
            field({ name: 'id', type: 'record', decorators: [_dec('id')] }),
            field({ name: 'name', type: 'string' }),
          ],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [],
        }),
      ],
    });

    const resolved = resolveInheritance(rawAst);
    const errors = validateResolvedTypes(resolved);
    expect(errors).toHaveLength(0);
  });

  test('concrete model that picked fields excluding @id → SHOULD error', () => {
    const rawAst = ast({
      models: [
        model({
          name: 'ConvBaseEntity',
          abstract: true,
          fields: [
            field({ name: 'id', type: 'record', decorators: [_dec('id')], isPrivate: true }),
            field({ name: 'createdAt', type: 'date', decorators: [_dec('createdAt')], isPrivate: true }),
            field({ name: 'updatedAt', type: 'date', decorators: [_dec('updatedAt')] }),
          ],
        }),
        model({
          name: 'ConvMinimalEntity',
          extends: 'ConvBaseEntity',
          extendsFilter: { mode: 'pick', fields: ['createdAt'] },
          fields: [
            field({ name: 'label', type: 'string' }),
            field({ name: 'notes', type: 'string', isOptional: true }),
          ],
        }),
      ],
    });

    const resolved = resolveInheritance(rawAst);
    const errors = validateResolvedTypes(resolved);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('ConvMinimalEntity');
    expect(errors[0]!.message).toContain('@id');
  });

  test('abstract model without @id after resolution → no error', () => {
    const rawAst = ast({
      models: [
        model({
          name: 'AbstractBase',
          abstract: true,
          fields: [field({ name: 'name', type: 'string' })],
        }),
      ],
    });

    const resolved = resolveInheritance(rawAst);
    const errors = validateResolvedTypes(resolved);
    // Abstract models don't generate tables and don't need @id
    expect(errors).toHaveLength(0);
  });

  test('concrete model with own @id field (no extends) → no error', () => {
    const rawAst = ast({
      models: [
        model({
          name: 'User',
          fields: [
            field({ name: 'id', type: 'record', decorators: [_dec('id')] }),
            field({ name: 'name', type: 'string' }),
          ],
        }),
      ],
    });

    const resolved = resolveInheritance(rawAst);
    const errors = validateResolvedTypes(resolved);
    expect(errors).toHaveLength(0);
  });

  test('concrete model without @id and without extends → SHOULD error', () => {
    const rawAst = ast({
      models: [
        model({
          name: 'NoId',
          fields: [field({ name: 'name', type: 'string' })],
        }),
      ],
    });

    const resolved = resolveInheritance(rawAst);
    const errors = validateResolvedTypes(resolved);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('NoId');
    expect(errors[0]!.message).toContain('@id');
  });

  test('concrete model with omit excluding @id → SHOULD error', () => {
    const rawAst = ast({
      models: [
        model({
          name: 'Base',
          abstract: true,
          fields: [
            field({ name: 'id', type: 'record', decorators: [_dec('id')] }),
            field({ name: 'name', type: 'string' }),
            field({ name: 'email', type: 'email' }),
          ],
        }),
        model({
          name: 'NoIdChild',
          extends: 'Base',
          extendsFilter: { mode: 'omit', fields: ['id'] },
          fields: [],
        }),
      ],
    });

    const resolved = resolveInheritance(rawAst);
    const errors = validateResolvedTypes(resolved);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('NoIdChild');
    expect(errors[0]!.message).toContain('@id');
  });
});
