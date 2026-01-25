/**
 * Result mapper - maps query results to typed responses
 */

import type { ModelMetadata, SchemaFieldType, SelectClause } from '../../types';

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

/** Map a single record from SurrealDB result */
export function mapRecord(record: Record<string, unknown>, model: ModelMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of model.fields) {
    const value = record[field.name];
    result[field.name] = mapFieldValue(value, field.type);
  }

  // Include id if present
  if ('id' in record) {
    result['id'] = record['id'];
  }

  return result;
}

/** Filter record fields based on select clause */
export function filterFields(
  record: Record<string, unknown>,
  select: SelectClause | undefined,
): Record<string, unknown> {
  if (!select) return record;

  const result: Record<string, unknown> = {};

  for (const [field, include] of Object.entries(select)) {
    if (include && field in record) {
      result[field] = record[field];
    }
  }

  // Always include id if present
  if ('id' in record) {
    result['id'] = record['id'];
  }

  return result;
}

/** Map query result to typed response */
export function mapResult<T>(result: unknown, model: ModelMetadata, select?: SelectClause): T[] {
  if (!result) return [];

  // SurrealDB returns arrays
  if (!Array.isArray(result)) {
    return [filterFields(mapRecord(result as Record<string, unknown>, model), select)] as T[];
  }

  return result
    .map((record) => {
      if (!record || typeof record !== 'object') return null;
      return filterFields(mapRecord(record as Record<string, unknown>, model), select);
    })
    .filter(Boolean) as T[];
}

/** Map single record result */
export function mapSingleResult<T>(result: unknown, model: ModelMetadata, select?: SelectClause): T | null {
  const mapped = mapResult<T>(result, model, select);
  return mapped[0] ?? null;
}
