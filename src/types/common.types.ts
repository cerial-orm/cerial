/**
 * Common types shared across all modules
 */

/** Supported field types in schema definitions */
export type SchemaFieldType = 'string' | 'email' | 'int' | 'date' | 'bool' | 'float' | 'record';

/** Supported decorator types in schema definitions */
export type SchemaDecorator = 'id' | 'unique' | 'now' | 'default';

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
};

/** Generic result type for operations */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

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
