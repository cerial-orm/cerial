/**
 * Type utility functions
 */

import type { SchemaFieldType } from '../types/common.types';

/** Check if value is a string */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Check if value is a number */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/** Check if value is a boolean */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Check if value is a Date */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/** Check if value is null or undefined */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** Check if value is an object (not null, not array) */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Check if value is an array */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Get the schema field type from a TypeScript type string */
export function getSchemaFieldType(typeStr: string): SchemaFieldType | null {
  const normalized = typeStr.toLowerCase().trim();
  const typeMap: Record<string, SchemaFieldType> = {
    string: 'string',
    email: 'email',
    int: 'int',
    integer: 'int',
    date: 'date',
    datetime: 'date',
    bool: 'bool',
    boolean: 'bool',
    float: 'float',
    number: 'float',
    double: 'float',
    uuid: 'uuid',
  };
  return typeMap[normalized] ?? null;
}

/** Map schema field type to TypeScript type string */
export function schemaTypeToTsType(type: SchemaFieldType): string {
  const typeMap: Record<SchemaFieldType, string> = {
    string: 'string',
    email: 'string',
    int: 'number',
    date: 'Date',
    bool: 'boolean',
    float: 'number',
    record: 'string',
    relation: 'unknown', // Virtual type - actual type determined by include
    object: 'unknown', // Embedded object type - actual type determined by object definition
    tuple: 'unknown[]', // Tuple type - actual element types determined by tuple definition
    literal: 'unknown', // Literal type - actual union type determined by literal definition
    uuid: 'string',
  };

  return typeMap[type];
}

/** Map schema field type to SurrealDB type string */
export function schemaTypeToSurrealType(type: SchemaFieldType): string {
  const typeMap: Record<SchemaFieldType, string> = {
    string: 'string',
    email: 'string',
    int: 'int',
    date: 'datetime',
    bool: 'bool',
    float: 'float',
    record: 'record',
    relation: '', // Virtual type - not stored in database
    object: 'object', // Embedded object type
    tuple: 'array', // Tuple type - stored as typed array literal
    literal: 'literal', // Literal type - stored as union type
    uuid: 'uuid',
  };

  return typeMap[type];
}

/** Check if a type is a primitive type */
export function isPrimitiveType(type: SchemaFieldType): boolean {
  return ['string', 'email', 'int', 'date', 'bool', 'float', 'record', 'uuid'].includes(type);
}
