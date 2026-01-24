/**
 * Insert builder tests
 */

import { describe, expect, test } from 'bun:test';
import { applyDefaultValues, applyNowDefaults, buildCreateQuery } from '../../../src/query/builders';
import type { ModelMetadata } from '../../../src/types';

const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
    { name: 'name', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
    { name: 'createdAt', type: 'date', isId: false, isUnique: false, hasNowDefault: true, isRequired: true },
    {
      name: 'status',
      type: 'string',
      isId: false,
      isUnique: false,
      hasNowDefault: false,
      isRequired: true,
      defaultValue: 'active',
    },
  ],
};

describe('insert builder', () => {
  test('builds CREATE query', () => {
    const data = { name: 'John' };
    const result = buildCreateQuery(userModel, data);

    expect(result.text).toContain('CREATE user CONTENT');
    expect(result.text).toContain('RETURN');
  });

  test('applyNowDefaults adds timestamp for @now fields', () => {
    const data: Record<string, unknown> = { name: 'John' };
    const result = applyNowDefaults(data, userModel);

    expect(result.createdAt).toBeDefined();
    expect(typeof result.createdAt).toBe('string');
  });

  test('applyNowDefaults does not override existing value', () => {
    const existingDate = '2024-01-01T00:00:00.000Z';
    const data: Record<string, unknown> = { name: 'John', createdAt: existingDate };
    const result = applyNowDefaults(data, userModel);

    expect(result.createdAt).toBe(existingDate);
  });

  test('applyDefaultValues adds default values', () => {
    const data: Record<string, unknown> = { name: 'John' };
    const result = applyDefaultValues(data, userModel);

    expect(result.status).toBe('active');
  });

  test('applyDefaultValues does not override existing value', () => {
    const data: Record<string, unknown> = { name: 'John', status: 'inactive' };
    const result = applyDefaultValues(data, userModel);

    expect(result.status).toBe('inactive');
  });
});
