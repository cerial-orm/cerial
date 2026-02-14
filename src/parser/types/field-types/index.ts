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
export { getRelationFieldType, isRelationArray, isRelationType } from './relation-parser';
export { getStringFieldType, isStringType } from './string-parser';

/** Parse a type token to SchemaFieldType (handles Record[] by stripping []) */
export function parseFieldType(
  token: string,
  objectNames?: Set<string>,
  tupleNames?: Set<string>,
  literalNames?: Set<string>,
): SchemaFieldType | null {
  // Handle Record[] by checking the base type
  const baseToken = token.replace('[]', '');

  if (isStringType(baseToken)) return getStringFieldType();
  if (isEmailType(baseToken)) return getEmailFieldType();
  if (isIntType(baseToken)) return getIntFieldType();
  if (isDateType(baseToken)) return getDateFieldType();
  if (isBoolType(baseToken)) return getBoolFieldType();
  if (isFloatType(baseToken)) return getFloatFieldType();
  if (isRecordType(token)) return getRecordFieldType(); // Use original token for Record[]
  if (isRelationType(token)) return getRelationFieldType(); // Use original token for Relation[]

  // Check if the type is a known literal name
  if (literalNames && isLiteralType(baseToken, literalNames)) return 'literal';

  // Check if the type is a known object name
  if (objectNames && isObjectType(baseToken, objectNames)) return 'object';

  // Check if the type is a known tuple name
  if (tupleNames && isTupleType(baseToken, tupleNames)) return 'tuple';

  return null;
}

/** Check if a type token matches a known object name */
export function isObjectType(token: string, objectNames: Set<string>): boolean {
  return objectNames.has(token);
}

/** Extract the object name from a type token (strips [] and ? suffixes) */
export function extractObjectName(token: string): string {
  return token.replace('[]', '').replace('?', '');
}

/** Check if a type token matches a known tuple name */
export function isTupleType(token: string, tupleNames: Set<string>): boolean {
  return tupleNames.has(token);
}

/** Extract the tuple name from a type token (strips [] and ? suffixes) */
export function extractTupleName(token: string): string {
  return token.replace('[]', '').replace('?', '');
}

/** Check if a type token matches a known literal name */
export function isLiteralType(token: string, literalNames: Set<string>): boolean {
  return literalNames.has(token);
}

/** Extract the literal name from a type token (strips [] and ? suffixes) */
export function extractLiteralName(token: string): string {
  return token.replace('[]', '').replace('?', '');
}

/** Check if a token is a valid field type */
export function isValidFieldType(
  token: string,
  objectNames?: Set<string>,
  tupleNames?: Set<string>,
  literalNames?: Set<string>,
): boolean {
  return parseFieldType(token, objectNames, tupleNames, literalNames) !== null;
}

/** Check if a type token represents an array type */
export function isArrayType(token: string): boolean {
  return token.endsWith('[]');
}
