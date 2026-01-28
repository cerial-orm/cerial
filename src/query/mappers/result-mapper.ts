/**
 * Result mapper - maps query results to typed responses
 */

import type { RecordId } from 'surrealdb';
import type { ModelMetadata, SchemaFieldType } from '../../types';

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

    default:
      return value;
  }
}

/**
 * Transform a record id to value without the table name
 * @param recordId The record id
 * @returns The id value
 */
export function transformRecordIdToValue(recordId: RecordId): string {
  return recordId.id.toString();
}

/** Map a single record from SurrealDB result */
export function mapRecord(record: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Only map fields that are actually present in the record
  // (DB already filtered via SELECT clause)
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') {
      result['id'] = transformRecordIdToValue(value as RecordId);
      continue;
    }

    const field = model.fields.find((f) => f.name === key);
    if (field) {
      result[key] = mapFieldValue(value, field.type);
    } else {
      // Field not in schema, include as-is
      result[key] = value;
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
