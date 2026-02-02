/**
 * Data transformer - transforms data for queries
 */

import { RecordId } from 'surrealdb';
import type { ModelMetadata, SchemaFieldType } from '../../types';

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
 * @param tableName The table name for record
 * @param value The id value (string)
 */
export function transformRecordId(tableName: string, value: string): RecordId {
  return new RecordId(tableName, value);
}

/**
 * Transform or validate a record id value
 * If value is a string, creates RecordId from it (handles "table:id" format)
 * If value is already a RecordId, validates it starts with expected tableName
 * @param tableName The expected table name
 * @param value The id value (string or RecordId)
 * @returns RecordId
 */
export function transformOrValidateRecordId(tableName: string, value: string | RecordId): RecordId {
  // If it's already a RecordId, validate table name
  if (value instanceof RecordId) {
    if (value.table.name !== tableName) {
      throw new Error(`RecordId table "${value.table.name}" does not match expected table "${tableName}"`);
    }
    return value;
  }

  // Check if string is in "table:id" format
  if (typeof value === 'string' && value.includes(':')) {
    if (!value.startsWith(`${tableName}:`)) {
      throw new Error(`RecordId table "${value.split(':')[0]}" does not start with expected table "${tableName}"`);
    }

    const [, idPart] = value.split(':');
    if (!idPart) throw new Error(`Invalid RecordId format: ${value}`);

    // Create RecordId from the id part (since we've validated the table)
    return new RecordId(tableName, idPart);
  }

  // Otherwise, create a new RecordId from string with expected table name
  return new RecordId(tableName, value);
}

/** Find target table for a Record field by looking at paired Relation field */
function findRecordTargetTable(fieldName: string, model: ModelMetadata): string | undefined {
  // Find a Relation field that references this Record field
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === fieldName);
  return pairedRelation?.relationInfo?.targetTable;
}

/** Transform data object based on model fields */
export function transformData(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = model.fields.find((f) => f.name === key);
    if (field) {
      // Handle id/record fields specially with RecordId
      if (field.isId && value !== undefined && value !== null) {
        result[key] = transformRecordId(model.tableName, String(value));
      } else if (field.type === 'record') {
        // For record fields, skip undefined but pass null through
        // The update builder handles null -> NONE translation
        if (value === undefined) continue;
        // Pass null through - update builder will handle it
        if (value === null) {
          result[key] = null;
          continue;
        }
        // Handle Record fields - transform to RecordId
        const targetTable = findRecordTargetTable(field.name, model);
        if (targetTable) {
          if (field.isArray) {
            if (Array.isArray(value)) {
              // Array of records - direct assignment
              result[key] = value.map((element) => transformOrValidateRecordId(targetTable, String(element)));
            } else if (typeof value === 'object' && ('push' in value || 'unset' in value)) {
              // Push/unset operations for Record[] - transform values inside
              const ops = value as { push?: unknown; unset?: unknown };
              const transformed: { push?: unknown; unset?: unknown } = {};
              if (ops.push !== undefined) {
                transformed.push = Array.isArray(ops.push)
                  ? ops.push.map((el) => transformOrValidateRecordId(targetTable, String(el)))
                  : transformOrValidateRecordId(targetTable, String(ops.push));
              }
              if (ops.unset !== undefined) {
                transformed.unset = Array.isArray(ops.unset)
                  ? ops.unset.map((el) => transformOrValidateRecordId(targetTable, String(el)))
                  : transformOrValidateRecordId(targetTable, String(ops.unset));
              }
              result[key] = transformed;
            } else {
              result[key] = value;
            }
          } else {
            // Single record
            result[key] = transformOrValidateRecordId(targetTable, String(value));
          }
        } else {
          // No paired relation found, keep value as-is
          result[key] = value;
        }
      } else if (field.isArray) {
        // Handle array fields - direct assignment or push/unset operations
        if (Array.isArray(value)) {
          // Direct array assignment - transform each element
          result[key] = value.map((element) => transformValue(element, field.type));
        } else if (typeof value === 'object' && value !== null) {
          // Push/unset operations - pass through as-is (handled by update builder)
          result[key] = value;
        } else {
          result[key] = value;
        }
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
 * Apply defaults to data for create operation:
 * - Empty arrays for array fields that are undefined
 * - Filter out relation fields (they're virtual)
 * - Apply @default(null) for fields with that decorator
 * - Handle NONE vs null semantics
 *
 * NONE vs null in SurrealDB:
 * - NONE: field doesn't exist (omit from data)
 * - null: field exists with null value
 *
 * Schema semantics:
 * - `field String?` (no @default): undefined → NONE (omit field)
 * - `field String? @default(null)`: undefined → null (store null)
 * - `field Record?`: undefined → null (so they can be queried for null)
 */
export function applyNowDefaults(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };

  for (const field of model.fields) {
    // Skip relation fields - they're virtual and shouldn't be sent to database
    if (field.type === 'relation') {
      delete result[field.name];
      continue;
    }

    // For optional record fields, default undefined to null (so they can be queried for null)
    // This allows: { where: { authorId: null } } to find records without authors
    if (field.type === 'record' && !field.isRequired && result[field.name] === undefined) {
      result[field.name] = null;
      continue;
    }

    // Apply @default(null) - if field has this and value is undefined, set to null
    if (field.defaultValue === null && result[field.name] === undefined) {
      result[field.name] = null;
      continue;
    }

    // Apply empty array default for array fields that are undefined
    if (field.isArray && result[field.name] === undefined) {
      result[field.name] = [];
    }
  }

  return result;
}

/** Filter data to only include model fields */
export function filterModelFields(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldNames = new Set(model.fields.map((f) => f.name));

  for (const [key, value] of Object.entries(data)) {
    if (fieldNames.has(key)) {
      result[key] = value;
    }
  }

  return result;
}
