/**
 * Unit Tests: Extends Validator
 *
 * Tests validation of extends, abstract, and private field rules.
 */

import { describe, expect, test } from 'bun:test';
import { validateNoCircularExtends } from '../../../src/cli/validators/extends-validator';
import { ast, enumNode, literal, model, obj, tuple } from './helpers';

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
