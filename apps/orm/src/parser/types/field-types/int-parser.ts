/**
 * Parser for Int field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Int */
export function isIntType(token: string): boolean {
  return token === 'Int';
}

/** Get the schema field type for Int */
export function getIntFieldType(): SchemaFieldType {
  return 'int';
}
