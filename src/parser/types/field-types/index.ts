/**
 * Field types barrel export
 */

import type { SchemaFieldType } from '../../../types';
import { isStringType, getStringFieldType } from './string-parser';
import { isEmailType, getEmailFieldType } from './email-parser';
import { isIntType, getIntFieldType } from './int-parser';
import { isDateType, getDateFieldType } from './date-parser';
import { isBoolType, getBoolFieldType } from './bool-parser';
import { isFloatType, getFloatFieldType } from './float-parser';

export { isStringType, getStringFieldType } from './string-parser';
export { isEmailType, getEmailFieldType } from './email-parser';
export { isIntType, getIntFieldType } from './int-parser';
export { isDateType, getDateFieldType } from './date-parser';
export { isBoolType, getBoolFieldType } from './bool-parser';
export { isFloatType, getFloatFieldType } from './float-parser';

/** Parse a type token to SchemaFieldType */
export function parseFieldType(token: string): SchemaFieldType | null {
  if (isStringType(token)) return getStringFieldType();
  if (isEmailType(token)) return getEmailFieldType();
  if (isIntType(token)) return getIntFieldType();
  if (isDateType(token)) return getDateFieldType();
  if (isBoolType(token)) return getBoolFieldType();
  if (isFloatType(token)) return getFloatFieldType();
  return null;
}

/** Check if a token is a valid field type */
export function isValidFieldType(token: string): boolean {
  return parseFieldType(token) !== null;
}
