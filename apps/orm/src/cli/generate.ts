/**
 * Generate command - orchestrates the generation process
 */

import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { writeClient } from '../generators/client/writer';
import { writeInternalIndex } from '../generators/metadata/internal-writer';
import { writeModelRegistry } from '../generators/metadata/registry-writer';
import { writeManifestFile, writeMigrationFile } from '../generators/migrations/writer';
import type {
  ConnectionConfig,
  DatabasePin,
  LiteralMetadata,
  ObjectRegistry,
  SchemaAST,
  TupleRegistry,
} from '../types';
import type { CerialConfig, ResolvedSchemaEntry, TypeFilesMode } from './config';
import { DEFAULT_TYPE_FILES, loadConfig, resolveConfig, validateCombinedEntries } from './config';
import type { FilterConfig, PathFilter } from './filters';
import { loadCerialIgnore, resolvePathFilter } from './filters';
import { discoveredClientClassName, discoverSchemaRoots } from './discover-roots';
import type { DiscoveredRoot } from './discover-roots';
import { buildResolvedSchemaAst } from './resolvers';
import { buildSchemaMetadata } from './schema-metadata';
import { logger } from './utils';
import type { CLIOptions, EntryModels, LogOutputLevel, SchemaValidationError } from './validators';
import {
  formatOrigin,
  validateConnectionUrls,
  validateEntryTableNames,
  validateOptions,
  validateResolvedTypes,
  validateSchema,
} from './validators';

/** Generation result */
export interface GenerateResult {
  success: boolean;
  files: string[];
  errors: string[];
}

/** Options for generating a single schema */
export interface SingleSchemaOptions {
  schemaPath?: string;
  /** Absolute path of the config's entry module, a file exporting `defineSchema()`; alone, it is the whole schema */
  entry?: string;
  /** Absolute paths of the config's listed `files` */
  files?: string[];
  outputDir: string;
  logLevel?: LogOutputLevel;
  verbose?: boolean;
  clean?: boolean;
  clientClassName?: string;
  filter?: PathFilter;
  /** Scope directory the filter's patterns are relative to; defaults to `schemaPath` */
  filterBase?: string;
  /** Directory a file outside that scope is matched from; defaults to the cwd */
  filterRoot?: string;
  /** Resolved connection of the config entry; absent for -s, folder discovery and conventions */
  connection?: ConnectionConfig;
  /** Tables this entry shares with another entry; the client refuses to connect to any other database */
  databasePins?: DatabasePin[];
  /** Extension of the generated type-only files; absent means the default */
  typeFiles?: TypeFilesMode;
}

/** Options for generating multiple schemas */
export interface MultiSchemaOptions {
  /** Directory a file outside an entry's scope is matched from; the config's directory, else the cwd */
  filterRoot?: string;
  logLevel?: LogOutputLevel;
  verbose?: boolean;
  clean?: boolean;
}

/** Result from generating multiple schemas */
export interface MultiGenerateResult {
  success: boolean;
  results: Record<string, GenerateResult>;
  errors: string[];
}

/**
 * Delete the entire output directory and all its contents.
 * Used when the --clean flag is passed.
 */
async function cleanOutputDir(outputDir: string): Promise<void> {
  await rm(outputDir, { recursive: true, force: true });
}

/**
 * Remove stale .ts files from the output directory that were not part of the current generation.
 * Recursively scans the output tree, deletes orphaned .ts files, and removes empty directories.
 */
async function removeStaleFiles(outputDir: string, generatedFiles: string[]): Promise<string[]> {
  const generatedSet = new Set(generatedFiles.map((f) => resolve(f)));
  const staleFiles: string[] = [];
  const dirs: string[] = [];

  async function scan(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        await scan(fullPath);
        dirs.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !generatedSet.has(resolve(fullPath))) {
        staleFiles.push(fullPath);
      }
    }
  }

  await scan(outputDir);
  await Promise.all(staleFiles.map((f) => rm(f, { force: true })));

  // Children come before their parents, so a directory emptied by the removals above goes too
  for (const dir of dirs) {
    try {
      if (!(await readdir(dir)).length) await rm(dir, { recursive: true, force: true });
    } catch {
      // Ignore errors on cleanup
    }
  }

  return staleFiles;
}

