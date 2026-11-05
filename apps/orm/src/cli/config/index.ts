/**
 * Config module barrel export
 */

export { defineConfig } from './define-config';
export { findFolderConfigs, loadConfig, loadFolderConfig } from './loader';
export {
  assertClientClassName,
  assertFolderSchemaName,
  findDuplicateClassNames,
  schemaNameProblem,
  toClientClassName,
} from './name-utils';
export { resolveConfig } from './resolver';
export type { CerialConfig, FolderConfig, ResolvedSchemaEntry, SchemaEntry, TypeFilesMode } from './types';
export { DEFAULT_TYPE_FILES } from './types';
export type { ConfigValidationError, ConfigValidationResult } from './validator';
export {
  detectConfigsInsideRootPaths,
  detectNestedConfigs,
  detectNestedSchemaRoots,
  isReservedSchemaName,
  validateCombinedEntries,
  validateConfig,
  validateFolderConfig,
} from './validator';
