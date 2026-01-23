/**
 * CLI module barrel export
 */

// Resolvers
export { resolveSchemas, resolveSinglePath, findSchemasInDir } from './resolvers';
export type { SchemaResolveOptions } from './resolvers';

// Utils
export { ensureDir, ensureParentDir, ensureDirs, writeFile, writeFiles, Logger, logger } from './utils';
export type { WriteOptions, LogLevel, LoggerOptions } from './utils';

// Validators
export { validateOptions, getDefaultOptions, validateSchema, validateModelNames, validateFieldNames } from './validators';
export type {
  CLIOptions,
  OptionsValidationError,
  OptionsValidationResult,
  SchemaValidationError,
  SchemaValidationResult,
} from './validators';

// Parser
export { parseArgs, printHelp } from './parser';

// Generate
export { generate } from './generate';
export type { GenerateResult } from './generate';
