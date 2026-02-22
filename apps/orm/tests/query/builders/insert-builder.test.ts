/**
 * Insert builder tests
 */

import { describe, expect, test } from 'bun:test';
import { applyDefaultValues, buildCreateQuery, stripComputedFields } from '../../../src/query/builders';
import type { ModelMetadata } from '../../../src/types';

const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    { name: 'id', type: 'record', isId: true, isUnique: false, isRequired: true },
    { name: 'name', type: 'string', isId: false, isUnique: false, isRequired: true },
    {
      name: 'createdAt',
      type: 'date',
      isId: false,
      isUnique: false,
      timestampDecorator: 'createdAt',
      isRequired: true,
    },
    {
      name: 'status',
      type: 'string',
      isId: false,
      isUnique: false,
      isRequired: true,
      defaultValue: 'active',
    },
  ],
};

describe('insert builder', () => {
  test('builds CREATE query', () => {
    const data = { name: 'John' };
    const result = buildCreateQuery(userModel, data);

    expect(result.text).toContain('CREATE ONLY user CONTENT');
    expect(result.text).toContain('RETURN');
  });

  test('stripComputedFields removes @now fields from data', () => {
    const computedModel: ModelMetadata = {
      name: 'Item',
      tableName: 'item',
      fields: [
        { name: 'id', type: 'record', isId: true, isUnique: false, isRequired: true },
        { name: 'name', type: 'string', isId: false, isUnique: false, isRequired: true },
        {
          name: 'accessedAt',
          type: 'date',
          isId: false,
          isUnique: false,
          timestampDecorator: 'now',
          isRequired: false,
        },
      ],
    };
    const data: Record<string, unknown> = { name: 'Test', accessedAt: new Date() };
    const result = stripComputedFields(data, computedModel);

    expect(result.accessedAt).toBeUndefined();
    expect(result.name).toBe('Test');
  });

  test('stripComputedFields preserves @createdAt and @updatedAt fields', () => {
    const data: Record<string, unknown> = { name: 'John', createdAt: '2024-01-01T00:00:00.000Z' };
    const result = stripComputedFields(data, userModel);

    // @createdAt fields are NOT computed — they should be preserved
    expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(result.name).toBe('John');
  });

  test('stripComputedFields passes through data when no @now fields', () => {
    const data: Record<string, unknown> = { name: 'John' };
    const result = stripComputedFields(data, userModel);

    expect(result.name).toBe('John');
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
