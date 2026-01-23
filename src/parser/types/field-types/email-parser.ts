/**
 * Parser for Email field type
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Email */
export function isEmailType(token: string): boolean {
  return token === 'Email';
}

/** Get the schema field type for Email */
export function getEmailFieldType(): SchemaFieldType {
  return 'email';
}
