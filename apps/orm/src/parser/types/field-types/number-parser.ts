/**
 * Parser for Number field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Number */
export function isNumberType(token: string): boolean {
  return token === 'Number';
}

/** Get the schema field type for Number */
export function getNumberFieldType(): SchemaFieldType {
  return 'number';
}
