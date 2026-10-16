/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateExtendsTargetExists } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, field, literal, model, obj, tuple, tupleElement } from './helpers';

describe('validateExtendsTargetExists', () => {
  test('should pass when model extends existing model', () => {
    const a = ast({
      models: [model({ name: 'Base', fields: [field({ name: 'name' })] }), model({ name: 'Child', extends: 'Base' })],
    });
    expect(validateExtendsTargetExists(a)).toHaveLength(0);
  });

  test('should fail when model extends non-existent model', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'NonExistent' })],
    });
    const errors = validateExtendsTargetExists(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('NonExistent');
    expect(errors[0]!.message).toContain('Child');
  });

  test('should pass when object extends existing object', () => {
    const a = ast({
      objects: [
        obj({ name: 'BaseAddr', fields: [field({ name: 'street' })] }),
        obj({ name: 'FullAddr', extends: 'BaseAddr' }),
      ],
    });
    expect(validateExtendsTargetExists(a)).toHaveLength(0);
  });

  test('should fail when object extends non-existent object', () => {
    const a = ast({
      objects: [obj({ name: 'Child', extends: 'Missing' })],
    });
    const errors = validateExtendsTargetExists(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Missing');
  });

  test('should pass when tuple extends existing tuple', () => {
    const a = ast({
      tuples: [
        tuple({ name: 'BaseTuple', elements: [tupleElement()] }),
        tuple({ name: 'ChildTuple', extends: 'BaseTuple' }),
      ],
    });
    expect(validateExtendsTargetExists(a)).toHaveLength(0);
  });

  test('should fail when tuple extends non-existent tuple', () => {
    const a = ast({
      tuples: [tuple({ name: 'Child', extends: 'Nope' })],
    });
    const errors = validateExtendsTargetExists(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Nope');
  });

  test('should pass when enum extends existing enum', () => {
    const a = ast({
      enums: [enumNode({ name: 'BaseEnum', values: ['A', 'B'] }), enumNode({ name: 'ChildEnum', extends: 'BaseEnum' })],
    });
    expect(validateExtendsTargetExists(a)).toHaveLength(0);
  });

  test('should fail when enum extends non-existent enum', () => {
    const a = ast({
      enums: [enumNode({ name: 'Child', extends: 'Gone' })],
    });
    const errors = validateExtendsTargetExists(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Gone');
  });

  test('should pass when literal extends existing literal', () => {
    const a = ast({
      literals: [
        literal({ name: 'BaseLit', variants: [{ kind: 'string', value: 'a' }] }),
        literal({ name: 'ChildLit', extends: 'BaseLit' }),
      ],
    });
    expect(validateExtendsTargetExists(a)).toHaveLength(0);
  });

  test('should fail when literal extends non-existent literal', () => {
    const a = ast({
      literals: [literal({ name: 'Child', extends: 'Missing' })],
    });
    const errors = validateExtendsTargetExists(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Missing');
  });

  test('should not report error for types without extends', () => {
    const a = ast({
      models: [model({ name: 'A' })],
      objects: [obj({ name: 'B' })],
      tuples: [tuple({ name: 'C' })],
      enums: [enumNode({ name: 'D' })],
      literals: [literal({ name: 'E' })],
    });
    expect(validateExtendsTargetExists(a)).toHaveLength(0);
  });

  describe('edge cases', () => {
    test('multiple missing targets across different kinds', () => {
      const a = ast({
        models: [model({ name: 'M', extends: 'GhostModel' })],
        objects: [obj({ name: 'O', extends: 'GhostObj' })],
        enums: [enumNode({ name: 'E', extends: 'GhostEnum' })],
      });
      const errors = validateExtendsTargetExists(a);
      expect(errors.length).toBe(3);
    });

    test('model extends another model later in array → OK', () => {
      const a = ast({
        models: [model({ name: 'Child', extends: 'Base' }), model({ name: 'Base', fields: [field({ name: 'x' })] })],
      });
      expect(validateExtendsTargetExists(a)).toHaveLength(0);
    });
  });
});

// ── validateNoCrossKindExtends ──────────────────────────────────────────
