/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateAbstractRules,
  validateExtends,
  validateExtendsTargetExists,
  validateNoCircularExtends,
  validateNoCrossKindExtends,
  validatePickOmitFields,
  validatePrivateOverride,
} from '../../../src/cli/validators/extends-validator';
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

  test('should pass when concrete model extends concrete model', () => {
    const a = ast({
      models: [model({ name: 'Base' }), model({ name: 'Child', extends: 'Base' })],
    });
    expect(validateAbstractRules(a)).toHaveLength(0);
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
});
