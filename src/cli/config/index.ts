/**
 * Config module barrel export
 */

export { defineConfig } from './define-config';
export { findFolderConfigs, loadConfig, loadFolderConfig } from './loader';
export { toClientClassName } from './name-utils';
export { resolveConfig } from './resolver';
export type { CerialConfig, FolderConfig, ResolvedSchemaEntry, SchemaEntry } from './types';
export type { ConfigValidationError, ConfigValidationResult } from './validator';
export {
  detectConfigsInsideRootPaths,
  detectNestedConfigs,
  detectNestedSchemaRoots,
  validateCombinedEntries,
  validateConfig,
  validateFolderConfig,
} from './validator';
