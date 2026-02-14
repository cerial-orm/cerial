/**
 * Data transformer - transforms data for queries
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { ModelMetadata, ObjectFieldMetadata, SchemaFieldType, TupleFieldMetadata } from '../../types';
import { CerialId, type RecordIdInput } from '../../utils/cerial-id';
import { isNone, NONE } from '../../utils/none';

/** Transform a value based on field type */
export function transformValue(value: unknown, fieldType: SchemaFieldType): unknown {
  if (value === null || value === undefined) return value;
  // NONE sentinel passes through — handled by update/create builders
  if (isNone(value)) return NONE;

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

    // Tuple field in objects — transform and normalize to array
    if (field.type === 'tuple' && field.tupleInfo) {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((item) => transformTupleData(item, field.tupleInfo!));
      } else {
        result[key] = transformTupleData(value, field.tupleInfo);
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

/**
 * Determine if a value represents a single tuple input (vs an array of tuple inputs).
 * Object form is always a single tuple. For array form, check if the shape matches
 * the tuple definition (length equals element count and first element is a primitive).
 */
function isSingleTupleInput(value: unknown, tupleInfo: TupleFieldMetadata): boolean {
  // Object form: always a single tuple
  if (!Array.isArray(value)) return typeof value === 'object' && value !== null;
  // Empty array: not a single tuple
  if (!value.length) return false;
  const firstEl = value[0];
  // If first element is an array or non-null object, it's likely an array of tuples
  if (Array.isArray(firstEl) || (typeof firstEl === 'object' && firstEl !== null)) return false;
  // Primitive first element + length matches tuple element count → single tuple
  return value.length === tupleInfo.elements.length;
}

/**
 * Transform tuple data based on tupleInfo element definitions.
 * Handles object elements, nested tuple elements, record elements, and primitive elements.
 * Accepts both array form [a, b] and object form { 0: a, 1: b, name: a } — normalizes to array.
 */
function transformTupleData(data: unknown, tupleInfo: TupleFieldMetadata): unknown[] {
  // Normalize object form to array form
  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = [...data];
  } else if (typeof data === 'object' && data !== null) {
    // Object form: { 0: val, 1: val, name: val }
    // Map named keys to indexes, then fill by index
    const obj = data as Record<string, unknown>;
    arr = new Array(tupleInfo.elements.length);
    for (const element of tupleInfo.elements) {
      // Try named key first, then index key
      if (element.name !== undefined && element.name in obj) {
        arr[element.index] = obj[element.name];
      } else if (String(element.index) in obj) {
        arr[element.index] = obj[String(element.index)];
      }
    }
  } else {
    return data as unknown[];
  }

  // Transform each element by type
  for (const element of tupleInfo.elements) {
    const value = arr[element.index];
    if (value === null || value === undefined) continue;

    if (element.type === 'object' && element.objectInfo) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        arr[element.index] = transformObjectData(value as Record<string, unknown>, element.objectInfo);
      }
    } else if (element.type === 'tuple' && element.tupleInfo) {
      arr[element.index] = transformTupleData(value, element.tupleInfo);
    } else if (element.type === 'record') {
      arr[element.index] = parseRecordIdInput(toRecordIdInput(value));
    } else {
      arr[element.index] = transformValue(value, element.type);
    }
  }

  return arr;
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
        // For record fields, skip undefined but pass null and NONE sentinel through
        // The update builder handles null/NONE → SurrealQL NONE/NULL translation
        if (value === undefined) continue;
        // NONE sentinel → pass through for builder to handle
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
        // null → pass through for builder to handle (NONE for non-nullable, NULL for nullable)
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
        // Objects cannot be @nullable (validated in schema), so null → skip (NONE)
        if (value === undefined || value === null) continue;
        // NONE sentinel → pass through for builder to handle
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
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
      } else if (field.type === 'tuple' && field.tupleInfo) {
        // Handle tuple fields - transform and normalize to array
        if (value === undefined) continue;
        // NONE sentinel → pass through for builder to handle
        if (isNone(value)) {
          result[key] = NONE;
          continue;
        }
        // Pass null through — builder converts to NONE (non-nullable) or NULL (@nullable)
        if (value === null) {
          result[key] = null;
          continue;
        }
        if (field.isArray) {
          if (Array.isArray(value)) {
            // Direct array assignment: [[1,2], [3,4]]
            result[key] = value.map((item) => transformTupleData(item, field.tupleInfo!));
          } else if (typeof value === 'object' && value !== null) {
            // Push/set operations: { push: [...], set: [...] }
            const ops = value as Record<string, unknown>;
            if ('set' in ops && ops.set !== undefined) {
              // set = full array replacement → unwrap to direct array assignment
              result[key] = Array.isArray(ops.set)
                ? ops.set.map((item) => transformTupleData(item, field.tupleInfo!))
                : ops.set;
            } else if ('push' in ops && ops.push !== undefined) {
              const transformed: Record<string, unknown> = {};
              if (isSingleTupleInput(ops.push, field.tupleInfo!)) {
                // Single tuple: wrap in array so SurrealDB += appends one tuple element
                transformed.push = [transformTupleData(ops.push, field.tupleInfo!)];
              } else if (Array.isArray(ops.push)) {
                // Array of tuples
                transformed.push = ops.push.map((item) => transformTupleData(item, field.tupleInfo!));
              } else {
                transformed.push = ops.push;
              }
              result[key] = transformed;
            } else {
              result[key] = value;
            }
          } else {
            result[key] = value;
          }
        } else {
          result[key] = transformTupleData(value, field.tupleInfo);
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
 * Schema semantics (with @nullable):
 * - `field String?` (no @default): undefined → NONE (omit field)
 * - `field String? @default(null)`: undefined → null (store null, requires @nullable)
 * - `field Record? @nullable`: undefined → null (so they can be queried for null)
 * - `field Record?` (non-nullable): undefined → NONE (omit field)
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

    // For optional @nullable record fields, default undefined to null (so they can be queried for null)
    // For optional non-nullable record fields, leave as undefined (NONE)
    // Skip @id fields - they should remain undefined for auto-generation
    if (field.type === 'record' && !field.isRequired && !field.isId && result[field.name] === undefined) {
      if (field.isNullable) {
        result[field.name] = null;
      }
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
