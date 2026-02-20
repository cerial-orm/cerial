/**
 * Configuration types for multi-schema support
 */

import type { FormatConfig } from '../../formatter/types';
import type { ConnectionConfig } from '../../types/metadata.types';

/**
 * Per-schema configuration entry
 */
export interface SchemaEntry {
  /** Path to schema file or directory */
  path: string;
  /** Output directory for generated client (optional, uses root output if not specified) */
  output?: string;
  /** Connection config for this schema (optional, uses root connection if not specified) */
  connection?: ConnectionConfig;
  /** Formatting config for this schema (optional, uses root format if not specified) */
  format?: FormatConfig;
  /** Absolute exclusion patterns — nothing can override. Glob patterns relative to this config's scope. */
  ignore?: string[];
  /** Exclusion patterns — can be overridden by 'include'. Glob patterns relative to this config's scope. */
  exclude?: string[];
  /** Inclusion patterns — overrides 'exclude' and '.cerialignore' but NOT 'ignore'. Glob patterns relative to this config's scope. */
  include?: string[];
}

/**
 * Root Cerial configuration
 */
export interface CerialConfig {
  /** Single schema shorthand: path to schema file or directory */
  schema?: string;
  /** Multi-schema map: schema name -> SchemaEntry */
  schemas?: Record<string, SchemaEntry>;
  /** Root output directory (used if SchemaEntry.output not specified) */
  output?: string;
  /** Root connection config (used if SchemaEntry.connection not specified) */
  connection?: ConnectionConfig;
  /** Root formatting config (used if SchemaEntry.format not specified) */
  format?: FormatConfig;
  /** Absolute exclusion patterns — nothing can override. Glob patterns relative to this config's scope. */
  ignore?: string[];
  /** Exclusion patterns — can be overridden by 'include'. Glob patterns relative to this config's scope. */
  exclude?: string[];
  /** Inclusion patterns — overrides 'exclude' and '.cerialignore' but NOT 'ignore'. Glob patterns relative to this config's scope. */
  include?: string[];
}

/**
 * Folder-level configuration (placed inside a schema directory).
 * The folder itself IS the schema root — no schema/schemas keys allowed.
 */
export interface FolderConfig {
  /** Optional schema name (overrides basename(dir)) */
  name?: string;
  /** Output directory for generated client (default: ./client relative to folder) */
  output?: string;
  /** Connection config for this schema */
  connection?: ConnectionConfig;
  /** Absolute exclusion patterns — nothing can override. Glob patterns relative to this config's scope. */
  ignore?: string[];
  /** Exclusion patterns — can be overridden by 'include'. Glob patterns relative to this config's scope. */
  exclude?: string[];
  /** Inclusion patterns — overrides 'exclude' and '.cerialignore' but NOT 'ignore'. Glob patterns relative to this config's scope. */
  include?: string[];
}

/**
 * Resolved schema entry with computed values
 */
export interface ResolvedSchemaEntry {
  /** Schema name (from map key or derived from path) */
  name: string;
  /** Absolute path to schema file or directory */
  path: string;
  /** Absolute output directory */
  output: string;
  /** Generated client class name */
  clientClassName: string;
  /** Connection config for this schema (optional) */
  connection?: ConnectionConfig;
  /** Formatting config for this schema (merged from root + per-schema overrides) */
  format?: FormatConfig;
}