/**
 * Collect warnings for literals that reference objects/tuples with decorators.
 * SurrealDB does not enforce sub-field constraints when a value is stored via a literal union,
 * so decorators on referenced objects/tuples may not behave as expected.
 */
function collectLiteralWarnings(
  literals: LiteralMetadata[],
  objectRegistry: ObjectRegistry,
  tupleRegistry: TupleRegistry,
): string[] {
  const warnings: string[] = [];

  for (const literal of literals) {
    for (const variant of literal.variants) {
      if (variant.kind === 'objectRef') {
        const obj = objectRegistry[variant.objectName];
        if (!obj) continue;

        const decoratedFields = obj.fields
          .filter(
            (f) =>
              f.defaultValue !== undefined ||
              f.defaultAlwaysValue !== undefined ||
              f.timestampDecorator ||
              f.isNullable ||
              f.isFlexible ||
              f.isReadonly,
          )
          .map((f) => {
            const decs: string[] = [];
            if (f.defaultValue !== undefined) decs.push('@default');
            if (f.defaultAlwaysValue !== undefined) decs.push('@defaultAlways');
            if (f.timestampDecorator === 'createdAt') decs.push('@createdAt');
            if (f.timestampDecorator === 'updatedAt') decs.push('@updatedAt');
            if (f.isNullable) decs.push('@nullable');
            if (f.isFlexible) decs.push('@flexible');
            if (f.isReadonly) decs.push('@readonly');

            return `${f.name} (${decs.join(', ')})`;
          });

        if (decoratedFields.length) {
          warnings.push(
            `Literal '${literal.name}' references object '${variant.objectName}' which has decorated fields: ${decoratedFields.join(', ')}. ` +
              `These decorators will not be enforced when the value is stored through literal '${literal.name}', but will still apply when '${variant.objectName}' is used directly on other fields.`,
          );
        }
      }

      if (variant.kind === 'tupleRef') {
        const tup = tupleRegistry[variant.tupleName];
        if (!tup) continue;

        const decoratedElements = tup.elements
          .filter(
            (el) =>
              el.defaultValue !== undefined ||
              el.defaultAlwaysValue !== undefined ||
              el.timestampDecorator ||
              el.isNullable,
          )
          .map((el) => {
            const elemName = el.name ?? `element[${el.index}]`;
            const decs: string[] = [];
            if (el.defaultValue !== undefined) decs.push('@default');
            if (el.defaultAlwaysValue !== undefined) decs.push('@defaultAlways');
            if (el.timestampDecorator === 'createdAt') decs.push('@createdAt');
            if (el.timestampDecorator === 'updatedAt') decs.push('@updatedAt');
            if (el.isNullable) decs.push('@nullable');

            return `${elemName} (${decs.join(', ')})`;
          });

        if (decoratedElements.length) {
          warnings.push(
            `Literal '${literal.name}' references tuple '${variant.tupleName}' which has decorated elements: ${decoratedElements.join(', ')}. ` +
              `These decorators will not be enforced when the value is stored through literal '${literal.name}', but will still apply when '${variant.tupleName}' is used directly on other fields.`,
          );
        }
      }
    }
  }

  return warnings;
}

/** Validator message led by where the error came from; left alone when the message already names that origin */
function withOrigin(error: SchemaValidationError): string {
  if (!error.origin) return error.message;
  const where = formatOrigin(error.origin);

  return error.message.includes(where) ? error.message : `${where}: ${error.message}`;
}

