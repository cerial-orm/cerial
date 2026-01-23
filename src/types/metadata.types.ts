/**
 * Metadata types for model registry and field definitions
 */

import type { SchemaFieldType } from './common.types';

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
  /** Whether the field has @now decorator for auto-timestamp */
  hasNowDefault: boolean;
  /** Whether the field is required (no ? marker) */
  isRequired: boolean;
  /** Default value if specified with @default(value) */
  defaultValue?: unknown;
}

/** Metadata for a model/table */
export interface ModelMetadata {
  /** Model name (e.g., "User") */
  name: string;
  /** Table name in database (e.g., "user") */
  tableName: string;
  /** Array of field metadata */
  fields: FieldMetadata[];
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
