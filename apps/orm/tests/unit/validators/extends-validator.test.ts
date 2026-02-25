/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateAbstractRules,
  validateEmptyExtendsFilter,
  validateEmptyTypes,
  validateExtends,
  validateExtendsTargetExists,
  validateNoCircularExtends,
  validateNoCrossKindExtends,
  validatePickOmitFields,
  validatePrivateOverride,
  validateResolvedTypes,
} from '../../../src/cli/validators/extends-validator';
import { resolveInheritance } from '../../../src/resolver/inheritance-resolver';
import type {
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  SchemaAST,
  SchemaDecorator,
} from '../../../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────

const range = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

function field(overrides: Partial<ASTField> = {}): ASTField {
  return {
    name: 'testField',
    type: 'string',
    isOptional: false,
    decorators: [],
    range,
    ...overrides,
  };
}

function _dec(type: SchemaDecorator, value?: unknown): ASTDecorator {
  return { type, value, range };
}

function model(overrides: Partial<ASTModel> = {}): ASTModel {
  return { name: 'TestModel', fields: [], range, ...overrides };
}

function obj(overrides: Partial<ASTObject> = {}): ASTObject {
  return { name: 'TestObject', fields: [], range, ...overrides };
}

function tuple(overrides: Partial<ASTTuple> = {}): ASTTuple {
  return { name: 'TestTuple', elements: [], range, ...overrides };
}

function literal(overrides: Partial<ASTLiteral> = {}): ASTLiteral {
  return { name: 'TestLiteral', variants: [], range, ...overrides };
}

function enumNode(overrides: Partial<ASTEnum> = {}): ASTEnum {
  return { name: 'TestEnum', values: [], range, ...overrides };
}

function tupleElement(overrides: Partial<ASTTupleElement> = {}): ASTTupleElement {
  return { type: 'string', isOptional: false, ...overrides };
}

function ast(overrides: Partial<SchemaAST> = {}): SchemaAST {
  return {
    models: [],
    objects: [],
    tuples: [],
    literals: [],
    enums: [],
    source: '',
    ...overrides,
  };
}

// ── validateEmptyExtendsFilter ───────────────────────────────────────────

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

