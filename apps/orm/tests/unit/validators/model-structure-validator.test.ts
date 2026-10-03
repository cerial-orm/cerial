/**
 * Unit Tests: Model structure validation
 *
 * Duplicate models and fields, and @id multiplicity, validated through the same
 * checks `cerial generate` runs.
 */

import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { validateAll } from './helpers';

describe('model structure', () => {
  test('detects duplicate model names', () => {
    const source = `model User {
  id Record @id
}

model User {
  id Record @id
}`;
    const result = parse(source);
    const errors = validateAll(result.ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Duplicate model name'))).toBe(true);
  });

  test('detects duplicate field names', () => {
    const source = `model User {
  id Record @id
  id Int
}`;
    const result = parse(source);
    const errors = validateAll(result.ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Duplicate field name'))).toBe(true);
  });

  test('detects multiple @id decorators in same model', () => {
    const source = `model User {
  id Record @id
  otherId String @id
}`;
    const result = parse(source);
    const errors = validateAll(result.ast);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('Multiple @id decorators'))).toBe(true);
  });

  test('allows single @id per model', () => {
    const source = `model User {
  id Record @id
  email Email @unique
}`;
    const result = parse(source);
    const errors = validateAll(result.ast);

    expect(errors.length).toBe(0);
  });
});
