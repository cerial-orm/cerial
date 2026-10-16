/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validatePrivateOverride } from '../../../src/cli/validators/extends-validator';
import { ast, field, model, obj, tuple, tupleElement } from './helpers';

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

  test('should fail when a leaf overrides a field made private two levels up, naming the declarer', () => {
    const a = ast({
      models: [
        model({ name: 'DeepBase', fields: [field({ name: 'secret', isPrivate: true })] }),
        model({ name: 'DeepLow', extends: 'DeepBase', fields: [field({ name: 'age', type: 'int' })] }),
        model({ name: 'DeepLeaf', extends: 'DeepLow', fields: [field({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.model).toBe('DeepLeaf');
    expect(errors[0]!.field).toBe('secret');
    expect(errors[0]!.message).toContain('"DeepBase"');
    expect(errors[0]!.message).not.toContain('"DeepLow"');
  });

  test('should fail when a leaf overrides a field made private three levels up', () => {
    const a = ast({
      models: [
        model({ name: 'L0', fields: [field({ name: 'secret', isPrivate: true })] }),
        model({ name: 'L1', extends: 'L0' }),
        model({ name: 'L2', extends: 'L1' }),
        model({ name: 'L3', extends: 'L2', fields: [field({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"L0"');
  });

  test('should pass when a leaf redeclares a NON-private field from three levels up', () => {
    const a = ast({
      models: [
        model({ name: 'L0', fields: [field({ name: 'name' })] }),
        model({ name: 'L1', extends: 'L0' }),
        model({ name: 'L2', extends: 'L1' }),
        model({ name: 'L3', extends: 'L2', fields: [field({ name: 'name' })] }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should terminate on an extends cycle and on a missing ancestor', () => {
    const cyclic = ast({
      models: [
        model({ name: 'X', extends: 'Y', fields: [field({ name: 'secret', isPrivate: true })] }),
        model({ name: 'Y', extends: 'X', fields: [field({ name: 'other' })] }),
      ],
    });
    expect(() => validatePrivateOverride(cyclic)).not.toThrow();

    const missing = ast({
      models: [model({ name: 'Mid', extends: 'Gone' }), model({ name: 'Leaf', extends: 'Mid' })],
    });
    expect(validatePrivateOverride(missing)).toHaveLength(0);
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

  test('should fail when a leaf overrides an object field made private two levels up, naming the declarer', () => {
    const a = ast({
      objects: [
        obj({ name: 'ObjBase', fields: [field({ name: 'secret', isPrivate: true })] }),
        obj({ name: 'ObjMid', extends: 'ObjBase', fields: [field({ name: 'age', type: 'int' })] }),
        obj({ name: 'ObjLeaf', extends: 'ObjMid', fields: [field({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.field).toBe('secret');
    expect(errors[0]!.message).toContain('"ObjBase"');
    expect(errors[0]!.message).not.toContain('"ObjMid"');
  });

  test('should pass when an object leaf redeclares a NON-private field from two levels up', () => {
    const a = ast({
      objects: [
        obj({ name: 'ObjBase', fields: [field({ name: 'name' })] }),
        obj({ name: 'ObjMid', extends: 'ObjBase' }),
        obj({ name: 'ObjLeaf', extends: 'ObjMid', fields: [field({ name: 'name' })] }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should keep an object field private when an intermediate omitted it', () => {
    const a = ast({
      objects: [
        obj({ name: 'ObjBase', fields: [field({ name: 'secret', isPrivate: true })] }),
        obj({ name: 'ObjMid', extends: 'ObjBase', extendsFilter: { mode: 'omit', fields: ['secret'] } }),
        obj({ name: 'ObjLeaf', extends: 'ObjMid', fields: [field({ name: 'secret' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"ObjBase"');
  });

  test('should keep a model field private when an intermediate omitted it, naming the declarer', () => {
    const a = ast({
      models: [
        model({ name: 'C', fields: [field({ name: 'secret', isPrivate: true })] }),
        model({ name: 'B', extends: 'C', extendsFilter: { mode: 'omit', fields: ['secret'] } }),
        model({ name: 'A', extends: 'B', fields: [field({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.model).toBe('A');
    expect(errors[0]!.message).toContain('"C"');
    expect(errors[0]!.message).not.toContain('"B"');
  });

  test('should keep a model field private when an intermediate picked around it', () => {
    const a = ast({
      models: [
        model({ name: 'C', fields: [field({ name: 'secret', isPrivate: true }), field({ name: 'name' })] }),
        model({ name: 'B', extends: 'C', extendsFilter: { mode: 'pick', fields: ['name'] } }),
        model({ name: 'A', extends: 'B', fields: [field({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"C"');
  });

  test('should accept a leaf redeclaring a non-private field that an intermediate omitted', () => {
    const a = ast({
      models: [
        model({ name: 'C', fields: [field({ name: 'name' })] }),
        model({ name: 'B', extends: 'C', extendsFilter: { mode: 'omit', fields: ['name'] } }),
        model({ name: 'A', extends: 'B', fields: [field({ name: 'name', type: 'int' })] }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  test('should fail when the declaring model is abstract, three levels up, naming it', () => {
    const a = ast({
      models: [
        model({ name: 'AbsBase', abstract: true, fields: [field({ name: 'secret', isPrivate: true })] }),
        model({ name: 'AbsMid', abstract: true, extends: 'AbsBase' }),
        model({ name: 'Concrete', extends: 'AbsMid' }),
        model({ name: 'Leaf', extends: 'Concrete', fields: [field({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.model).toBe('Leaf');
    expect(errors[0]!.message).toContain('"AbsBase"');
    expect(errors[0]!.message).not.toContain('"AbsMid"');
    expect(errors[0]!.message).not.toContain('"Concrete"');
  });

  test('should accept an abstract chain whose leaf does not redeclare the private field', () => {
    const a = ast({
      models: [
        model({ name: 'AbsBase', abstract: true, fields: [field({ name: 'secret', isPrivate: true })] }),
        model({ name: 'AbsMid', abstract: true, extends: 'AbsBase' }),
        model({ name: 'Leaf', extends: 'AbsMid', fields: [field({ name: 'other' })] }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
  });

  // Objects have no abstract form - the parser sets abstract on models only - so the object
  // equivalent of the abstract-declarer chain is a plain three-level one.
  test('should fail when the declaring object is two levels up, naming it', () => {
    const a = ast({
      objects: [
        obj({ name: 'AbsObj', fields: [field({ name: 'secret', isPrivate: true })] }),
        obj({ name: 'MidObj', extends: 'AbsObj' }),
        obj({ name: 'LeafObj', extends: 'MidObj', fields: [field({ name: 'secret' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"AbsObj"');
    expect(errors[0]!.message).not.toContain('"MidObj"');
  });

  test('should terminate on object and tuple extends cycles and missing ancestors', () => {
    const cyclic = ast({
      objects: [
        obj({ name: 'OX', extends: 'OY', fields: [field({ name: 'secret', isPrivate: true })] }),
        obj({ name: 'OY', extends: 'OX' }),
      ],
      tuples: [
        tuple({ name: 'TX', extends: 'TY', elements: [tupleElement({ name: 'secret', isPrivate: true })] }),
        tuple({ name: 'TY', extends: 'TX' }),
      ],
    });
    expect(() => validatePrivateOverride(cyclic)).not.toThrow();

    const missing = ast({
      objects: [obj({ name: 'OMid', extends: 'Gone' }), obj({ name: 'OLeaf', extends: 'OMid' })],
      tuples: [tuple({ name: 'TMid', extends: 'Gone' }), tuple({ name: 'TLeaf', extends: 'TMid' })],
    });
    expect(validatePrivateOverride(missing)).toHaveLength(0);
  });

  test('should fail when a leaf overrides a tuple element made private two levels up, by name', () => {
    const a = ast({
      tuples: [
        tuple({ name: 'TupBase', elements: [tupleElement({ name: 'secret', isPrivate: true })] }),
        tuple({ name: 'TupMid', extends: 'TupBase', elements: [tupleElement({ name: 'extra' })] }),
        tuple({ name: 'TupLeaf', extends: 'TupMid', elements: [tupleElement({ name: 'secret', type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"TupBase"');
    expect(errors[0]!.message).not.toContain('"TupMid"');
  });

  test('should fail when a leaf overrides a tuple element made private two levels up, by index', () => {
    const a = ast({
      tuples: [
        tuple({ name: 'TupBase', elements: [tupleElement({ isPrivate: true })] }),
        tuple({ name: 'TupMid', extends: 'TupBase' }),
        tuple({ name: 'TupLeaf', extends: 'TupMid', elements: [tupleElement({ type: 'int' })] }),
      ],
    });
    const errors = validatePrivateOverride(a);
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('"TupBase"');
  });

  test('should pass when a tuple leaf redeclares a NON-private element from two levels up', () => {
    const a = ast({
      tuples: [
        tuple({ name: 'TupBase', elements: [tupleElement({ name: 'x' })] }),
        tuple({ name: 'TupMid', extends: 'TupBase' }),
        tuple({ name: 'TupLeaf', extends: 'TupMid', elements: [tupleElement({ name: 'x' })] }),
      ],
    });
    expect(validatePrivateOverride(a)).toHaveLength(0);
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

    test('grandparent private field, grandchild overrides → error naming the grandparent', () => {
      const a = ast({
        models: [
          model({ name: 'GrandParent', fields: [field({ name: 'secret', isPrivate: true })] }),
          model({ name: 'Parent', extends: 'GrandParent' }),
          model({ name: 'Child', extends: 'Parent', fields: [field({ name: 'secret' })] }),
        ],
      });
      const errors = validatePrivateOverride(a);
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('"GrandParent"');
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
