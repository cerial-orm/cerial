export { generateCommand, initCommand } from './commands';
export { parseArgs, printHelp } from './compat';
export type {
  CerialConfig,
  ConfigValidationError,
  ConfigValidationResult,
  FolderConfig,
  ResolvedSchemaEntry,
  SchemaEntry,
} from './config';
export {
  defineConfig,
  detectNestedConfigs,
  findFolderConfigs,
  loadFolderConfig,
  toClientClassName,
  validateConfig,
  validateFolderConfig,
} from './config';
export type { GenerateResult, MultiGenerateResult, MultiSchemaOptions, SingleSchemaOptions } from './generate';
export { generate, generateMultiSchema, generateSingleSchema } from './generate';
export type { DiscoveredSchema, SchemaResolveOptions, SchemaRoot } from './resolvers';
export {
  CONVENTION_MARKERS,
  discoverSchemas,
  findSchemaRoots,
  findSchemasInDir,
  resolveSchemas,
  resolveSinglePath,
} from './resolvers';
export type { LoggerOptions, LogLevel, WriteOptions } from './utils';
export { ensureDir, ensureDirs, ensureParentDir, Logger, logger, writeFile, writeFiles } from './utils';
export type {
  CLIOptions,
  OptionsValidationError,
  OptionsValidationResult,
  SchemaValidationError,
  SchemaValidationResult,
} from './validators';
export {
  getDefaultOptions,
  validateFieldNames,
  validateModelNames,
  validateOptions,
  validateSchema,
} from './validators';
export type { WatchTarget } from './watcher';
export { startWatcher } from './watcher';
