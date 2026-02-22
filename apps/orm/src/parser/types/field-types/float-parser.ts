/**
 * Parser for Float field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Float */
export function isFloatType(token: string): boolean {
  return token === 'Float';
}

/** Get the schema field type for Float */
export function getFloatFieldType(): SchemaFieldType {
  return 'float';
}
