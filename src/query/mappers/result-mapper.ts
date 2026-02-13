/**
 * Result mapper - maps query results to typed responses
 */

import type { RecordId } from 'surrealdb';
import type { ModelMetadata, ObjectFieldMetadata, SchemaFieldType, TupleFieldMetadata } from '../../types';
import { CerialId } from '../../utils/cerial-id';

/** Check if value is a RecordId-like object */
function isRecordId(value: unknown): value is RecordId {
  return typeof value === 'object' && value !== null && 'id' in value && 'table' in value;
}

/** Map a single field value from SurrealDB result */
export function mapFieldValue(value: unknown, fieldType: SchemaFieldType): unknown {
  if (value === null || value === undefined) return null;

  switch (fieldType) {
    case 'date':
      // Native Date
      if (value instanceof Date) return value;
      // String - parse to Date
      if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      // SurrealDB DateTime object - has toString() method that returns ISO string
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { toString: () => string }).toString === 'function'
      ) {
        const dateStr = (value as { toString: () => string }).toString();
        const date = new Date(dateStr);
        return Number.isNaN(date.getTime()) ? null : date;
      }
      return null;

    case 'int':
      if (typeof value === 'number') return Math.floor(value);
      return null;

    case 'float':
      if (typeof value === 'number') return value;
      return null;

    case 'bool':
      return Boolean(value);

    case 'string':
    case 'email':
      return String(value);

    case 'record':
      // Convert RecordId to CerialId
      if (isRecordId(value)) {
        return transformRecordIdToCerialId(value);
      }
      // If it's a string, parse it to CerialId
      if (typeof value === 'string') {
        return CerialId.fromString(value);
      }

      return value;

    case 'relation':
      // Relation fields contain included records - process them to transform ids
      return processNestedValue(value);

    default:
      return value;
  }
}

/**
 * Transform a RecordId to CerialId
 * @param recordId The record id from SurrealDB
 * @returns CerialId instance
 */
export function transformRecordIdToCerialId(recordId: RecordId): CerialId {
  return CerialId.fromRecordId(recordId);
}

/**
 * Transform a RecordId to plain ID string (without table prefix)
 * @deprecated Use transformRecordIdToCerialId instead
 * @param recordId The record id
 * @returns The id value without table prefix
 */
export function transformRecordIdToValue(recordId: RecordId): string {
  return recordId.id.toString();
}

/**
 * Transform an id string that may be in "table:id" format to CerialId
 */
function transformIdString(value: string): CerialId {
  return CerialId.fromString(value);
}

/**
 * Process a nested value (from included relations) to transform ids to CerialId
 * Handles objects, arrays, and RecordIds
 */
function processNestedValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Handle RecordId - convert to CerialId
  if (isRecordId(value)) {
    return transformRecordIdToCerialId(value);
  }

  // Handle arrays (array of included records)
  if (Array.isArray(value)) {
    return value.map((element) => processNestedValue(element));
  }

  // Handle objects (included record)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      if (key === 'id') {
        // Transform id field to CerialId
        if (isRecordId(val)) {
          result['id'] = transformRecordIdToCerialId(val);
        } else if (typeof val === 'string') {
          result['id'] = transformIdString(val);
        } else {
          result['id'] = val;
        }
      } else {
        // Recursively process nested values
        result[key] = processNestedValue(val);
      }
    }

    return result;
  }

  return value;
}

/**
 * Map an object record from SurrealDB result using objectInfo field definitions.
 * Handles Record fields within objects (RecordId → CerialId), nested objects, and arrays.
 */
function mapObjectRecord(obj: Record<string, unknown>, objectInfo: ObjectFieldMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const field = objectInfo.fields.find((f) => f.name === key);

    if (!field) {
      // Unknown field - pass through (might be extra SurrealDB data)
      result[key] = value;
      continue;
    }

    if (value === null || value === undefined) {
      result[key] = null;
      continue;
    }

    // Nested object field
    if (field.type === 'object' && field.objectInfo) {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? mapObjectRecord(item as Record<string, unknown>, field.objectInfo!)
            : item,
        );
      } else if (typeof value === 'object') {
        result[key] = mapObjectRecord(value as Record<string, unknown>, field.objectInfo);
      } else {
        result[key] = value;
      }
      continue;
    }

    // Tuple field in objects
    if (field.type === 'tuple' && field.tupleInfo) {
      if (field.isArray && Array.isArray(value)) {
        result[key] = value.map((item) => (Array.isArray(item) ? mapTupleRecord(item, field.tupleInfo!) : item));
      } else if (Array.isArray(value)) {
        result[key] = mapTupleRecord(value, field.tupleInfo);
      } else {
        result[key] = value;
      }
      continue;
    }

    // Array fields
    if (field.isArray && Array.isArray(value)) {
      result[key] = value.map((element) => mapFieldValue(element, field.type));
      continue;
    }

    // Standard fields
    result[key] = mapFieldValue(value, field.type);
  }

  return result;
}

