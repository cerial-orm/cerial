/**
 * Value formatter - formats values for SurrealDB queries
 */

import type { SchemaFieldType } from '../../types';
import { isNone } from '../../utils/none';
import { escapeString } from '../../utils/string-utils';

/** Format a value for direct inclusion in a query (non-parameterized) */
export function formatValue(value: unknown, fieldType: SchemaFieldType): string {
  // NONE sentinel or undefined → SurrealDB NONE (field absent)
  if (value === undefined || isNone(value)) {
    return 'NONE';
  }

  // null → SurrealDB NULL (explicit null value, for @nullable fields)
  if (value === null) {
    return 'NULL';
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
      // Anything that is not a date has to parse as one, so the text between the quotes is an ISO string
      return `d"${toIsoDate(value)}"`;

    default:
      if (typeof value === 'string') {
        return `"${escapeString(value)}"`;
      }
      // Only scalars print bare; any other value becomes a quoted, escaped string
      if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);

      return `"${escapeString(String(value))}"`;
  }
}

function toIsoDate(value: unknown): string {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new TypeError(`Cannot format ${JSON.stringify(String(value))} as a date`);

  return date.toISOString();
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
