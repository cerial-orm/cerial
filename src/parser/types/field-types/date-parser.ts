/**
 * Parser for Date field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Date */
export function isDateType(token: string): boolean {
  return token === 'Date';
}

/** Get the schema field type for Date */
export function getDateFieldType(): SchemaFieldType {
  return 'date';
}
