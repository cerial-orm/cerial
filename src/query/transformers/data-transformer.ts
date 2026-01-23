/**
 * Data transformer - transforms data for queries
 */

import type { ModelMetadata, FieldMetadata, SchemaFieldType } from '../../types';

/** Transform a value based on field type */
export function transformValue(value: unknown, fieldType: SchemaFieldType): unknown {
  if (value === null || value === undefined) return value;

  switch (fieldType) {
    case 'date':
      if (value instanceof Date) return value.toISOString();
      if (typeof value === 'string') return value;
      return value;

    case 'int':
      if (typeof value === 'number') return Math.floor(value);
      if (typeof value === 'string') return parseInt(value, 10);
      return value;

    case 'float':
      if (typeof value === 'number') return value;
      if (typeof value === 'string') return parseFloat(value);
      return value;

    case 'bool':
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return Boolean(value);

    case 'string':
    case 'email':
      return String(value);

    default:
      return value;
  }
}

/** Transform data object based on model fields */
export function transformData(
  data: Record<string, unknown>,
  model: ModelMetadata,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = model.fields.find((f) => f.name === key);
    if (field) {
      result[key] = transformValue(value, field.type);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/** Apply @now defaults to data */
export function applyNowDefaults(
  data: Record<string, unknown>,
  model: ModelMetadata,
): Record<string, unknown> {
  const result = { ...data };

  for (const field of model.fields) {
    if (field.hasNowDefault && result[field.name] === undefined) {
      result[field.name] = new Date().toISOString();
    }
  }

  return result;
}

/** Filter data to only include model fields */
export function filterModelFields(
  data: Record<string, unknown>,
  model: ModelMetadata,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldNames = new Set(model.fields.map((f) => f.name));

  for (const [key, value] of Object.entries(data)) {
    if (fieldNames.has(key)) {
      result[key] = value;
    }
  }

  return result;
}
