/**
 * Data transformer - transforms data for queries
 */

import { RecordId } from 'surrealdb';
import type { ModelMetadata, FieldMetadata, SchemaFieldType } from '../../types';

/** Transform a value based on field type */
export function transformValue(value: unknown, fieldType: SchemaFieldType): unknown {
  if (value === null || value === undefined) return value;

  switch (fieldType) {
    case 'date':
      // Return Date object - SurrealDB SDK handles the conversion
      if (value instanceof Date) return value;
      if (typeof value === 'string') return new Date(value);
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

    case 'record':
      // RecordId is handled separately in transformRecordId
      return value;

    default:
      return value;
  }
}

/**
 * Transform a record id value using SurrealDB's RecordId
 * @param tableName The table name for the record
 * @param value The id value (string)
 */
export function transformRecordId(tableName: string, value: string): RecordId {
  return new RecordId(tableName, value);
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
      // Handle id/record fields specially with RecordId
      if (field.isId && value !== undefined && value !== null) {
        result[key] = transformRecordId(model.tableName, String(value));
      } else {
        result[key] = transformValue(value, field.type);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Apply @now defaults to data
 * NOTE: If the table schema has DEFAULT time::now() defined, this is not needed
 * as the database will handle it. This is kept for compatibility.
 */
export function applyNowDefaults(
  data: Record<string, unknown>,
  _model: ModelMetadata,
): Record<string, unknown> {
  // Don't apply @now defaults here - let the database handle it
  // through the DEFINE FIELD ... DEFAULT time::now() statement.
  // This ensures proper datetime type handling in SurrealDB.
  return { ...data };
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
