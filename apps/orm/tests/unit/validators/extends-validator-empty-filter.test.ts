/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateEmptyExtendsFilter } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, literal, model, obj, tuple } from './helpers';

describe('validateEmptyExtendsFilter', () => {
  test('should fail when model has empty extends filter', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Base', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('empty extends filter brackets');
    expect(errors[0]!.message).toContain('Child');
  });

  test('should fail when object has empty extends filter', () => {
    const a = ast({
      objects: [obj({ name: 'ChildObj', extends: 'BaseObj', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('empty extends filter brackets');
    expect(errors[0]!.message).toContain('ChildObj');
  });

  test('should fail when tuple has empty extends filter', () => {
    const a = ast({
      tuples: [tuple({ name: 'ChildTup', extends: 'BaseTup', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('empty extends filter brackets');
    expect(errors[0]!.message).toContain('ChildTup');
  });

  test('should fail when enum has empty extends filter', () => {
    const a = ast({
      enums: [enumNode({ name: 'ChildEnum', extends: 'BaseEnum', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('empty extends filter brackets');
    expect(errors[0]!.message).toContain('ChildEnum');
  });

  test('should fail when literal has empty extends filter', () => {
    const a = ast({
      literals: [literal({ name: 'ChildLit', extends: 'BaseLit', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('empty extends filter brackets');
    expect(errors[0]!.message).toContain('ChildLit');
  });

  test('should pass when model has non-empty filter', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Base', extendsFilter: { mode: 'pick', fields: ['name'] } })],
    });
    expect(validateEmptyExtendsFilter(a)).toHaveLength(0);
  });

  test('should pass when model has no extendsFilter', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Base' })],
    });
    expect(validateEmptyExtendsFilter(a)).toHaveLength(0);
  });

  test('should pass when model has no extends at all', () => {
    const a = ast({
      models: [model({ name: 'Solo' })],
    });
    expect(validateEmptyExtendsFilter(a)).toHaveLength(0);
  });

  test('should report errors for multiple kinds simultaneously', () => {
    const a = ast({
      models: [model({ name: 'M', extends: 'X', extendsFilter: { mode: 'pick', fields: [] } })],
      objects: [obj({ name: 'O', extends: 'Y', extendsFilter: { mode: 'pick', fields: [] } })],
      tuples: [tuple({ name: 'T', extends: 'Z', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors.length).toBe(3);
  });

  test('error message suggests using extends without brackets', () => {
    const a = ast({
      models: [model({ name: 'Child', extends: 'Parent', extendsFilter: { mode: 'pick', fields: [] } })],
    });
    const errors = validateEmptyExtendsFilter(a);
    expect(errors[0]!.message).toContain('extends Parent');
    expect(errors[0]!.message).toContain('inherit all');
  });
});

// ── validateExtendsTargetExists ──────────────────────────────────────────
