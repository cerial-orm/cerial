/**
 * CLI module barrel export
 */

export type { GenerateResult } from './generate';
// Generate
export { generate } from './generate';
// Parser
export { parseArgs, printHelp } from './parser';
export type { SchemaResolveOptions } from './resolvers';
// Resolvers
export { findSchemasInDir, resolveSchemas, resolveSinglePath } from './resolvers';
export type { LoggerOptions, LogLevel, WriteOptions } from './utils';
// Utils
export { ensureDir, ensureDirs, ensureParentDir, Logger, logger, writeFile, writeFiles } from './utils';
export type {
  CLIOptions,
  OptionsValidationError,
  OptionsValidationResult,
  SchemaValidationError,
  SchemaValidationResult,
} from './validators';
// Validators
export {
  getDefaultOptions,
  validateFieldNames,
  validateModelNames,
  validateOptions,
  validateSchema,
} from './validators';
