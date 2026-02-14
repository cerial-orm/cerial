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
  | 'record'
  | 'relation'
  | 'object'
  | 'tuple';

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
  | 'nullable';

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
  record: string;
  relation: unknown; // Virtual type - actual type determined by target model
  object: unknown; // Embedded object type - actual type determined by object definition
  tuple: unknown[]; // Tuple type - actual element types determined by tuple definition
};

/** Field type to SurrealDB type mapping */
export type SurrealTypeMapping = {
  string: 'string';
  email: 'string';
  int: 'int';
  date: 'datetime';
  bool: 'bool';
  float: 'float';
  record: 'record';
  relation: never; // Virtual type - not stored in database
  object: 'object'; // Embedded object type
  tuple: 'array'; // Tuple type - stored as typed array literal
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
