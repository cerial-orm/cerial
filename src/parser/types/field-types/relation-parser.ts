/**
 * Parser for Relation field type
 * Relation is a virtual type for include/select queries (no storage)
 * Metadata comes from @field() and @model() decorators
 */

import type { SchemaFieldType } from '../../../types';

/** Check if a type token is Relation */
export function isRelationType(token: string): boolean {
  return token === 'Relation';
}

/** Get the schema field type for Relation */
export function getRelationFieldType(): SchemaFieldType {
  return 'relation';
}
