/**
 * Configuration types for multi-schema support
 */

import type { FormatConfig } from '../../formatter/types';
import type { ConnectionConfig } from '../../types/metadata.types';

/** How generated type-only files are named: `.d.ts` declaration files or plain `.ts` */
export type TypeFilesMode = 'dts' | 'ts';

/** What an absent `typeFiles` resolves to */
export const DEFAULT_TYPE_FILES: TypeFilesMode = 'ts';

/** The fields every schema entry shares */
interface SchemaEntryBase {
  /** Output directory for generated client (optional, uses root output if not specified) */
  output?: string;
  /** Connection config for this schema (optional, uses root connection if not specified) */
  connection?: ConnectionConfig;
  /** Formatting config for this schema (optional, uses root format if not specified) */
  format?: FormatConfig;
  /** Extension of the generated type-only files (optional, uses root typeFiles if not specified) */
  typeFiles?: TypeFilesMode;
  /** Absolute exclusion patterns — nothing can override. Glob patterns relative to this config's scope. */
  ignore?: string[];
  /** Exclusion patterns — can be overridden by 'include'. Glob patterns relative to this config's scope. */
  exclude?: string[];
  /** Inclusion patterns — overrides 'exclude' and '.cerialignore' but NOT 'ignore'. Glob patterns relative to this config's scope. */
  include?: string[];
}

/**
 * Per-schema configuration entry. `path` is a schema file or directory; `entry` is a TypeScript module
 * exporting a `defineSchema()` result, whose imports are registered whatever their names; `files` lists schema
 * files one by one. At least one of the three is required, and every one given contributes.
 */
export type SchemaEntry = SchemaEntryBase & {
  path?: string;
  entry?: string;
  /**
   * Literal file paths (not globs), relative to the config's directory: `.cerial` files or TypeScript modules,
   * each a schema source on its own. A listed TypeScript module is imported whether or not it ends in
   * `.schema.ts`, and is not walked for imports unless it exports a `defineSchema()` result. The `ignore`,
   * `exclude` and `include` filters apply to listed files as to any other source.
   */
  files?: string[];
} & ({ path: string } | { entry: string } | { files: string[] });

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
  /** Root extension of the generated type-only files (used if SchemaEntry.typeFiles not specified) */
  typeFiles?: TypeFilesMode;
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
  /** Formatting config for this schema */
  format?: FormatConfig;
  /** Extension of the generated type-only files */
  typeFiles?: TypeFilesMode;
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
  /**
   * Absolute path to schema file or directory. For an entry with no `path` it is the folder holding the entry
   * module and the listed `files`: it scopes filters and the watcher, and no schema files are searched in it.
   */
  path: string;
  /** Absolute path to the entry module, when the config names one */
  entry?: string;
  /** Absolute paths of the config's listed `files` */
  files?: string[];
  /** True when the config gave no `path`, so `entry` and `files` are the only sources of declarations */
  entryOnly?: boolean;
  /** Absolute output directory */
  output: string;
  /** Generated client class name */
  clientClassName: string;
  /** Connection config for this schema (optional) */
  connection?: ConnectionConfig;
  /** Database set on this entry's own `connection`; absent when it is inherited from the root config or unset */
  explicitDatabase?: string;
  /** Formatting config for this schema (merged from root + per-schema overrides) */
  format?: FormatConfig;
  /** Extension of the generated type-only files (entry over root, then folder config, else the default) */
  typeFiles?: TypeFilesMode;
}
