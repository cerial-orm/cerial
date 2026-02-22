/**
 * Parser for Relation and Relation[] field types
 * Relation is a virtual type for include/select queries (no storage)
 * Relation[] is for array relations (1-n reverse, n-n)
 * Metadata comes from @field() and @model() decorators
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Relation or Relation[] */
export function isRelationType(token: string): boolean {
  return token === 'Relation' || token === 'Relation[]';
}

/** Check if a type token is Relation[] (array type) */
export function isRelationArray(token: string): boolean {
  return token === 'Relation[]';
}

/** Get the schema field type for Relation */
export function getRelationFieldType(): SchemaFieldType {
  return 'relation';
}

/** Parse result for Relation type */
interface RelationTypeResult {
  type: SchemaFieldType;
  isArray: boolean;
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
}

/** Parse Relation type token */
export function parseRelationType(
  _token: string,
  range: RelationTypeResult['range'],
  isArray: boolean,
): RelationTypeResult {
  return {
    type: 'relation',
    isArray,
    range,
  };
}
