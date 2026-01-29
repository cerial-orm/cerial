/**
 * Parser for Record and Record[] field types
 * Record stores a single record ID (e.g., profile:123)
 * Record[] stores an array of record IDs (e.g., [post:1, post:2])
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Record or Record[] */
export function isRecordType(token: string): boolean {
  return token === 'Record' || token === 'Record[]';
}

/** Check if a type token is Record[] (array type) */
export function isRecordArray(token: string): boolean {
  return token === 'Record[]';
}

/** Get the schema field type for Record */
export function getRecordFieldType(): SchemaFieldType {
  return 'record';
}
