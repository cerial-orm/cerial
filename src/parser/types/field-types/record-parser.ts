/**
 * Parser for Record and Record[] field types
 * Record stores a single record ID (e.g., profile:123)
 * Record[] stores an array of record IDs (e.g., [post:1, post:2])
 * Record(Type) stores a typed record ID (e.g., Record(int), Record(string, int))
 */

import type { SchemaFieldType } from '../../../types';

/** Valid primitive ID type parameters for Record(Type) */
const VALID_ID_TYPES = new Set(['int', 'number', 'string', 'uuid']);

/** Invalid ID type parameters — clear error messages */
const INVALID_ID_TYPES = new Set([
  'float',
  'bool',
  'date',
  'datetime',
  'decimal',
  'duration',
  'literal',
  'enum',
  'relation',
  'email',
  'bytes',
  'geometry',
  'any',
]);

/** Regex to match Record with optional type parameters and optional array suffix */
const RECORD_TYPE_REGEX = /^Record(?:\(([^)]+)\))?(\[\])?$/;

/** Check if a type token is a Record type (plain, typed, or array) */
export function isRecordType(token: string): boolean {
  return RECORD_TYPE_REGEX.test(token);
}

/** Check if a type token is Record[] (array type) */
export function isRecordArray(token: string): boolean {
  return token.endsWith('[]') && isRecordType(token);
}

/** Get the schema field type for Record */
export function getRecordFieldType(): SchemaFieldType {
  return 'record';
}

/**
 * Parse Record(Type) parameters into an array of type strings.
 * Returns undefined for plain Record (no parentheses).
 *
 * Examples:
 *   'Record' → undefined
 *   'Record(int)' → ['int']
 *   'Record(string, int)' → ['string', 'int']
 *   'Record(MyTuple)' → ['MyTuple']
 *   'Record(int)[]' → ['int']
 */
export function parseRecordIdTypes(
  token: string,
  tupleNames?: Set<string>,
  objectNames?: Set<string>,
): string[] | undefined {
  const match = token.match(RECORD_TYPE_REGEX);
  if (!match || !match[1]) return undefined;

  const params = match[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!params.length) return undefined;

  return params;
}
