/**
 * Parser for Bool field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Bool */
export function isBoolType(token: string): boolean {
  return token === 'Bool';
}

/** Get the schema field type for Bool */
export function getBoolFieldType(): SchemaFieldType {
  return 'bool';
}
