/**
 * Field types barrel export
 */

import type { SchemaFieldType } from '../../../types';
import { getBoolFieldType, isBoolType } from './bool-parser';
import { getDateFieldType, isDateType } from './date-parser';
import { getEmailFieldType, isEmailType } from './email-parser';
import { getFloatFieldType, isFloatType } from './float-parser';
import { getIntFieldType, isIntType } from './int-parser';
import { getRecordFieldType, isRecordType } from './record-parser';
import { getRelationFieldType, isRelationType } from './relation-parser';
import { getStringFieldType, isStringType } from './string-parser';

export { getBoolFieldType, isBoolType } from './bool-parser';
export { getDateFieldType, isDateType } from './date-parser';
export { getEmailFieldType, isEmailType } from './email-parser';
export { getFloatFieldType, isFloatType } from './float-parser';
export { getIntFieldType, isIntType } from './int-parser';
export { getRecordFieldType, isRecordArray, isRecordType } from './record-parser';
export { getRelationFieldType, isRelationType } from './relation-parser';
export { getStringFieldType, isStringType } from './string-parser';

/** Parse a type token to SchemaFieldType (handles Record[] by stripping []) */
export function parseFieldType(token: string): SchemaFieldType | null {
  // Handle Record[] by checking the base type
  const baseToken = token.replace('[]', '');

  if (isStringType(baseToken)) return getStringFieldType();
  if (isEmailType(baseToken)) return getEmailFieldType();
  if (isIntType(baseToken)) return getIntFieldType();
  if (isDateType(baseToken)) return getDateFieldType();
  if (isBoolType(baseToken)) return getBoolFieldType();
  if (isFloatType(baseToken)) return getFloatFieldType();
  if (isRecordType(token)) return getRecordFieldType(); // Use original token for Record[]
  if (isRelationType(baseToken)) return getRelationFieldType();
  return null;
}

/** Check if a token is a valid field type */
export function isValidFieldType(token: string): boolean {
  return parseFieldType(token) !== null;
}

/** Check if a type token represents an array type */
export function isArrayType(token: string): boolean {
  return token.endsWith('[]');
}