/** Generate a single schema from resolved options */
export async function generateSingleSchema(options: SingleSchemaOptions): Promise<GenerateResult> {
  const result: GenerateResult = {
    success: false,
    files: [],
    errors: [],
  };

  const {
    outputDir,
    logLevel = 'minimal',
    clientClassName,
    connection,
    databasePins,
    typeFiles = DEFAULT_TYPE_FILES,
  } = options;
  logger.setOutputLevel(logLevel);

  // Throws, like the cross-entry check, so no file is written and the caller cannot treat it as a soft failure
  validateConnectionUrls([{ name: clientClassName ?? 'default', connection }]);

  try {
    const {
      schemaFiles,
      typescriptFiles,
      parseErrors,
      extendsErrors,
      resolvedAST: resolved,
    } = await buildResolvedSchemaAst({
      schemaPath: options.schemaPath,
      entry: options.entry,
      files: options.files,
      filter: options.filter,
      filterBase: options.filterBase,
      filterRoot: options.filterRoot,
      verbose: options.verbose,
    });

    if (!schemaFiles.length && !typescriptFiles.length) {
      result.errors.push('No schema files found');

      return result;
    }

    // Check for parse errors before validation
    if (parseErrors.length) {
      result.errors = parseErrors;
      logger.error('Parse errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    if (extendsErrors.length) {
      for (const error of extendsErrors) {
        result.errors.push(withOrigin(error));
      }
      logger.error('Extends errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    const resolvedAST = resolved as SchemaAST;

    // Validate resolved types — no empty types after resolution (includes abstract models)
    const resolvedErrors = validateResolvedTypes(resolvedAST);
    if (resolvedErrors.length) {
      for (const error of resolvedErrors) {
        result.errors.push(withOrigin(error));
      }
      logger.error('Resolved type errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    // Filter out abstract models — they exist only for inheritance, not for generated output
    const concreteModels = resolvedAST.models.filter((m) => !m.abstract);

    // Validate the resolved schema (relation rules, field names, etc. on the flattened types)
    const validation = validateSchema({
      ...resolvedAST,
      models: concreteModels,
    });
    if (!validation.valid) {
      for (const error of validation.errors) {
        result.errors.push(withOrigin(error));
      }
      logger.error('Schema errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    if (!concreteModels.length) {
      result.errors.push('No models found in schema files');

      return result;
    }

    const abstractCount = resolvedAST.models.length - concreteModels.length;
    const objectCount = resolvedAST.objects.length;
    const tupleCount = resolvedAST.tuples.length;
    const literalCount = resolvedAST.literals.length;
    const enumCount = resolvedAST.enums.length;
    const extraInfo = [
      abstractCount ? `${abstractCount} abstract` : '',
      objectCount ? `${objectCount} object(s)` : '',
      tupleCount ? `${tupleCount} tuple(s)` : '',
      literalCount ? `${literalCount} literal(s)` : '',
      enumCount ? `${enumCount} enum(s)` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    logger.info(`Found ${concreteModels.length} model(s)${extraInfo ? ` and ${extraInfo}` : ''}`);

    // Convert to metadata (using resolved, concrete models and resolved type collections)
    const {
      models,
      objects,
      tuples,
      literals,
      objectRegistry: objRegistry,
      tupleRegistry: tupRegistry,
      literalRegistry: litRegistry,
    } = buildSchemaMetadata(resolvedAST);

    // Check for literal decorator warnings
    if (literals.length && (objRegistry || tupRegistry)) {
      const literalWarnings = collectLiteralWarnings(literals, objRegistry ?? {}, tupRegistry ?? {});
      for (const warning of literalWarnings) {
        logger.warn(warning);
      }
    }

    // Generators write as they go, so they target a staging directory and the real output is
    // only touched once every one of them has returned: a throw leaves the previous output intact.
    const stagingDir = await mkdtemp(`${tmpdir()}/cerial-generate-`);
    const toFinal = (file: string): string => `${outputDir}${file.slice(stagingDir.length)}`;

    try {
      // Generate files
      logger.progress('Generating files...');

      const registryPaths = await writeModelRegistry(stagingDir, models, objects, tuples, literals);
      result.files.push(...registryPaths);
      if (logLevel === 'full') registryPaths.forEach((f) => logger.fileCreated(toFinal(f)));

      const objectRegistry = objRegistry;
      const tupleRegistry = tupRegistry;
      const literalRegistry = litRegistry;
      const migrationPath = await writeMigrationFile(
        stagingDir,
        models,
        objectRegistry,
        tupleRegistry,
        literalRegistry,
      );
      result.files.push(migrationPath);
      if (logLevel === 'full') logger.fileCreated(toFinal(migrationPath));

      const manifestPath = await writeManifestFile(stagingDir, models, objectRegistry, tupleRegistry, literalRegistry);
      result.files.push(manifestPath);
      if (logLevel === 'full') logger.fileCreated(toFinal(manifestPath));

      const internalIndexPath = await writeInternalIndex(
        stagingDir,
        objects.length > 0,
        tuples.length > 0,
        literals.length > 0,
      );
      result.files.push(internalIndexPath);
      if (logLevel === 'full') logger.fileCreated(toFinal(internalIndexPath));

      const actualLiterals = literals.filter((l) => !l.isEnum);
      const enumLiterals = literals.filter((l) => l.isEnum);

      const clientFiles = await writeClient(
        stagingDir,
        models,
        objects,
        tuples,
        actualLiterals,
        objectRegistry,
        tupleRegistry,
        literalRegistry,
        enumLiterals,
        clientClassName,
        connection,
        databasePins,
        typeFiles,
      );
      result.files.push(...clientFiles);
      if (logLevel === 'full') clientFiles.forEach((f) => logger.fileCreated(toFinal(f)));

      if (logLevel === 'medium') {
        const modelFiles = clientFiles.filter((f) => f.includes('/models/') && !/\/index(\.d)?\.ts$/.test(f));
        logger.info(`  ${modelFiles.length} model files`);
        logger.info(`  ${registryPaths.length + 3} internal files`);
        logger.info(`  ${clientFiles.length - modelFiles.length} client files`);
      }

      result.files = result.files.map(toFinal);

      if (options.clean) {
        logger.progress('Cleaning output directory...');
        await cleanOutputDir(outputDir);
      }

      await cp(stagingDir, outputDir, { recursive: true });

      if (!options.clean) {
        const staleFiles = await removeStaleFiles(outputDir, result.files);
        if (staleFiles.length) {
          logger.info(`Removed ${staleFiles.length} stale file(s)`);
          if (logLevel === 'full') staleFiles.forEach((f) => logger.debug(`  removed ${f}`));
        }
      }
    } finally {
      await rm(stagingDir, { recursive: true, force: true });
    }

    result.success = true;
    logger.success(`Generated ${result.files.length} files`);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    logger.error(message);

    return result;
  }
}

/** Where a resolved entry's declarations come from: its path, its entry module, its listed files, or any mix */
export function schemaSource(
  entry: ResolvedSchemaEntry,
  filterRoot?: string,
): Pick<SingleSchemaOptions, 'schemaPath' | 'entry' | 'files' | 'filterBase' | 'filterRoot'> {
  return {
    schemaPath: entry.entryOnly ? undefined : entry.path,
    entry: entry.entry,
    files: entry.files,
    filterBase: entry.path,
    filterRoot,
  };
}

/**
 * Compare every entry's tables before the first one is written, and return the database pins of the entries
 * that share a table. An entry that fails to parse or resolve is skipped here and reports its own error
 * from the generation loop.
 */
export async function entryDatabasePins(
  entries: ResolvedSchemaEntry[],
  filterRoot?: string,
  filters?: Map<string, PathFilter>,
): Promise<Map<string, DatabasePin[]>> {
  const entryModels: EntryModels[] = [];
  for (const entry of entries) {
    const { resolvedAST } = await buildResolvedSchemaAst({
      ...schemaSource(entry, filterRoot),
      filter: filters?.get(entry.name),
    });
    if (resolvedAST)
      entryModels.push({ name: entry.name, models: resolvedAST.models, database: entry.explicitDatabase });
  }

  return validateEntryTableNames(entryModels);
}

/** Generate multiple schemas sequentially */
export async function generateMultiSchema(
  entries: ResolvedSchemaEntry[],
  options: MultiSchemaOptions,
  filters?: Map<string, PathFilter>,
): Promise<MultiGenerateResult> {
  const result: MultiGenerateResult = { success: true, results: {}, errors: [] };

  validateConnectionUrls(entries);
  const pins = await entryDatabasePins(entries, options.filterRoot, filters);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    logger.progress(`Generating schema '${entry.name}' (${i + 1} of ${entries.length})...`);

    const singleResult = await generateSingleSchema({
      ...schemaSource(entry, options.filterRoot),
      outputDir: entry.output,
      clientClassName: entry.clientClassName,
      logLevel: options.logLevel,
      verbose: options.verbose,
      clean: options.clean,
      filter: filters?.get(entry.name),
      connection: entry.connection,
      databasePins: pins.get(entry.name),
      typeFiles: entry.typeFiles,
    });

    result.results[entry.name] = singleResult;

    if (!singleResult.success) {
      result.success = false;
      result.errors.push(...singleResult.errors.map((e) => `[${entry.name}] ${e}`));
    }
  }

  return result;
}

import { applyFolderOverridesAndDiscover } from './discovery';

export { applyFolderOverridesAndDiscover } from './discovery';

/**
 * Build a root-only filter from .cerialignore at cwd.
 * Used by paths that have no config file (folder discovery, convention markers, legacy, -s flag).
 */
export async function buildRootFilter(cwd: string): Promise<PathFilter | undefined> {
  const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
  if (!rootCerialIgnore) return undefined;

  return resolvePathFilter({ rootCerialIgnore, basePath: cwd });
}

/**
 * Build a filter from root config + root .cerialignore.
 * Used by the config path for discovery-level filtering.
 */
export async function buildConfigRootFilter(
  config: CerialConfig,
  cwd: string,
): Promise<{
  filter: PathFilter | undefined;
  rootFilterConfig: FilterConfig;
  rootCerialIgnore: import('./filters').CerialIgnoreFile | undefined;
}> {
  const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
  const rootFilterConfig: FilterConfig = {
    ignore: config.ignore,
    exclude: config.exclude,
    include: config.include,
  };

  const hasRootFilter = rootCerialIgnore || config.ignore?.length || config.exclude?.length;
  if (!hasRootFilter) return { filter: undefined, rootFilterConfig, rootCerialIgnore };

  const filter = resolvePathFilter({
    rootConfig: rootFilterConfig,
    rootCerialIgnore,
    basePath: cwd,
  });

  return { filter, rootFilterConfig, rootCerialIgnore };
}

/**
 * Build per-schema filters for config-based generation.
 * Each schema entry gets its own cascading filter combining root + schema + folder .cerialignore layers.
 */
export async function buildSchemaFilters(
  config: CerialConfig,
  entries: ResolvedSchemaEntry[],
  rootFilterConfig: FilterConfig,
  rootCerialIgnore: import('./filters').CerialIgnoreFile | undefined,
  cwd: string,
): Promise<Map<string, PathFilter>> {
  const filters = new Map<string, PathFilter>();

  if (config.schemas) {
    for (const entry of entries) {
      const schemaEntry = config.schemas[entry.name];
      const schemaFilterConfig: FilterConfig | undefined = schemaEntry
        ? { ignore: schemaEntry.ignore, exclude: schemaEntry.exclude, include: schemaEntry.include }
        : undefined;

      const folderCerialIgnore = (await loadCerialIgnore(entry.path)) ?? undefined;

      const filter = resolvePathFilter({
        rootConfig: rootFilterConfig,
        schemaConfig: schemaFilterConfig,
        rootCerialIgnore,
        folderCerialIgnore,
        basePath: cwd,
        schemaPath: entry.path,
      });

      filters.set(entry.name, filter);
    }
  } else {
    // Single schema config (config.schema) — just root + folder cerialignore
    for (const entry of entries) {
      const folderCerialIgnore = (await loadCerialIgnore(entry.path)) ?? undefined;

      const filter = resolvePathFilter({
        rootConfig: rootFilterConfig,
        rootCerialIgnore,
        folderCerialIgnore,
        basePath: cwd,
        schemaPath: entry.path,
      });

      filters.set(entry.name, filter);
    }
  }

  return filters;
}

/** Run the generate command */
export async function generate(options: CLIOptions): Promise<GenerateResult> {
  const result: GenerateResult = {
    success: false,
    files: [],
    errors: [],
  };

  const cwd = process.cwd();

  // -s flag → single schema mode (backward compat, ignore config)
  if (options.schema) {
    const optionsValidation = validateOptions(options);
    if (!optionsValidation.valid) {
      result.errors = optionsValidation.errors.map((e) => e.message);

      return result;
    }

    const rootFilter = await buildRootFilter(cwd);

    return generateSingleSchema({
      schemaPath: options.schema,
      outputDir: options.output!,
      logLevel: options.log,
      verbose: options.verbose,
      clean: options.clean,
      filter: rootFilter,
    });
  }

  // Try loading config
  try {
    const config = await loadConfig(options.config);
    if (config) {
      const { filter: rootFilter, rootFilterConfig, rootCerialIgnore } = await buildConfigRootFilter(config, cwd);

      // When config is explicitly provided, scope discovery to its directory
      // to prevent fixture/test folder pollution from auto-discovery at project root
      const configDir = options.config ? dirname(resolve(options.config)) : cwd;

      const entries = resolveConfig(config);
      const allEntries = await applyFolderOverridesAndDiscover(entries, configDir, rootFilter);

      let targetEntries = allEntries;
      if (options.name) {
        targetEntries = allEntries.filter((e) => e.name === options.name);
        if (!targetEntries.length) {
          result.errors.push(
            `Schema '${options.name}' not found. Available schemas: ${allEntries.map((e) => e.name).join(', ')}`,
          );

          return result;
        }
      }

      // -o override
      if (options.output) {
        targetEntries = targetEntries.map((e) => ({ ...e, output: options.output! }));
      }

      const logLevel = options.log ?? 'minimal';
      logger.setOutputLevel(logLevel);

      const filters = await buildSchemaFilters(config, targetEntries, rootFilterConfig, rootCerialIgnore, configDir);

      const multiResult = await generateMultiSchema(
        targetEntries,
        {
          logLevel: options.log,
          verbose: options.verbose,
          clean: options.clean,
          filterRoot: configDir,
        },
        filters,
      );

      const allFiles = Object.values(multiResult.results).flatMap((r) => r.files);

      return { success: multiResult.success, files: allFiles, errors: multiResult.errors };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);

    return result;
  }

  // No config, no -s → folder configs, then convention markers, then legacy mode
  try {
    const found = await discoverSchemaRoots(cwd);

    if (found) {
      const logLevel = options.log ?? 'minimal';
      logger.setOutputLevel(logLevel);

      const outputOf = ({ dir, output }: DiscoveredRoot): string =>
        options.output ?? (output ? resolve(dir, output) : resolve(dir, 'client'));

      if (found.roots.length === 1) {
        const root = found.roots[0]!;

        return generateSingleSchema({
          schemaPath: root.dir,
          outputDir: outputOf(root),
          logLevel: options.log,
          verbose: options.verbose,
          clean: options.clean,
          filter: root.filter,
          typeFiles: root.typeFiles,
        });
      }

      const entries: ResolvedSchemaEntry[] = found.roots.map((root) => ({
        name: root.name,
        path: root.dir,
        output: outputOf(root),
        clientClassName: discoveredClientClassName(found.roots, root),
        typeFiles: root.typeFiles,
      }));

      // Check for duplicate names/outputs among discovered markers
      if (found.source === 'marker') validateCombinedEntries([], entries);

      const multiResult = await generateMultiSchema(
        entries,
        {
          logLevel: options.log,
          verbose: options.verbose,
          clean: options.clean,
        },
        new Map(found.roots.map((root) => [root.name, root.filter])),
      );

      const allFiles = Object.values(multiResult.results).flatMap((r) => r.files);

      return { success: multiResult.success, files: allFiles, errors: multiResult.errors };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);

    return result;
  }

  // Legacy fallback
  const optionsValidation = validateOptions(options);
  if (!optionsValidation.valid) {
    result.errors = optionsValidation.errors.map((e) => e.message);

    return result;
  }

  const legacyFilter = await buildRootFilter(cwd);

  return generateSingleSchema({
    outputDir: options.output!,
    logLevel: options.log,
    verbose: options.verbose,
    clean: options.clean,
    filter: legacyFilter,
  });
}
