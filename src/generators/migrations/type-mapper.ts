/**
 * Type mapper for converting schema types to SurrealQL types
 */

import type { SchemaFieldType } from '../../types';

/** SurrealQL type string */
export type SurrealQLType = 'string' | 'int' | 'float' | 'bool' | 'datetime' | 'uuid' | 'record' | 'array' | 'object';

/** Mapping from schema types to SurrealQL types */
const TYPE_MAP: Record<SchemaFieldType, SurrealQLType> = {
  string: 'string',
  email: 'string',
  int: 'int',
  float: 'float',
  bool: 'bool',
  date: 'datetime',
  record: 'record',
};

/** Schema types that require additional assertions */
const TYPE_ASSERTIONS: Partial<Record<SchemaFieldType, string>> = {
  email: 'string::is_email($value)',
};

/** Map a schema field type to SurrealQL type */
export function mapToSurrealType(schemaType: SchemaFieldType): SurrealQLType {
  return TYPE_MAP[schemaType] ?? 'string';
}

/** Get assertion for a schema field type, if any */
export function getTypeAssertion(schemaType: SchemaFieldType): string | undefined {
  return TYPE_ASSERTIONS[schemaType];
}

/** Check if a schema type requires an assertion */
export function hasTypeAssertion(schemaType: SchemaFieldType): boolean {
  return schemaType in TYPE_ASSERTIONS;
}

/** Generate the TYPE clause for a field */
export function generateTypeClause(schemaType: SchemaFieldType, isRequired: boolean): string {
  const surrealType = mapToSurrealType(schemaType);
  if (isRequired) return `TYPE ${surrealType}`;
  return `TYPE option<${surrealType}>`;
}

/** Generate the ASSERT clause for a field, if any */
export function generateAssertClause(schemaType: SchemaFieldType): string | undefined {
  const assertion = getTypeAssertion(schemaType);
  if (!assertion) return undefined;
  return `ASSERT ${assertion}`;
}

/** Generate the DEFAULT clause for a field */
export function generateDefaultClause(hasNowDefault: boolean, defaultValue?: unknown): string | undefined {
  if (hasNowDefault) return 'DEFAULT time::now()';
  if (defaultValue !== undefined) {
    if (typeof defaultValue === 'string') return `DEFAULT '${defaultValue}'`;
    if (typeof defaultValue === 'boolean') return `DEFAULT ${defaultValue}`;
    if (typeof defaultValue === 'number') return `DEFAULT ${defaultValue}`;
    return `DEFAULT ${JSON.stringify(defaultValue)}`;
  }
  return undefined;
}
