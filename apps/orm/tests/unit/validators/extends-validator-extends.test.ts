/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateExtends } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, field, literal, model, obj, tuple, tupleElement } from './helpers';

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
