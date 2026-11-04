/**
 * Type utility functions
 */

import type { SchemaFieldType } from '../types/common.types';
import { SIZED_NUMBER_TYPES, type SizedNumberFieldType } from '../parser/types/field-types/sized-number-parser';

/** SurrealDB kind of each sized number type, read from the one table the parser registers them from. */
export const SIZED_NUMBER_SURREAL_TYPES = Object.fromEntries(
  SIZED_NUMBER_TYPES.map((t) => [t.fieldType, t.surreal]),
) as Record<SizedNumberFieldType, string>;

/** Sized number types that are `number` in TypeScript; `uint64` is `bigint` and has its own entries. */
const SIZED_NUMBER_TS_TYPES: Record<SizedNumberFieldType, string> = {
  int8: 'number',
  uint8: 'number',
  int16: 'number',
  uint16: 'number',
  int32: 'number',
  uint32: 'number',
  uint64: 'bigint',
  float16: 'number',
  float32: 'number',
};

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
    number: 'number',
    double: 'float',
    uuid: 'uuid',
    duration: 'duration',
    decimal: 'decimal',
    bytes: 'bytes',
    geometry: 'geometry',
  };

  return typeMap[normalized] ?? null;
}

/** Map schema field type to TypeScript type string */
export function schemaTypeToTsType(type: SchemaFieldType): string {
  const typeMap: Record<SchemaFieldType, string> = {
    ...SIZED_NUMBER_TS_TYPES,
    string: 'string',
    email: 'string',
    int: 'number',
    date: 'Date',
    bool: 'boolean',
    float: 'number',
    number: 'number',
    record: 'string',
    relation: 'unknown', // Virtual type - actual type determined by include
    object: 'unknown', // Embedded object type - actual type determined by object definition
    tuple: 'unknown[]', // Tuple type - actual element types determined by tuple definition
    literal: 'unknown', // Literal type - actual union type determined by literal definition
    uuid: 'string',
    duration: 'string',
    decimal: 'string',
    bytes: 'string',
    geometry: 'unknown',
    any: 'unknown',
  };

  return typeMap[type];
}

/**
 * Map schema field type to the TypeScript type a caller may pass in. Same as the output type except
 * `uint64`, which is read as `bigint` but accepts a safe-integer `number` too. Parenthesised so a
 * caller can append `[]` or `| null`.
 */
export function schemaTypeToTsInputType(type: SchemaFieldType): string {
  if (type === 'uint64') return '(bigint | number)';

  return schemaTypeToTsType(type);
}

/** Map schema field type to SurrealDB type string */
export function schemaTypeToSurrealType(type: SchemaFieldType): string {
  const typeMap: Record<SchemaFieldType, string> = {
    ...SIZED_NUMBER_SURREAL_TYPES,
    string: 'string',
    email: 'string',
    int: 'int',
    date: 'datetime',
    bool: 'bool',
    float: 'float',
    number: 'number',
    record: 'record',
    relation: '',
    object: 'object',
    tuple: 'array',
    literal: 'literal',
    uuid: 'uuid',
    duration: 'duration',
    decimal: 'decimal',
    bytes: 'bytes',
    geometry: 'geometry',
    any: 'any',
  };

  return typeMap[type];
}

/** Check if a type is a primitive type */
export function isPrimitiveType(type: SchemaFieldType): boolean {
  return [
    'string',
    'email',
    'int',
    'date',
    'bool',
    'float',
    'number',
    'record',
    'uuid',
    'duration',
    'decimal',
    'bytes',
    'geometry',
    ...Object.keys(SIZED_NUMBER_SURREAL_TYPES),
  ].includes(type);
}
