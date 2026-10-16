/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateNoCrossKindExtends } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, literal, model, obj, tuple } from './helpers';

describe('validateNoCrossKindExtends', () => {
  test('should fail when model extends an object name', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Address' })],
      objects: [obj({ name: 'Address' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('object');
    expect(errors[0]!.message).toContain('Child');
  });

  test('should fail when model extends a tuple name', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Coord' })],
      tuples: [tuple({ name: 'Coord' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('tuple');
  });

  test('should fail when model extends an enum name', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Role' })],
      enums: [enumNode({ name: 'Role' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('enum');
  });

  test('should fail when model extends a literal name', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Status' })],
      literals: [literal({ name: 'Status' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('literal');
  });

  test('should fail when object extends a model name', () => {
    const a = ast({
      objects: [obj({ name: 'Child', extends: 'User' })],
      models: [model({ name: 'User' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('model');
  });

  test('should fail when tuple extends an object name', () => {
    const a = ast({
      tuples: [tuple({ name: 'Child', extends: 'Address' })],
      objects: [obj({ name: 'Address' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('object');
  });

  test('should fail when enum extends a model name', () => {
    const a = ast({
      enums: [enumNode({ name: 'Child', extends: 'User' })],
      models: [model({ name: 'User' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('model');
  });

  test('should fail when literal extends an enum name', () => {
    const a = ast({
      literals: [literal({ name: 'Child', extends: 'Role' })],
      enums: [enumNode({ name: 'Role' })],
    });
    const errors = validateNoCrossKindExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('enum');
  });

  test('should pass when model extends model (same kind)', () => {
    const a = ast({
      models: [model({ name: 'Base' }), model({ name: 'Child', extends: 'Base' })],
    });
    expect(validateNoCrossKindExtends(a)).toHaveLength(0);
  });

  test('should pass for types without extends', () => {
    const a = ast({
      models: [model({ name: 'A' })],
      objects: [obj({ name: 'B' })],
    });
    expect(validateNoCrossKindExtends(a)).toHaveLength(0);
  });

  test('should not report when target does not exist in any registry', () => {
    // validateExtendsTargetExists handles that case
    const a = ast({
      models: [model({ name: 'Child', extends: 'Phantom' })],
    });
    expect(validateNoCrossKindExtends(a)).toHaveLength(0);
  });

  describe('edge cases', () => {
    test('object extends a literal name → error mentions literal', () => {
      const a = ast({
        objects: [obj({ name: 'Child', extends: 'Status' })],
        literals: [literal({ name: 'Status' })],
      });
      const errors = validateNoCrossKindExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('literal');
      expect(errors[0]!.message).toContain('Child');
    });

    test('tuple extends a model name → error mentions model', () => {
      const a = ast({
        tuples: [tuple({ name: 'Child', extends: 'User' })],
        models: [model({ name: 'User' })],
      });
      const errors = validateNoCrossKindExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('model');
    });

    test('literal extends a tuple name → error mentions tuple', () => {
      const a = ast({
        literals: [literal({ name: 'Child', extends: 'Coord' })],
        tuples: [tuple({ name: 'Coord' })],
      });
      const errors = validateNoCrossKindExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('tuple');
    });

    test('multiple cross-kind violations → multiple errors', () => {
      const a = ast({
        models: [model({ name: 'M', extends: 'Target' })],
        objects: [obj({ name: 'O', extends: 'Target2' })],
        tuples: [tuple({ name: 'Target' }), tuple({ name: 'Target2' })],
      });
      const errors = validateNoCrossKindExtends(a);
      expect(errors.length).toBe(2);
    });

    test('same name in multiple non-own kinds → error mentions first found kind', () => {
      // 'Target' exists as both object and tuple; findCrossKind returns 'object' first
      const a = ast({
        models: [model({ name: 'Child', extends: 'Target' })],
        objects: [obj({ name: 'Target' })],
        tuples: [tuple({ name: 'Target' })],
      });
      const errors = validateNoCrossKindExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('object');
    });
  });
});

// ── validateNoCircularExtends ──────────────────────────────────────────