/**
 * Map a tuple result array from SurrealDB using tupleInfo element definitions.
 * Handles object elements, nested tuple elements, record elements (RecordId → CerialId), and primitives.
 */
function mapTupleRecord(arr: unknown[], tupleInfo: TupleFieldMetadata): unknown[] {
  const result = [...arr];

  for (const element of tupleInfo.elements) {
    const value = result[element.index];
    if (value === null || value === undefined) continue;

    if (element.type === 'object' && element.objectInfo) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        result[element.index] = mapObjectRecord(value as Record<string, unknown>, element.objectInfo);
      }
    } else if (element.type === 'tuple' && element.tupleInfo) {
      if (Array.isArray(value)) {
        result[element.index] = mapTupleRecord(value, element.tupleInfo);
      }
    } else {
      result[element.index] = mapFieldValue(value, element.type);
    }
  }

  return result;
}

/** Map a single record from SurrealDB result */
export function mapRecord(record: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // First, map fields that are present in the record
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') {
      // Handle both RecordId objects and string IDs - convert to CerialId
      if (isRecordId(value)) {
        result['id'] = transformRecordIdToCerialId(value);
      } else if (typeof value === 'string') {
        // Parse string to CerialId
        result['id'] = transformIdString(value);
      } else {
        result['id'] = value;
      }
      continue;
    }

    const field = model.fields.find((f) => f.name === key);
    if (field) {
      // Handle object fields - recursively map
      if (field.type === 'object' && field.objectInfo) {
        if (value === null || value === undefined) {
          result[key] = null;
        } else if (field.isArray && Array.isArray(value)) {
          result[key] = value.map((item) =>
            typeof item === 'object' && item !== null
              ? mapObjectRecord(item as Record<string, unknown>, field.objectInfo!)
              : item,
          );
        } else if (typeof value === 'object') {
          result[key] = mapObjectRecord(value as Record<string, unknown>, field.objectInfo);
        } else {
          result[key] = value;
        }
      } else if (field.type === 'tuple' && field.tupleInfo) {
        // Handle tuple fields - map each element by type
        if (value === null || value === undefined) {
          result[key] = null;
        } else if (field.isArray && Array.isArray(value)) {
          result[key] = value.map((item) => (Array.isArray(item) ? mapTupleRecord(item, field.tupleInfo!) : item));
        } else if (Array.isArray(value)) {
          result[key] = mapTupleRecord(value, field.tupleInfo);
        } else {
          result[key] = value;
        }
      } else if (field.isArray && Array.isArray(value)) {
        // Handle array fields - map each element
        result[key] = value.map((element) => mapFieldValue(element, field.type));
      } else {
        result[key] = mapFieldValue(value, field.type);
      }
    } else {
      // Field not in schema - might be an included relation
      // Process nested objects to transform ids to CerialId
      result[key] = processNestedValue(value);
    }
  }

  // Then, ensure optional Record fields not in the result are set to null
  for (const field of model.fields) {
    if (field.type === 'record' && !field.isRequired && !(field.name in result)) {
      result[field.name] = null;
    }
  }

  return result;
}

/** Map query result to typed response */
export function mapResult<T>(result: unknown, model: ModelMetadata): T[] {
  if (!result) return [];

  // SurrealDB returns arrays
  if (!Array.isArray(result)) {
    return [mapRecord(result as Record<string, unknown>, model)] as T[];
  }

  return result
    .map((record) => {
      if (!record || typeof record !== 'object') return null;
      return mapRecord(record as Record<string, unknown>, model);
    })
    .filter(Boolean) as T[];
}

/** Map single record result */
export function mapSingleResult<T>(result: unknown, model: ModelMetadata): T | null {
  const mapped = mapResult<T>(result, model);
  return mapped[0] ?? null;
}