describe('validateNoCircularExtends', () => {
  test('should detect self-reference', () => {
    const a = ast({
      models: [model({ name: 'A', extends: 'A' })],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Circular');
    expect(errors[0]!.message).toContain('A');
  });

  test('should detect two-node cycle in models', () => {
    const a = ast({
      models: [model({ name: 'A', extends: 'B' }), model({ name: 'B', extends: 'A' })],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.message).toMatch(/Circular/);
  });

  test('should detect three-node cycle in models', () => {
    const a = ast({
      models: [
        model({ name: 'A', extends: 'B' }),
        model({ name: 'B', extends: 'C' }),
        model({ name: 'C', extends: 'A' }),
      ],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(errors[0]!.message).toMatch(/A.*B.*C.*A|Circular/);
  });

  test('should pass for linear chain (no cycle)', () => {
    const a = ast({
      models: [model({ name: 'A' }), model({ name: 'B', extends: 'A' }), model({ name: 'C', extends: 'B' })],
    });
    expect(validateNoCircularExtends(a)).toHaveLength(0);
  });

  test('should detect cycle in objects', () => {
    const a = ast({
      objects: [obj({ name: 'X', extends: 'Y' }), obj({ name: 'Y', extends: 'X' })],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('should detect cycle in tuples', () => {
    const a = ast({
      tuples: [tuple({ name: 'T1', extends: 'T2' }), tuple({ name: 'T2', extends: 'T1' })],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('should detect cycle in enums', () => {
    const a = ast({
      enums: [enumNode({ name: 'E1', extends: 'E2' }), enumNode({ name: 'E2', extends: 'E1' })],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('should detect cycle in literals', () => {
    const a = ast({
      literals: [literal({ name: 'L1', extends: 'L2' }), literal({ name: 'L2', extends: 'L1' })],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('should pass when no extends are defined', () => {
    const a = ast({
      models: [model({ name: 'A' }), model({ name: 'B' })],
    });
    expect(validateNoCircularExtends(a)).toHaveLength(0);
  });

  test('should pass with diamond pattern (no cycle)', () => {
    // A → B, A → C, B → D, C → D (DAG, not cycle)
    const a = ast({
      models: [
        model({ name: 'D' }),
        model({ name: 'B', extends: 'D' }),
        model({ name: 'C', extends: 'D' }),
        // A can only extend one, so: A → B, and separately C → D is fine
        model({ name: 'A', extends: 'B' }),
      ],
    });
    expect(validateNoCircularExtends(a)).toHaveLength(0);
  });

  test('should report full cycle path', () => {
    const a = ast({
      models: [
        model({ name: 'Alpha', extends: 'Beta' }),
        model({ name: 'Beta', extends: 'Gamma' }),
        model({ name: 'Gamma', extends: 'Alpha' }),
      ],
    });
    const errors = validateNoCircularExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
    // Should contain the cycle path
    const msg = errors[0]!.message;
    expect(msg).toContain('Alpha');
    expect(msg).toContain('Beta');
    expect(msg).toContain('Gamma');
  });

  describe('self-reference per kind', () => {
    test('self-reference message contains "A → A"', () => {
      const a = ast({
        models: [model({ name: 'A', extends: 'A' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('A → A');
    });

    test('self-reference in objects', () => {
      const a = ast({
        objects: [obj({ name: 'Addr', extends: 'Addr' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('Addr → Addr');
    });

    test('self-reference in tuples', () => {
      const a = ast({
        tuples: [tuple({ name: 'T', extends: 'T' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('T → T');
    });

    test('self-reference in enums', () => {
      const a = ast({
        enums: [enumNode({ name: 'E', extends: 'E' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('E → E');
    });

    test('self-reference in literals', () => {
      const a = ast({
        literals: [literal({ name: 'L', extends: 'L' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('L → L');
    });
  });

  describe('chain edge cases', () => {
    test('long valid chain (6 nodes) produces no error', () => {
      const a = ast({
        models: [
          model({ name: 'A' }),
          model({ name: 'B', extends: 'A' }),
          model({ name: 'C', extends: 'B' }),
          model({ name: 'D', extends: 'C' }),
          model({ name: 'E', extends: 'D' }),
          model({ name: 'F', extends: 'E' }),
        ],
      });
      expect(validateNoCircularExtends(a)).toHaveLength(0);
    });

    test('multiple independent chains, only cyclic one reported', () => {
      const a = ast({
        models: [
          model({ name: 'A' }),
          model({ name: 'B', extends: 'A' }),
          model({ name: 'X', extends: 'Y' }),
          model({ name: 'Y', extends: 'X' }),
        ],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      const msg = errors[0]!.message;
      expect(msg).toContain('X');
      expect(msg).toContain('Y');
      expect(msg).not.toContain('"A"');
      expect(msg).not.toContain('"B"');
    });

    test('3-node cycle in objects has full path with arrows', () => {
      const a = ast({
        objects: [obj({ name: 'X', extends: 'Y' }), obj({ name: 'Y', extends: 'Z' }), obj({ name: 'Z', extends: 'X' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toMatch(/X.*→.*Y.*→.*Z.*→.*X/);
    });

    test('two independent cycles → two errors', () => {
      const a = ast({
        models: [
          model({ name: 'A', extends: 'B' }),
          model({ name: 'B', extends: 'A' }),
          model({ name: 'P', extends: 'Q' }),
          model({ name: 'Q', extends: 'P' }),
        ],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(2);
    });

    test('cycle across different kinds are independent', () => {
      const a = ast({
        models: [model({ name: 'A', extends: 'B' }), model({ name: 'B', extends: 'A' })],
        objects: [obj({ name: 'A', extends: 'B' }), obj({ name: 'B', extends: 'A' })],
      });
      const errors = validateNoCircularExtends(a);
      expect(errors.length).toBe(2);
      expect(errors[0]!.message).toContain('models');
      expect(errors[1]!.message).toContain('objects');
    });
  });
});

// ── validateAbstractRules ──────────────────────────────────────────────

describe('validateAbstractRules', () => {
  test('should pass for abstract model', () => {
    const a = ast({
      models: [model({ name: 'Base', abstract: true, fields: [field({ name: 'name' })] })],
    });
    expect(validateAbstractRules(a)).toHaveLength(0);
  });

  test('should fail when abstract model extends a concrete model', () => {
    const a = ast({
      models: [
        model({ name: 'Concrete', fields: [field({ name: 'name' })] }),
        model({ name: 'AbsChild', abstract: true, extends: 'Concrete' }),
      ],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('abstract');
    expect(errors[0]!.message).toContain('concrete');
  });

  test('should fail when concrete model extends concrete model', () => {
    const a = ast({
      models: [model({ name: 'Base' }), model({ name: 'Child', extends: 'Base' })],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Child');
    expect(errors[0]!.message).toContain('concrete');
    expect(errors[0]!.message).toContain('abstract');
  });

  test('should pass when concrete model extends abstract model', () => {
    const a = ast({
      models: [model({ name: 'Base', abstract: true }), model({ name: 'Child', extends: 'Base' })],
    });
    expect(validateAbstractRules(a)).toHaveLength(0);
  });

  test('should pass when abstract model extends abstract model', () => {
    const a = ast({
      models: [model({ name: 'Base', abstract: true }), model({ name: 'Mid', abstract: true, extends: 'Base' })],
    });
    expect(validateAbstractRules(a)).toHaveLength(0);
  });

  test('should fail when concrete model extends concrete model with correct message', () => {
    const a = ast({
      models: [
        model({ name: 'ConcreteParent', fields: [field({ name: 'name' })] }),
        model({ name: 'ConcreteChild', extends: 'ConcreteParent' }),
      ],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('ConcreteChild');
    expect(errors[0]!.message).toContain('ConcreteParent');
    expect(errors[0]!.message).toContain('Models can only extend abstract models');
  });

  test('should fail for multiple concrete models extending concrete parents', () => {
    const a = ast({
      models: [
        model({ name: 'Base', fields: [field({ name: 'x' })] }),
        model({ name: 'ChildA', extends: 'Base' }),
        model({ name: 'ChildB', extends: 'Base' }),
      ],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(2);
  });

  test('should fail when abstract model has @@index directive', () => {
    const a = ast({
      models: [
        model({
          name: 'AbsModel',
          abstract: true,
          directives: [{ kind: 'index', name: 'idx_name', fields: ['name'], range }],
          fields: [field({ name: 'name' })],
        }),
      ],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('@@index');
  });

  test('should fail when abstract model has @@unique directive', () => {
    const a = ast({
      models: [
        model({
          name: 'AbsModel',
          abstract: true,
          directives: [{ kind: 'unique', name: 'unq_email', fields: ['email'], range }],
          fields: [field({ name: 'email' })],
        }),
      ],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('@@unique');
  });

  test('should allow @@index on concrete model', () => {
    const a = ast({
      models: [
        model({
          name: 'User',
          directives: [{ kind: 'index', name: 'idx_name', fields: ['name'], range }],
          fields: [field({ name: 'name' })],
        }),
      ],
    });
    expect(validateAbstractRules(a)).toHaveLength(0);
  });

  test('should report abstract on non-model types (abstract only on models)', () => {
    // Objects, tuples, etc. cannot be abstract — but AST only has abstract on ASTModel
    // This test validates that objects without abstract flag produce no errors
    const a = ast({
      objects: [obj({ name: 'Addr' })],
    });
    expect(validateAbstractRules(a)).toHaveLength(0);
  });

  test('should fail abstract model with both @@index and @@unique', () => {
    const a = ast({
      models: [
        model({
          name: 'AbsModel',
          abstract: true,
          directives: [
            { kind: 'index', name: 'idx_x', fields: ['x'], range },
            { kind: 'unique', name: 'unq_y', fields: ['y'], range },
          ],
          fields: [field({ name: 'x' }), field({ name: 'y' })],
        }),
      ],
    });
    const errors = validateAbstractRules(a);
    expect(errors.length).toBe(2);
  });

  describe('edge cases', () => {
    test('multiple @@index directives → each produces separate error', () => {
      const a = ast({
        models: [
          model({
            name: 'AbsModel',
            abstract: true,
            directives: [
              { kind: 'index', name: 'idx_a', fields: ['a'], range },
              { kind: 'index', name: 'idx_b', fields: ['b'], range },
              { kind: 'index', name: 'idx_c', fields: ['c'], range },
            ],
            fields: [field({ name: 'a' }), field({ name: 'b' }), field({ name: 'c' })],
          }),
        ],
      });
      const errors = validateAbstractRules(a);
      expect(errors.length).toBe(3);
      expect(errors.every((e) => e.message.includes('@@index'))).toBe(true);
    });

    test('abstract with @@index AND extends concrete → two errors', () => {
      const a = ast({
        models: [
          model({ name: 'Concrete', fields: [field({ name: 'name' })] }),
          model({
            name: 'AbsChild',
            abstract: true,
            extends: 'Concrete',
            directives: [{ kind: 'index', name: 'idx_name', fields: ['name'], range }],
            fields: [field({ name: 'name' })],
          }),
        ],
      });
      const errors = validateAbstractRules(a);
      expect(errors.length).toBe(2);
      expect(errors.some((e) => e.message.includes('concrete') && e.message.includes('Abstract'))).toBe(true);
      expect(errors.some((e) => e.message.includes('@@index'))).toBe(true);
    });

    test('concrete model with @@unique → OK', () => {
      const a = ast({
        models: [
          model({
            name: 'User',
            directives: [{ kind: 'unique', name: 'unq_email', fields: ['email'], range }],
            fields: [field({ name: 'email' })],
          }),
        ],
      });
      expect(validateAbstractRules(a)).toHaveLength(0);
    });

    test('three-level abstract chain → OK', () => {
      const a = ast({
        models: [
          model({ name: 'Base', abstract: true, fields: [field({ name: 'a' })] }),
          model({ name: 'Mid', abstract: true, extends: 'Base', fields: [field({ name: 'b' })] }),
          model({ name: 'Leaf', abstract: true, extends: 'Mid', fields: [field({ name: 'c' })] }),
        ],
      });
      expect(validateAbstractRules(a)).toHaveLength(0);
    });

    test('abstract model with no extends, no fields, no directives → OK', () => {
      const a = ast({
        models: [model({ name: 'EmptyAbstract', abstract: true })],
      });
      expect(validateAbstractRules(a)).toHaveLength(0);
    });

    test('concrete model extending concrete model is rejected', () => {
      // All models can only extend abstract models
      const a = ast({
        models: [model({ name: 'Base', fields: [field({ name: 'x' })] }), model({ name: 'Child', extends: 'Base' })],
      });
      const errors = validateAbstractRules(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('concrete');
    });

    test('abstract model extending non-existent model → no abstract error (target check is separate)', () => {
      const a = ast({
        models: [model({ name: 'Abs', abstract: true, extends: 'Ghost' })],
      });
      // getModel returns undefined for 'Ghost' → parent check skipped
      expect(validateAbstractRules(a)).toHaveLength(0);
    });
  });
});

// ── validatePrivateOverride ──────────────────────────────────────────────

describe('validatePrivateOverride', () => {
  test('should fail when child redefines a private field from parent', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret', isPrivate: true })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [field({ name: 'secret', type: 'int' })],
        }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('private');
    expect(errors[0]!.message).toContain('secret');
  });

  test('should pass when child does NOT redefine private field', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret', isPrivate: true }), field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [field({ name: 'extra' })],
        }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should ALLOW private field in omit list (no error)', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret', isPrivate: true })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'omit', fields: ['secret'] },
        }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should ALLOW private field missing from pick list (no error)', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret', isPrivate: true }), field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'pick', fields: ['name'] },
        }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should pass when child redefines a NON-private field', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [field({ name: 'name', type: 'email' })],
        }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should check private override in objects', () => {
    const a = ast({
      objects: [
        obj({
          name: 'BaseObj',
          fields: [field({ name: 'internal', isPrivate: true })],
        }),
        obj({
          name: 'ChildObj',
          extends: 'BaseObj',
          fields: [field({ name: 'internal' })],
        }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('private');
  });

  test('should check private override in tuples (by element name)', () => {
    const a = ast({
      tuples: [
        tuple({
          name: 'BaseTup',
          elements: [tupleElement({ name: 'secret', isPrivate: true })],
        }),
        tuple({
          name: 'ChildTup',
          extends: 'BaseTup',
          elements: [tupleElement({ name: 'secret', type: 'int' })],
        }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
  });

  test('should check private override in tuples (by element index)', () => {
    // Tuple elements without names are matched by index
    const a = ast({
      tuples: [
        tuple({
          name: 'BaseTup',
          elements: [tupleElement({ isPrivate: true })],
        }),
        tuple({
          name: 'ChildTup',
          extends: 'BaseTup',
          elements: [tupleElement({ type: 'int' })],
        }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
  });

  test('should pass when no extends defined', () => {
    const a = ast({
      models: [model({ name: 'Solo', fields: [field({ name: 'x', isPrivate: true })] })],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should pass when parent has no private fields', () => {
    const a = ast({
      models: [
        model({ name: 'Base', fields: [field({ name: 'name' })] }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [field({ name: 'name', type: 'email' })],
        }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should report multiple private override errors', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret1', isPrivate: true }), field({ name: 'secret2', isPrivate: true })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [field({ name: 'secret1' }), field({ name: 'secret2' })],
        }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(2);
  });

  describe('edge cases', () => {
    test('private field included in pick list but not overridden → OK', () => {
      const a = ast({
        models: [
          model({
            name: 'Base',
            fields: [field({ name: 'secret', isPrivate: true }), field({ name: 'name' })],
          }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'pick', fields: ['secret', 'name'] },
            // No fields in child body → no override
          }),
        ],
      });
      expect(validatePrivateOverride(a)).toHaveLength(0);
    });

    test('grandparent private field, grandchild overrides → no error (raw AST only checks direct parent)', () => {
      const a = ast({
        models: [
          model({ name: 'GrandParent', fields: [field({ name: 'secret', isPrivate: true })] }),
          model({ name: 'Parent', extends: 'GrandParent' }),
          model({ name: 'Child', extends: 'Parent', fields: [field({ name: 'secret' })] }),
        ],
      });
      // Parent has no fields in raw AST → no private field found → no error
      expect(validatePrivateOverride(a)).toHaveLength(0);
    });

    test('multiple private fields, only one overridden → exactly one error', () => {
      const a = ast({
        models: [
          model({
            name: 'Base',
            fields: [
              field({ name: 'secret1', isPrivate: true }),
              field({ name: 'secret2', isPrivate: true }),
              field({ name: 'name' }),
            ],
          }),
          model({
            name: 'Child',
            extends: 'Base',
            fields: [field({ name: 'secret1' }), field({ name: 'extra' })],
          }),
        ],
      });
      const errors = validatePrivateOverride(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('secret1');
    });

    test('private tuple element by index, child has fewer elements → no override', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [
              tupleElement({ type: 'string' }),
              tupleElement({ type: 'int' }),
              tupleElement({ type: 'float', isPrivate: true }),
            ],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            elements: [tupleElement({ type: 'string' })],
          }),
        ],
      });
      // Child only has element at index 0; private element is at index 2
      expect(validatePrivateOverride(a)).toHaveLength(0);
    });

    test('object private field not overridden → OK', () => {
      const a = ast({
        objects: [
          obj({
            name: 'BaseObj',
            fields: [field({ name: 'internal', isPrivate: true }), field({ name: 'visible' })],
          }),
          obj({
            name: 'ChildObj',
            extends: 'BaseObj',
            fields: [field({ name: 'extra' })],
          }),
        ],
      });
      expect(validatePrivateOverride(a)).toHaveLength(0);
    });

    test('child overrides non-private while parent also has private → no error', () => {
      const a = ast({
        models: [
          model({
            name: 'Base',
            fields: [field({ name: 'secret', isPrivate: true }), field({ name: 'name' })],
          }),
          model({
            name: 'Child',
            extends: 'Base',
            fields: [field({ name: 'name', type: 'email' })],
          }),
        ],
      });
      expect(validatePrivateOverride(a)).toHaveLength(0);
    });

    test('private override error includes parent name', () => {
      const a = ast({
        models: [
          model({ name: 'MyBase', fields: [field({ name: 'hidden', isPrivate: true })] }),
          model({ name: 'MyChild', extends: 'MyBase', fields: [field({ name: 'hidden' })] }),
        ],
      });
      const errors = validatePrivateOverride(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('MyBase');
      expect(errors[0]!.message).toContain('MyChild');
      expect(errors[0]!.message).toContain('hidden');
    });

    test('parent not found → silently skip (separate validator handles missing target)', () => {
      const a = ast({
        models: [
          model({
            name: 'Child',
            extends: 'Missing',
            fields: [field({ name: 'anything' })],
          }),
        ],
      });
      expect(validatePrivateOverride(a)).toHaveLength(0);
    });
  });
});

// ── validatePickOmitFields ──────────────────────────────────────────────

describe('validatePickOmitFields', () => {
  test('should pass when all pick fields exist in parent model', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'name' }), field({ name: 'email' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'pick', fields: ['name'] },
        }),
      ],
    });
    expect(validatePickOmitFields(a)).toHaveLength(0);
  });

  test('should fail when pick references non-existent field in parent', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'pick', fields: ['name', 'missing'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('missing');
  });

  test('should pass when all omit fields exist in parent model', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'name' }), field({ name: 'age' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'omit', fields: ['age'] },
        }),
      ],
    });
    expect(validatePickOmitFields(a)).toHaveLength(0);
  });

  test('should fail when omit references non-existent field', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'omit', fields: ['ghost'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('ghost');
  });

  test('should validate pick/omit for objects', () => {
    const a = ast({
      objects: [
        obj({
          name: 'BaseObj',
          fields: [field({ name: 'x' })],
        }),
        obj({
          name: 'ChildObj',
          extends: 'BaseObj',
          extendsFilter: { mode: 'pick', fields: ['nonexistent'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
  });

  test('should validate pick/omit for enums', () => {
    const a = ast({
      enums: [
        enumNode({ name: 'BaseEnum', values: ['A', 'B', 'C'] }),
        enumNode({
          name: 'ChildEnum',
          extends: 'BaseEnum',
          extendsFilter: { mode: 'omit', fields: ['D'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('D');
  });

  test('should validate pick/omit for literals (variant names)', () => {
    const a = ast({
      literals: [
        literal({
          name: 'BaseLit',
          variants: [
            { kind: 'string', value: 'active' },
            { kind: 'string', value: 'inactive' },
          ],
        }),
        literal({
          name: 'ChildLit',
          extends: 'BaseLit',
          extendsFilter: { mode: 'pick', fields: ['active', 'missing'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('missing');
  });

  test('should validate tuple pick/omit by named elements', () => {
    const a = ast({
      tuples: [
        tuple({
          name: 'BaseTup',
          elements: [tupleElement({ name: 'x' }), tupleElement({ name: 'y' })],
        }),
        tuple({
          name: 'ChildTup',
          extends: 'BaseTup',
          extendsFilter: { mode: 'omit', fields: ['z'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('z');
  });

  test('should validate tuple pick/omit by index', () => {
    const a = ast({
      tuples: [
        tuple({
          name: 'BaseTup',
          elements: [tupleElement(), tupleElement()], // 2 elements (indices 0, 1)
        }),
        tuple({
          name: 'ChildTup',
          extends: 'BaseTup',
          extendsFilter: { mode: 'omit', fields: ['5'] }, // index 5 out of bounds
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('5');
  });

  test('should pass when tuple index is within bounds', () => {
    const a = ast({
      tuples: [
        tuple({
          name: 'BaseTup',
          elements: [tupleElement(), tupleElement(), tupleElement()],
        }),
        tuple({
          name: 'ChildTup',
          extends: 'BaseTup',
          extendsFilter: { mode: 'pick', fields: ['0', '2'] },
        }),
      ],
    });
    expect(validatePickOmitFields(a)).toHaveLength(0);
  });

  test('should not error when no filter is specified', () => {
    const a = ast({
      models: [model({ name: 'Base', fields: [field({ name: 'x' })] }), model({ name: 'Child', extends: 'Base' })],
    });
    expect(validatePickOmitFields(a)).toHaveLength(0);
  });

  test('should not error when parent target does not exist', () => {
    // validateExtendsTargetExists handles missing targets
    const a = ast({
      models: [
        model({
          name: 'Child',
          extends: 'Missing',
          extendsFilter: { mode: 'pick', fields: ['x'] },
        }),
      ],
    });
    expect(validatePickOmitFields(a)).toHaveLength(0);
  });

  test('should allow private fields in omit list (no constraint)', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret', isPrivate: true }), field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'omit', fields: ['secret'] },
        }),
      ],
    });
    expect(validatePickOmitFields(a)).toHaveLength(0);
  });

  test('should report multiple missing fields', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'name' })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'pick', fields: ['a', 'b', 'c'] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(3);
  });

  describe('edge cases', () => {
    test('empty pick list → OK (no parent fields inherited)', () => {
      const a = ast({
        models: [
          model({ name: 'Base', fields: [field({ name: 'x' }), field({ name: 'y' })] }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'pick', fields: [] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('empty omit list → OK', () => {
      const a = ast({
        models: [
          model({ name: 'Base', fields: [field({ name: 'x' })] }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'omit', fields: [] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('tuple index negative → out of bounds error', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [tupleElement(), tupleElement()],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            extendsFilter: { mode: 'pick', fields: ['-1'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('-1');
      expect(errors[0]!.message).toContain('out of bounds');
    });

    test('valid tuple pick by element name → OK', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [tupleElement({ name: 'x' }), tupleElement({ name: 'y' }), tupleElement({ name: 'z' })],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            extendsFilter: { mode: 'pick', fields: ['x', 'z'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('valid tuple pick by both name and index → OK', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [tupleElement({ name: 'x' }), tupleElement({ name: 'y' })],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            extendsFilter: { mode: 'pick', fields: ['x', '1'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('enum omit existing value → OK', () => {
      const a = ast({
        enums: [
          enumNode({ name: 'BaseEnum', values: ['A', 'B', 'C'] }),
          enumNode({
            name: 'ChildEnum',
            extends: 'BaseEnum',
            extendsFilter: { mode: 'omit', fields: ['B'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('enum pick existing value → OK', () => {
      const a = ast({
        enums: [
          enumNode({ name: 'BaseEnum', values: ['A', 'B', 'C'] }),
          enumNode({
            name: 'ChildEnum',
            extends: 'BaseEnum',
            extendsFilter: { mode: 'pick', fields: ['A', 'C'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('enum pick non-existent value → error', () => {
      const a = ast({
        enums: [
          enumNode({ name: 'BaseEnum', values: ['A', 'B'] }),
          enumNode({
            name: 'ChildEnum',
            extends: 'BaseEnum',
            extendsFilter: { mode: 'pick', fields: ['A', 'X'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('X');
    });

    test('literal pick with int variant identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'int', value: 1 },
              { kind: 'int', value: 2 },
              { kind: 'int', value: 3 },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['1', '3'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal pick with bool variant identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'bool', value: true },
              { kind: 'bool', value: false },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['true'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal pick with broadType identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'broadType', typeName: 'String' },
              { kind: 'broadType', typeName: 'Int' },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['String'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal pick with objectRef identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'objectRef', objectName: 'Address' },
              { kind: 'string', value: 'none' },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['Address'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal pick with non-existent variant → error', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'string', value: 'a' },
              { kind: 'int', value: 42 },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['a', 'nonexistent'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('nonexistent');
    });

    test('mixed valid and invalid fields in omit → errors only for invalid', () => {
      const a = ast({
        models: [
          model({
            name: 'Base',
            fields: [field({ name: 'a' }), field({ name: 'b' }), field({ name: 'c' })],
          }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'omit', fields: ['a', 'ghost1', 'c', 'ghost2'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(2);
      expect(errors[0]!.message).toContain('ghost1');
      expect(errors[1]!.message).toContain('ghost2');
    });

    test('pick all fields from parent → OK', () => {
      const a = ast({
        models: [
          model({
            name: 'Base',
            fields: [field({ name: 'a' }), field({ name: 'b' }), field({ name: 'c' })],
          }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'pick', fields: ['a', 'b', 'c'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('omit all fields from parent → OK', () => {
      const a = ast({
        models: [
          model({
            name: 'Base',
            fields: [field({ name: 'a' }), field({ name: 'b' })],
          }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'omit', fields: ['a', 'b'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal omit with float variant identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'float', value: 3.14 },
              { kind: 'float', value: 2.71 },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'omit', fields: ['3.14'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal pick with tupleRef identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'tupleRef', tupleName: 'Coord' },
              { kind: 'string', value: 'none' },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['Coord'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('literal pick with literalRef identifier → OK', () => {
      const a = ast({
        literals: [
          literal({
            name: 'BaseLit',
            variants: [
              { kind: 'literalRef', literalName: 'NestedLit' },
              { kind: 'string', value: 'x' },
            ],
          }),
          literal({
            name: 'ChildLit',
            extends: 'BaseLit',
            extendsFilter: { mode: 'pick', fields: ['NestedLit'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('tuple omit by name for non-existent element name → error', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [tupleElement({ name: 'x' }), tupleElement({ name: 'y' })],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            extendsFilter: { mode: 'omit', fields: ['w'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('w');
    });

    test('tuple index at exact boundary → OK', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [tupleElement(), tupleElement(), tupleElement()],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            extendsFilter: { mode: 'pick', fields: ['0', '1', '2'] },
          }),
        ],
      });
      expect(validatePickOmitFields(a)).toHaveLength(0);
    });

    test('tuple index one past boundary → error', () => {
      const a = ast({
        tuples: [
          tuple({
            name: 'BaseTup',
            elements: [tupleElement(), tupleElement()],
          }),
          tuple({
            name: 'ChildTup',
            extends: 'BaseTup',
            extendsFilter: { mode: 'omit', fields: ['2'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('out of bounds');
    });

    test('object pick with mix of valid and invalid → errors only for invalid', () => {
      const a = ast({
        objects: [
          obj({
            name: 'BaseObj',
            fields: [field({ name: 'a' }), field({ name: 'b' })],
          }),
          obj({
            name: 'ChildObj',
            extends: 'BaseObj',
            extendsFilter: { mode: 'pick', fields: ['a', 'missing'] },
          }),
        ],
      });
      const errors = validatePickOmitFields(a);
      expect(errors.length).toBe(1);
      expect(errors[0]!.message).toContain('missing');
    });
  });
});

// ── validateExtends (orchestrator) ──────────────────────────────────────

describe('validateExtends', () => {
  test('should return no errors for valid schema', () => {
    const a = ast({
      models: [
        model({ name: 'Base', abstract: true, fields: [field({ name: 'name' })] }),
        model({ name: 'Child', extends: 'Base', fields: [field({ name: 'extra' })] }),
      ],
    });
    expect(validateExtends(a)).toHaveLength(0);
  });

  test('should combine errors from multiple validators', () => {
    const a = ast({
      models: [
        // Missing target + abstract extending concrete
        model({ name: 'Concrete' }),
        model({ name: 'AbsChild', abstract: true, extends: 'NonExistent' }),
      ],
    });
    const errors = validateExtends(a);
    // Should have at least the "target doesn't exist" error
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('should catch circular extends in orchestrator', () => {
    const a = ast({
      models: [model({ name: 'A', extends: 'B' }), model({ name: 'B', extends: 'A' })],
    });
    const errors = validateExtends(a);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  test('should catch private override in orchestrator', () => {
    const a = ast({
      models: [
        model({
          name: 'Base',
          fields: [field({ name: 'secret', isPrivate: true })],
        }),
        model({
          name: 'Child',
          extends: 'Base',
          fields: [field({ name: 'secret' })],
        }),
      ],
    });
    const errors = validateExtends(a);
    expect(errors.some((e) => e.message.includes('private'))).toBe(true);
  });

  test('should catch empty extends filter in orchestrator', () => {
    const a = ast({
      models: [
        model({ name: 'Base', fields: [field({ name: 'x' })] }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'pick', fields: [] },
        }),
      ],
    });
    const errors = validateExtends(a);
    expect(errors.some((e) => e.message.includes('empty extends filter brackets'))).toBe(true);
  });

  test('should catch invalid pick/omit fields in orchestrator', () => {
    const a = ast({
      models: [
        model({ name: 'Base', fields: [field({ name: 'name' })] }),
        model({
          name: 'Child',
          extends: 'Base',
          extendsFilter: { mode: 'pick', fields: ['ghost'] },
        }),
      ],
    });
    const errors = validateExtends(a);
    expect(errors.some((e) => e.message.includes('ghost'))).toBe(true);
  });

  describe('edge cases', () => {
    test('empty AST → no errors', () => {
      const a = ast({});
      expect(validateExtends(a)).toHaveLength(0);
    });

    test('all 5 kinds with valid extends → no errors', () => {
      const a = ast({
        models: [
          model({ name: 'BaseModel', abstract: true, fields: [field({ name: 'x' })] }),
          model({ name: 'ChildModel', extends: 'BaseModel' }),
        ],
        objects: [
          obj({ name: 'BaseObj', fields: [field({ name: 'y' })] }),
          obj({ name: 'ChildObj', extends: 'BaseObj' }),
        ],
        tuples: [
          tuple({ name: 'BaseTup', elements: [tupleElement()] }),
          tuple({ name: 'ChildTup', extends: 'BaseTup' }),
        ],
        enums: [enumNode({ name: 'BaseEnum', values: ['A'] }), enumNode({ name: 'ChildEnum', extends: 'BaseEnum' })],
        literals: [
          literal({ name: 'BaseLit', variants: [{ kind: 'string', value: 'x' }] }),
          literal({ name: 'ChildLit', extends: 'BaseLit' }),
        ],
      });
      expect(validateExtends(a)).toHaveLength(0);
    });

    test('cross-kind + cycle errors in same AST → errors from both validators', () => {
      const a = ast({
        models: [
          model({ name: 'A', extends: 'B' }),
          model({ name: 'B', extends: 'A' }),
          model({ name: 'C', extends: 'Target' }),
        ],
        objects: [obj({ name: 'Target' })],
      });
      const errors = validateExtends(a);
      expect(errors.some((e) => e.message.includes('Circular'))).toBe(true);
      expect(errors.some((e) => e.message.includes('object'))).toBe(true);
    });

    test('complex valid schema with abstract models, objects, enums → no errors', () => {
      const a = ast({
        models: [
          model({ name: 'Base', abstract: true, fields: [field({ name: 'name' }), field({ name: 'age' })] }),
          model({
            name: 'Child',
            extends: 'Base',
            extendsFilter: { mode: 'pick', fields: ['name'] },
            fields: [field({ name: 'extra' })],
          }),
        ],
        objects: [
          obj({ name: 'Addr', fields: [field({ name: 'street' })] }),
          obj({ name: 'FullAddr', extends: 'Addr', fields: [field({ name: 'zip' })] }),
        ],
        enums: [
          enumNode({ name: 'Role', values: ['Admin', 'User'] }),
          enumNode({ name: 'SubRole', extends: 'Role', extendsFilter: { mode: 'pick', fields: ['Admin'] } }),
        ],
      });
      expect(validateExtends(a)).toHaveLength(0);
    });
  });
});

// ── validateEmptyTypes (Rule 1: pre-resolution) ─────────────────────────

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
