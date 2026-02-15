/**
 * Common types shared across all modules
 */

/** Supported field types in schema definitions */
export type SchemaFieldType =
  | 'string'
  | 'email'
  | 'int'
  | 'date'
  | 'bool'
  | 'float'
  | 'number'
  | 'record'
  | 'relation'
  | 'object'
  | 'tuple'
  | 'literal'
  | 'uuid'
  | 'duration'
  | 'decimal';

/** Supported decorator types in schema definitions */
export type SchemaDecorator =
  | 'id'
  | 'unique'
  | 'index'
  | 'now'
  | 'createdAt'
  | 'updatedAt'
  | 'default'
  | 'field'
  | 'model'
  | 'onDelete'
  | 'key'
  | 'distinct'
  | 'sort'
  | 'defaultAlways'
  | 'flexible'
  | 'readonly'
  | 'nullable'
  | 'uuid'
  | 'uuid4'
  | 'uuid7';

/** Supported onDelete actions for relations */
export type OnDeleteAction = 'Cascade' | 'SetNull' | 'SetNone' | 'Restrict' | 'NoAction';

/** Supported constraint types in schema definitions */
export type SchemaConstraint = 'required' | 'optional';

/** Field type to TypeScript type mapping */
export type FieldTypeMapping = {
  string: string;
  email: string;
  int: number;
  date: Date;
  bool: boolean;
  float: number;
  number: number;
  record: string;
  relation: unknown; // Virtual type - actual type determined by target model
  object: unknown; // Embedded object type - actual type determined by object definition
  tuple: unknown[]; // Tuple type - actual element types determined by tuple definition
  literal: unknown; // Literal type - actual union type determined by literal definition
  uuid: string; // UUID type - represented as string in TS output mapping
  duration: string; // Duration type - represented as string in TS output mapping
  decimal: string; // Decimal type - represented as string in TS output mapping
};

/** Field type to SurrealDB type mapping */
export type SurrealTypeMapping = {
  string: 'string';
  email: 'string';
  int: 'int';
  date: 'datetime';
  bool: 'bool';
  float: 'float';
  number: 'number';
  record: 'record';
  relation: never; // Virtual type - not stored in database
  object: 'object'; // Embedded object type
  tuple: 'array'; // Tuple type - stored as typed array literal
  literal: 'literal'; // Literal type - stored as union type
  uuid: 'uuid'; // UUID type
  duration: 'duration'; // Duration type
  decimal: 'decimal'; // Decimal type
};

/** Generic result type for operations */
export type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

/** Position in source file for error reporting */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/** Range in source file */
export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}
