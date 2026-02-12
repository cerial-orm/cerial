/**
 * Metadata types for model registry and field definitions
 */

import type { OnDeleteAction, SchemaFieldType } from './common.types';

/** Metadata for relation fields */
export interface RelationFieldMetadata {
  /** Target model name from @model(Model) decorator */
  targetModel: string;
  /** Target table name (snake_case of targetModel) */
  targetTable: string;
  /** Field reference from @field(fieldName) decorator - undefined for reverse relations */
  fieldRef?: string;
  /** Whether this is a reverse relation (no @field decorator) */
  isReverse: boolean;
  /** Delete action from @onDelete(Action) decorator - only valid on optional relations */
  onDelete?: OnDeleteAction;
  /** Key for disambiguation from @key(name) decorator - required when multiple relations to same model */
  key?: string;
}

/** Metadata for a single field in a model */
export interface FieldMetadata {
  /** Field name (e.g., "id", "email") */
  name: string;
  /** Field type (e.g., "string", "email", "int") */
  type: SchemaFieldType;
  /** Whether the field has @id decorator (SurrealDB record id) */
  isId: boolean;
  /** Whether the field has @unique decorator */
  isUnique: boolean;
  /** Whether the field has @index decorator */
  isIndexed?: boolean;
  /** Whether the field has @now decorator for auto-timestamp */
  hasNowDefault: boolean;
  /** Whether the field is required (no ? marker) */
  isRequired: boolean;
  /** Default value if specified with @default(value) */
  defaultValue?: unknown;
  /** Whether this is an array type (Record[]) */
  isArray?: boolean;
  /** Relation metadata for Relation type fields */
  relationInfo?: RelationFieldMetadata;
  /** Whether the field has @distinct decorator (for arrays) */
  isDistinct?: boolean;
  /** Sort order from @sort decorator: 'asc' (default) or 'desc' */
  sortOrder?: 'asc' | 'desc';
  /** Object metadata for object-typed fields */
  objectInfo?: ObjectFieldMetadata;
}

/** Metadata for object-typed fields referencing an object definition */
export interface ObjectFieldMetadata {
  /** Name of the referenced object definition (e.g., "Address") */
  objectName: string;
  /** Inline copy of the object's fields for runtime query building */
  fields: FieldMetadata[];
}

/** Metadata for an object definition (embedded data structure) */
export interface ObjectMetadata {
  /** Object name (e.g., "Address") */
  name: string;
  /** Array of field metadata */
  fields: FieldMetadata[];
}

/** Registry of all objects indexed by object name */
export interface ObjectRegistry {
  [objectName: string]: ObjectMetadata;
}

/** Composite index/unique directive metadata */
export interface CompositeIndex {
  /** Whether this is a non-unique 'index' or a 'unique' composite */
  kind: 'index' | 'unique';
  /** User-defined name (globally unique across all models) */
  name: string;
  /** Field references (supports dot notation for object subfields) */
  fields: string[];
}

/** Metadata for a model/table */
export interface ModelMetadata {
  /** Model name (e.g., "User") */
  name: string;
  /** Table name in database (e.g., "user") */
  tableName: string;
  /** Array of field metadata */
  fields: FieldMetadata[];
  /** Model-level composite index/unique directives */
  compositeDirectives?: CompositeIndex[];
}

/** Registry of all models indexed by model name */
export interface ModelRegistry {
  [modelName: string]: ModelMetadata;
}

/** Connection configuration for runtime client */
export interface ConnectionConfig {
  /** Connection URL */
  url: string;
  /** Optional namespace */
  namespace?: string;
  /** Optional database name */
  database?: string;
  /** Authentication credentials */
  auth?: {
    username: string;
    password: string;
  };
}

/** Named connection for multi-connection support */
export interface NamedConnection {
  name: string;
  config: ConnectionConfig;
}
