/**
 * Type mapper for converting schema types to SurrealQL types
 */

import type { FieldMetadata, ModelMetadata, SchemaFieldType } from '../../types';

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
  relation: 'string', // Virtual type - should not be used directly
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

/**
 * Find the target table for a Record field by looking for its paired Relation
 */
export function findRecordTargetTable(field: FieldMetadata, model: ModelMetadata): string | undefined {
  // Find a Relation field that references this Record field
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === field.name);

  if (pairedRelation?.relationInfo) {
    return pairedRelation.relationInfo.targetTable;
  }

  return undefined;
}

/**
 * Generate the TYPE clause for a field
 * Handles Record and Record[] with proper record<table> syntax
 * Handles primitive arrays like String[], Int[], Date[]
 */
export function generateTypeClause(
  schemaType: SchemaFieldType,
  isRequired: boolean,
  field?: FieldMetadata,
  model?: ModelMetadata,
): string {
  // Handle Record types with target table
  if (schemaType === 'record' && field && model) {
    const targetTable = findRecordTargetTable(field, model);

    if (targetTable) {
      // Array Record type: array<record<table>> VALUE $value.distinct()
      if (field.isArray) {
        return `TYPE array<record<${targetTable}>>`;
      }

      // Single Record type: record<table> or option<record<table> | null>
      // Optional record fields can be NONE (absent) or null (for querying)
      if (isRequired) {
        return `TYPE record<${targetTable}>`;
      }

      return `TYPE option<record<${targetTable}> | null>`;
    }

    // Fallback if no target table found
    if (field.isArray) {
      return 'TYPE array<record>';
    }
    if (isRequired) return 'TYPE record';

    return 'TYPE option<record | null>';
  }

  // Handle primitive array types (String[], Int[], Date[], etc.)
  if (field?.isArray) {
    const surrealType = mapToSurrealType(schemaType);
    return `TYPE array<${surrealType}>`;
  }

  // Standard types
  // For optional fields: option<T | null> allows both NONE and null
  // - NONE: field is absent (user passes undefined)
  // - null: field exists with null value (user passes null)
  const surrealType = mapToSurrealType(schemaType);
  if (isRequired) return `TYPE ${surrealType}`;

  return `TYPE option<${surrealType} | null>`;
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

/**
 * Check if a Record[] field is paired with a Relation via @field decorator
 */
export function hasPairedRelation(field: FieldMetadata, model: ModelMetadata): boolean {
  if (field.type !== 'record' || !field.isArray) return false;

  return model.fields.some((f) => f.type === 'relation' && f.relationInfo?.fieldRef === field.name);
}

/**
 * Generate the VALUE clause for array fields
 *
 * Handles:
 * - Record[] paired with Relation: always $value.distinct() (implicit)
 * - Primitive arrays with @distinct: $value.distinct()
 * - Primitive arrays with @sort: $value.sort::asc() or $value.sort::desc()
 * - Combined @distinct @sort: $value.distinct().sort::asc()
 *
 * Uses conditional to handle NONE values gracefully
 */
export function generateValueClause(field: FieldMetadata, model?: ModelMetadata): string | undefined {
  // Record[] paired with Relation - always distinct (existing behavior)
  if (field.type === 'record' && field.isArray && model) {
    if (hasPairedRelation(field, model)) {
      return 'VALUE IF $value THEN $value.distinct() ELSE [] END';
    }
  }

  // Arrays with @distinct and/or @sort decorators
  if (field.isArray && field.type !== 'relation') {
    const operations: string[] = [];

    if (field.isDistinct) {
      operations.push('.distinct()');
    }
    if (field.sortOrder) {
      // array::sort() takes an optional boolean: true = asc (default), false = desc
      operations.push(field.sortOrder === 'desc' ? '.sort(false)' : '.sort(true)');
    }

    if (operations.length) {
      return `VALUE IF $value THEN $value${operations.join('')} ELSE [] END`;
    }
  }

  return undefined;
}
