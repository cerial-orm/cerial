/**
 * Parser for String field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is String */
export function isStringType(token: string): boolean {
  return token === 'String';
}

/** Get the schema field type for String */
export function getStringFieldType(): SchemaFieldType {
  return 'string';
}
