/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validatePickOmitFields } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, field, literal, model, obj, tuple, tupleElement } from './helpers';

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
          extendsFilter: { mode: 'pick', fields: ["'active'", "'missing'"] },
        }),
      ],
    });
    const errors = validatePickOmitFields(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('missing');
  });

  describe('quoted string variants', () => {
    const base = literal({
      name: 'BaseLit',
      variants: [
        { kind: 'string', value: 'active' },
        { kind: 'string', value: 'inactive' },
      ],
    });
    const child = (mode: 'pick' | 'omit', fields: string[]) =>
      ast({ literals: [base, literal({ name: 'ChildLit', extends: 'BaseLit', extendsFilter: { mode, fields } })] });

    test('quoted pick is accepted', () => {
      expect(validatePickOmitFields(child('pick', ["'active'"]))).toHaveLength(0);
    });

    test('quoted omit is accepted', () => {
      expect(validatePickOmitFields(child('omit', ["'inactive'"]))).toHaveLength(0);
    });

    test('bare string is refused, since the resolver would match no variant', () => {
      expect(validatePickOmitFields(child('pick', ['active']))).toHaveLength(1);
      expect(validatePickOmitFields(child('omit', ['active']))).toHaveLength(1);
    });

    test('a quoted string naming no variant is refused', () => {
      expect(validatePickOmitFields(child('pick', ["'archived'"]))).toHaveLength(1);
    });
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
            extendsFilter: { mode: 'pick', fields: ["'a'", "'nonexistent'"] },
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
