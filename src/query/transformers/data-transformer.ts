/**
 * Data transformer - transforms data for queries
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { ModelMetadata, ObjectFieldMetadata, SchemaFieldType } from '../../types';
import { CerialId, type RecordIdInput } from '../../utils/cerial-id';

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
 * Accepts RecordIdInput (CerialId | RecordId | StringRecordId | string)
 * @param tableName The table name for record
 * @param value The id value (RecordIdInput)
 */
export function transformRecordId(tableName: string, value: RecordIdInput): RecordId {
  // Use CerialId.parse() to handle all input types with table validation
  const cerialId = CerialId.parse(value, tableName);

  return cerialId.toRecordId();
}

/**
 * Transform or validate a record id value
 * Accepts all RecordIdInput types: CerialId, RecordId, StringRecordId, string
 * Validates that the table matches the expected tableName
 * @param tableName The expected table name
 * @param value The id value (RecordIdInput)
 * @returns RecordId
 */
export function transformOrValidateRecordId(tableName: string, value: RecordIdInput): RecordId {
  // Handle CerialId - use its built-in validation
  if (CerialId.is(value)) {
    if (value.hasTable && value.table !== tableName) {
      throw new Error(`CerialId table "${value.table}" does not match expected table "${tableName}"`);
    }
    // If no table, set it
    if (!value.hasTable) {
      return new RecordId(tableName, value.id);
    }

    return value.toRecordId();
  }

  // Handle RecordId - validate table name matches
  if (value instanceof RecordId) {
    if (value.table.name !== tableName) {
      throw new Error(`RecordId table "${value.table.name}" does not match expected table "${tableName}"`);
    }

    return value;
  }

  // Handle StringRecordId - parse and validate
  if (value instanceof StringRecordId) {
    const cerialId = CerialId.parse(value, tableName);

    return cerialId.toRecordId();
  }

  // Handle string - parse and create RecordId
  if (typeof value === 'string') {
    const cerialId = CerialId.parse(value, tableName);

    return cerialId.toRecordId();
  }

  throw new Error(`Invalid RecordIdInput type: ${typeof value}`);
}

/** Find target table for a Record field by looking at paired Relation field */
function findRecordTargetTable(fieldName: string, model: ModelMetadata): string | undefined {
  // Find a Relation field that references this Record field
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === fieldName);
  return pairedRelation?.relationInfo?.targetTable;
}

/**
 * Convert a value to RecordIdInput for use with transformOrValidateRecordId
 * Handles CerialId, RecordId, StringRecordId, and string
 */
function toRecordIdInput(value: unknown): RecordIdInput {
  if (CerialId.is(value)) return value;
  if (value instanceof RecordId) return value;
  if (value instanceof StringRecordId) return value;

  return String(value);
}

/**
 * Parse a RecordIdInput into a RecordId without table validation.
 * Used for Record fields within objects where no target table is known.
 */
function parseRecordIdInput(value: RecordIdInput): RecordId {
  if (value instanceof RecordId) return value;
  if (CerialId.is(value)) return value.toRecordId();
  if (value instanceof StringRecordId) return CerialId.parse(value).toRecordId();
  if (typeof value === 'string') return CerialId.parse(value).toRecordId();
  throw new Error(`Invalid RecordIdInput type: ${typeof value}`);
}

/**
 * Recursively transform object data based on objectInfo field definitions.
 * Handles Record fields within objects (convert to RecordId), nested objects, and arrays of objects.
 */
function transformObjectData(data: Record<string, unknown>, objectInfo: ObjectFieldMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = objectInfo.fields.find((f) => f.name === key);
    if (!field) {
      result[key] = value;
      continue;
    }

    if (value === null || value === undefined) {
      result[key] = value;
      continue;
    }

    // Nested object field
    if (field.type === 'object' && field.objectInfo) {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? transformObjectData(item as Record<string, unknown>, field.objectInfo!)
            : item,
        );
      } else if (typeof value === 'object') {
        result[key] = transformObjectData(value as Record<string, unknown>, field.objectInfo);
      } else {
        result[key] = value;
      }
      continue;
    }

    // Record fields in objects — convert RecordIdInput → RecordId
    if (field.type === 'record') {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((element) => {
          if (element === null || element === undefined) return element;

          return parseRecordIdInput(toRecordIdInput(element));
        });
      } else {
        result[key] = parseRecordIdInput(toRecordIdInput(value));
      }
      continue;
    }

    // Array fields
    if (field.isArray && Array.isArray(value)) {
      result[key] = value.map((element) => transformValue(element, field.type));
      continue;
    }

    // Standard field
    result[key] = transformValue(value, field.type);
  }

  return result;
}

/** Transform data object based on model fields */
export function transformData(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const field = model.fields.find((f) => f.name === key);
    if (field) {
      // Handle id/record fields specially with RecordId
      if (field.isId && value !== undefined && value !== null) {
        result[key] = transformRecordId(model.tableName, toRecordIdInput(value));
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
              result[key] = value.map((element) => transformOrValidateRecordId(targetTable, toRecordIdInput(element)));
            } else if (typeof value === 'object' && ('push' in value || 'unset' in value)) {
              // Push/unset operations for Record[] - transform values inside
              const ops = value as { push?: unknown; unset?: unknown };
              const transformed: { push?: unknown; unset?: unknown } = {};
              if (ops.push !== undefined) {
                transformed.push = Array.isArray(ops.push)
                  ? ops.push.map((el) => transformOrValidateRecordId(targetTable, toRecordIdInput(el)))
                  : transformOrValidateRecordId(targetTable, toRecordIdInput(ops.push));
              }
              if (ops.unset !== undefined) {
                transformed.unset = Array.isArray(ops.unset)
                  ? ops.unset.map((el) => transformOrValidateRecordId(targetTable, toRecordIdInput(el)))
                  : transformOrValidateRecordId(targetTable, toRecordIdInput(ops.unset));
              }
              result[key] = transformed;
            } else {
              result[key] = value;
            }
          } else {
            // Single record
            result[key] = transformOrValidateRecordId(targetTable, toRecordIdInput(value));
          }
        } else {
          // No paired relation found, keep value as-is
          result[key] = value;
        }
      } else if (field.type === 'object' && field.objectInfo) {
        // Handle object fields - recursively transform
        // Object fields don't support null — treat null as NONE (skip like undefined)
        if (value === undefined || value === null) continue;
        if (field.isArray && Array.isArray(value)) {
          result[key] = value.map((item) =>
            typeof item === 'object' && item !== null
              ? transformObjectData(item as Record<string, unknown>, field.objectInfo!)
              : item,
          );
        } else if (typeof value === 'object') {
          result[key] = transformObjectData(value as Record<string, unknown>, field.objectInfo);
        } else {
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
export function applyFieldDefaults(data: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };

  for (const field of model.fields) {
    // Skip relation fields - they're virtual and shouldn't be sent to database
    if (field.type === 'relation') {
      delete result[field.name];
      continue;
    }

    // Strip @now (COMPUTED) fields - they are not stored, computed at query time
    if (field.timestampDecorator === 'now') {
      delete result[field.name];
      continue;
    }

    // For optional record fields, default undefined to null (so they can be queried for null)
    // This allows: { where: { authorId: null } } to find records without authors
    // Skip @id fields - they should remain undefined for auto-generation
    if (field.type === 'record' && !field.isRequired && !field.isId && result[field.name] === undefined) {
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

/**
 * @deprecated Use applyFieldDefaults instead. This alias exists for backwards compatibility.
 */
export const applyNowDefaults = applyFieldDefaults;

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
