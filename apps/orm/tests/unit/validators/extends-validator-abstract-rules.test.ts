/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateAbstractRules } from '../../../src/cli/validators/extends-validator';
import { ast, field, model, obj, range } from './helpers';

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
