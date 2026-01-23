/**
 * Value formatter - formats values for SurrealDB queries
 */

import type { SchemaFieldType } from '../../types';
import { escapeString } from '../../utils/string-utils';

/** Format a value for direct inclusion in a query (non-parameterized) */
export function formatValue(value: unknown, fieldType: SchemaFieldType): string {
  if (value === null || value === undefined) {
    return 'NONE';
  }

  switch (fieldType) {
    case 'string':
    case 'email':
      return `"${escapeString(String(value))}"`;

    case 'int':
      return String(Math.floor(Number(value)));

    case 'float':
      return String(Number(value));

    case 'bool':
      return value ? 'true' : 'false';

    case 'date':
      if (value instanceof Date) {
        return `d"${value.toISOString()}"`;
      }
      return `d"${String(value)}"`;

    default:
      if (typeof value === 'string') {
        return `"${escapeString(value)}"`;
      }
      return String(value);
  }
}

/** Format an array of values */
export function formatArray(values: unknown[], fieldType: SchemaFieldType): string {
  const formatted = values.map((v) => formatValue(v, fieldType));
  return `[${formatted.join(', ')}]`;
}

/** Format an object as JSON */
export function formatObject(obj: Record<string, unknown>): string {
  return JSON.stringify(obj);
}
