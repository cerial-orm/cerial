/**
 * Generate command - orchestrates the generation process
 */

import { readdir, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { writeClient } from '../generators/client/writer';
import {
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createObjectRegistry,
  createRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../generators/metadata';
import { writeInternalIndex } from '../generators/metadata/internal-writer';
import { writeModelRegistry } from '../generators/metadata/registry-writer';
import { writeMigrationFile } from '../generators/migrations/writer';
import { collectEnumNames, collectLiteralNames, collectObjectNames, collectTupleNames, parse } from '../parser/parser';
import { resolveInheritance } from '../resolver';
import type {
  ASTEnum,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  LiteralMetadata,
  ObjectRegistry,
  TupleRegistry,
} from '../types';
import type { CerialConfig, ResolvedSchemaEntry } from './config';
import {
  detectConfigsInsideRootPaths,
  detectNestedSchemaRoots,
  findFolderConfigs,
  loadConfig,
  loadFolderConfig,
  resolveConfig,
  toClientClassName,
  validateCombinedEntries,
} from './config';
import type { FilterConfig, PathFilter } from './filters';
import { loadCerialIgnore, resolvePathFilter } from './filters';
import { findSchemaRoots, resolveSchemas, resolveSinglePath } from './resolvers';
import { logger } from './utils';
import type { CLIOptions, LogOutputLevel } from './validators';
import { validateExtends, validateOptions, validateResolvedTypes, validateSchema } from './validators';

/** Generation result */
export interface GenerateResult {
  success: boolean;
  files: string[];
  errors: string[];
}

/** Options for generating a single schema */
export interface SingleSchemaOptions {
  schemaPath?: string;
  outputDir: string;
  logLevel?: LogOutputLevel;
  verbose?: boolean;
  clean?: boolean;
  clientClassName?: string;
  filter?: PathFilter;
}

/** Options for generating multiple schemas */
export interface MultiSchemaOptions {
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
        // Remove directory if it became empty after cleaning
        try {
          const remaining = await readdir(fullPath);
          if (!remaining.length) await rm(fullPath, { recursive: true, force: true });
        } catch {
          // Ignore errors on cleanup
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !generatedSet.has(resolve(fullPath))) {
        staleFiles.push(fullPath);
      }
    }
  }

  await scan(outputDir);
  await Promise.all(staleFiles.map((f) => rm(f, { force: true })));

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

/** Generate a single schema from resolved options */
export async function generateSingleSchema(options: SingleSchemaOptions): Promise<GenerateResult> {
  const result: GenerateResult = {
    success: false,
    files: [],
    errors: [],
  };

  const { outputDir, logLevel = 'minimal', clientClassName } = options;
  logger.setOutputLevel(logLevel);

  try {
    // Resolve schema files
    logger.progress('Finding schema files...');

    const schemaFiles: string[] = options.schemaPath
      ? await resolveSinglePath(options.schemaPath, process.cwd(), options.filter)
      : await resolveSchemas({ filter: options.filter });

    if (!schemaFiles.length) {
      result.errors.push('No schema files found');

      return result;
    }

    logger.info(`Found ${schemaFiles.length} schema file(s)`);
    if (options.verbose) {
      schemaFiles.forEach((f) => logger.debug(`  - ${f}`));
    }

    // Load and parse schemas
    logger.progress('Parsing schemas...');

    const schemaContents = await Promise.all(
      schemaFiles.map(async (path) => {
        const file = Bun.file(path);
        const content = await file.text();

        return { path, content };
      }),
    );

    // Two-pass parsing: first collect all object, tuple, literal, and enum names across all files
    const allObjectNames = new Set<string>();
    const allTupleNames = new Set<string>();
    const allLiteralNames = new Set<string>();
    const allEnumNames = new Set<string>();
    for (const { content } of schemaContents) {
      const objNames = collectObjectNames(content);
      for (const name of objNames) {
        allObjectNames.add(name);
      }
      const tupNames = collectTupleNames(content);
      for (const name of tupNames) {
        allTupleNames.add(name);
      }
      const litNames = collectLiteralNames(content);
      for (const name of litNames) {
        allLiteralNames.add(name);
      }
      const enumNms = collectEnumNames(content);
      for (const name of enumNms) {
        allEnumNames.add(name);
      }
    }

    // Second pass: parse each schema with full object, tuple, literal, and enum name context
    const allModels: ASTModel[] = [];
    const allObjects: ASTObject[] = [];
    const allTuples: ASTTuple[] = [];
    const allLiterals: ASTLiteral[] = [];
    const allEnums: ASTEnum[] = [];
    const parseErrors: string[] = [];

    for (const { path, content } of schemaContents) {
      const parseResult = parse(content, allObjectNames, allTupleNames, allLiteralNames, allEnumNames);

      if (parseResult.errors.length) {
        for (const error of parseResult.errors) {
          parseErrors.push(`${path}:${error.position.line}: ${error.message}`);
        }
        continue;
      }

      allModels.push(...parseResult.ast.models);
      allObjects.push(...parseResult.ast.objects);
      allTuples.push(...parseResult.ast.tuples);
      allLiterals.push(...parseResult.ast.literals);
      allEnums.push(...parseResult.ast.enums);
    }

    // Check for parse errors before validation
    if (parseErrors.length) {
      result.errors = parseErrors;
      logger.error('Parse errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    // Build combined AST from all parsed files
    const combinedAST: import('../types').SchemaAST = {
      models: allModels,
      objects: allObjects,
      tuples: allTuples,
      literals: allLiterals,
      enums: allEnums,
      source: '',
    };

    // Validate extends on the RAW AST (catches cycles, missing targets, private violations, abstract rules)
    const extendsErrors = validateExtends(combinedAST);
    if (extendsErrors.length) {
      for (const error of extendsErrors) {
        const modelFile = schemaContents.find((s) =>
          allModels.some((m) => m.name === error.model && s.content.includes(`model ${error.model}`)),
        );
        const prefix = modelFile ? `${modelFile.path}: ` : '';
        result.errors.push(`${prefix}${error.message}`);
      }
      logger.error('Extends errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    // Resolve inheritance — flatten extends chains, apply pick/omit, strip private markers
    const resolvedAST = resolveInheritance(combinedAST);

    // Validate resolved types — no empty types after resolution (includes abstract models)
    const resolvedErrors = validateResolvedTypes(resolvedAST);
    if (resolvedErrors.length) {
      for (const error of resolvedErrors) {
        const modelFile = schemaContents.find((s) =>
          allModels.some((m) => m.name === error.model && s.content.includes(`model ${error.model}`)),
        );
        const prefix = modelFile ? `${modelFile.path}: ` : '';
        result.errors.push(`${prefix}${error.message}`);
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
        const modelFile = schemaContents.find((s) =>
          concreteModels.some((m) => m.name === error.model && s.content.includes(`model ${error.model}`)),
        );
        const prefix = modelFile ? `${modelFile.path}: ` : '';
        result.errors.push(`${prefix}${error.message}`);
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
    const models = convertModels(concreteModels);
    const objects = convertObjects(resolvedAST.objects);
    const tuples = convertTuples(resolvedAST.tuples);

    // Convert enums to synthetic ASTLiteral entries for the literal pipeline
    const syntheticEnumLiterals: ASTLiteral[] = resolvedAST.enums.map((e) => ({
      name: e.name,
      variants: e.values.map((v): import('../types').ASTLiteralVariant => ({ kind: 'string', value: v })),
      range: e.range,
    }));
    const allLiteralsForConversion = [...resolvedAST.literals, ...syntheticEnumLiterals];
    const literals = convertLiterals(allLiteralsForConversion);
    for (const lit of literals) {
      if (resolvedAST.enums.some((e) => e.name === lit.name)) {
        lit.isEnum = true;
      }
    }

    // Resolve inline object, tuple, and literal fields
    const objRegistry = objects.length ? createObjectRegistry(objects) : undefined;
    const tupRegistry = tuples.length ? createTupleRegistry(tuples) : undefined;
    const litRegistry = literals.length ? createLiteralRegistry(literals) : undefined;
    if (objects.length || tuples.length || literals.length) {
      resolveObjectFields(models, objects, objRegistry ?? {}, tupRegistry, litRegistry);
    }

    const modelRegistry = createRegistry(models);
    inferFKTypes(models, modelRegistry);

    // Check for literal decorator warnings
    if (literals.length && (objRegistry || tupRegistry)) {
      const literalWarnings = collectLiteralWarnings(literals, objRegistry ?? {}, tupRegistry ?? {});
      for (const warning of literalWarnings) {
        logger.warn(warning);
      }
    }

    if (options.clean) {
      logger.progress('Cleaning output directory...');
      await cleanOutputDir(outputDir);
    }

    // Generate files
    logger.progress('Generating files...');

    const registryPath = await writeModelRegistry(outputDir, models, objects, tuples, literals);
    result.files.push(registryPath);
    if (logLevel === 'full') logger.fileCreated(registryPath);

    const objectRegistry = objRegistry;
    const tupleRegistry = tupRegistry;
    const literalRegistry = litRegistry;
    const migrationPath = await writeMigrationFile(outputDir, models, objectRegistry, tupleRegistry, literalRegistry);
    result.files.push(migrationPath);
    if (logLevel === 'full') logger.fileCreated(migrationPath);

    const internalIndexPath = await writeInternalIndex(
      outputDir,
      objects.length > 0,
      tuples.length > 0,
      literals.length > 0,
    );
    result.files.push(internalIndexPath);
    if (logLevel === 'full') logger.fileCreated(internalIndexPath);

    const actualLiterals = literals.filter((l) => !l.isEnum);
    const enumLiterals = literals.filter((l) => l.isEnum);

    const clientFiles = await writeClient(
      outputDir,
      models,
      objects,
      tuples,
      actualLiterals,
      objectRegistry,
      tupleRegistry,
      literalRegistry,
      enumLiterals,
      clientClassName,
    );
    result.files.push(...clientFiles);
    if (logLevel === 'full') clientFiles.forEach((f) => logger.fileCreated(f));

    if (logLevel === 'medium') {
      const modelFiles = clientFiles.filter((f) => f.includes('/models/') && !f.endsWith('index.ts'));
      logger.info(`  ${modelFiles.length} model files`);
      logger.info(`  3 internal files`);
      logger.info(`  ${clientFiles.length - modelFiles.length} client files`);
    }

    if (!options.clean) {
      const staleFiles = await removeStaleFiles(outputDir, result.files);
      if (staleFiles.length) {
        logger.info(`Removed ${staleFiles.length} stale file(s)`);
        if (logLevel === 'full') staleFiles.forEach((f) => logger.debug(`  removed ${f}`));
      }
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

/** Generate multiple schemas sequentially */
export async function generateMultiSchema(
  entries: ResolvedSchemaEntry[],
  options: MultiSchemaOptions,
  filters?: Map<string, PathFilter>,
): Promise<MultiGenerateResult> {
  const result: MultiGenerateResult = { success: true, results: {}, errors: [] };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    logger.progress(`Generating schema '${entry.name}' (${i + 1} of ${entries.length})...`);

    const singleResult = await generateSingleSchema({
      schemaPath: entry.path,
      outputDir: entry.output,
      clientClassName: entry.clientClassName,
      logLevel: options.logLevel,
      verbose: options.verbose,
      clean: options.clean,
      filter: filters?.get(entry.name),
    });

    result.results[entry.name] = singleResult;

    if (!singleResult.success) {
      result.success = false;
      result.errors.push(...singleResult.errors.map((e) => `[${entry.name}] ${e}`));
    }
  }

  return result;
}

export async function applyFolderOverridesAndDiscover(
  entries: ResolvedSchemaEntry[],
  cwd: string,
  filter?: PathFilter,
): Promise<ResolvedSchemaEntry[]> {
  const mergedEntries: ResolvedSchemaEntry[] = [];
  for (const entry of entries) {
    const folderConfig = await loadFolderConfig(entry.path);
    if (folderConfig) {
      mergedEntries.push({
        ...entry,
        ...(folderConfig.output ? { output: resolve(entry.path, folderConfig.output) } : {}),
        ...(folderConfig.connection ? { connection: folderConfig.connection } : {}),
      });
    } else {
      mergedEntries.push(entry);
    }
  }

  await detectConfigsInsideRootPaths(
    mergedEntries.map((e) => e.path),
    cwd,
  );

  const allFolderConfigs = await findFolderConfigs(cwd, filter);
  const rootPaths = mergedEntries.map((e) => resolve(e.path));
  const discovered = allFolderConfigs.filter(({ dir }) => {
    const resolvedDir = resolve(dir);

    return !rootPaths.some((rp) => resolvedDir === rp || resolvedDir.startsWith(`${rp}/`));
  });

  const discoveredEntries: ResolvedSchemaEntry[] = discovered.map(({ dir, config }) => {
    const name = config.name ?? basename(dir);

    return {
      name,
      path: dir,
      output: config.output ? resolve(dir, config.output) : resolve(dir, 'client'),
      clientClassName: toClientClassName(name),
      connection: config.connection,
    };
  });

  for (const entry of discoveredEntries) {
    logger.warn(
      `Auto-discovered schema '${entry.name}' from folder config at '${entry.path}' (not defined in root config)`,
    );
  }

  // Discover convention markers
  const schemaRoots = await findSchemaRoots(cwd, filter);

  // Filter out markers at/inside root paths (root config covers them)
  const discoveredMarkers = schemaRoots.filter(({ path: markerPath }) => {
    const resolvedMarker = resolve(markerPath);

    return !rootPaths.some((rp) => resolvedMarker === rp || resolvedMarker.startsWith(`${rp}/`));
  });

  // Filter out markers where folder config already exists (folder config wins)
  const folderConfigDirs = new Set(discovered.map(({ dir }) => resolve(dir)));
  const uniqueMarkers = discoveredMarkers.filter(({ path: mp }) => !folderConfigDirs.has(resolve(mp)));

  // Cross-method nesting detection (folder-config ↔ convention-marker)
  const typedRoots: Array<{ path: string; type: 'folder-config' | 'convention-marker' }> = [
    ...discovered.map(({ dir }) => ({ path: dir, type: 'folder-config' as const })),
    ...uniqueMarkers.map(({ path: mp }) => ({ path: mp, type: 'convention-marker' as const })),
  ];
  const { ignored } = detectNestedSchemaRoots(typedRoots);

  // Filter out ignored markers
  const finalMarkers = uniqueMarkers.filter(({ path: mp }) => !ignored.has(mp));

  const takenNames = new Set(discoveredEntries.map((e) => e.name));
  const deduplicatedMarkers = finalMarkers.filter(({ path: mp }) => {
    const name = basename(mp);
    if (takenNames.has(name)) return false;
    takenNames.add(name);

    return true;
  });

  const markerEntries: ResolvedSchemaEntry[] = deduplicatedMarkers.map(({ path: mp }) => {
    const name = basename(mp);

    return {
      name,
      path: mp,
      output: resolve(mp, 'client'),
      clientClassName: toClientClassName(name),
    };
  });

  for (const entry of markerEntries) {
    logger.warn(
      `Auto-discovered schema '${entry.name}' from convention marker at '${entry.path}' (not defined in root config)`,
    );
  }

  // Combine ALL discovered entries (folder configs + convention markers)
  const allDiscoveredEntries = [...discoveredEntries, ...markerEntries];
  validateCombinedEntries(mergedEntries, allDiscoveredEntries);

  return [...mergedEntries, ...allDiscoveredEntries];
}

/**
 * Build a root-only filter from .cerialignore at cwd.
 * Used by paths that have no config file (folder discovery, convention markers, legacy, -s flag).
 */
async function buildRootFilter(cwd: string): Promise<PathFilter | undefined> {
  const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;
  if (!rootCerialIgnore) return undefined;

  return resolvePathFilter({ rootCerialIgnore, basePath: cwd });
}

/**
 * Build a filter from root config + root .cerialignore.
 * Used by the config path for discovery-level filtering.
 */
async function buildConfigRootFilter(
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
async function buildSchemaFilters(
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

  // No config, no -s → try folder config discovery, then legacy mode
  try {
    const rootFilter = await buildRootFilter(cwd);
    const folderConfigs = await findFolderConfigs(cwd, rootFilter);

    if (folderConfigs.length) {
      const logLevel = options.log ?? 'minimal';
      logger.setOutputLevel(logLevel);

      const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;

      if (folderConfigs.length === 1) {
        const { dir, config: folderCfg } = folderConfigs[0]!;
        const outputDir =
          options.output ?? (folderCfg.output ? resolve(dir, folderCfg.output) : resolve(dir, 'client'));
        const folderCerialIgnore = (await loadCerialIgnore(dir)) ?? undefined;
        const folderFilterConfig: FilterConfig = {
          ignore: folderCfg.ignore,
          exclude: folderCfg.exclude,
          include: folderCfg.include,
        };

        const filter = resolvePathFilter({
          rootCerialIgnore,
          folderConfig: folderFilterConfig,
          folderCerialIgnore,
          basePath: cwd,
          schemaPath: dir,
        });

        return generateSingleSchema({
          schemaPath: dir,
          outputDir,
          logLevel: options.log,
          verbose: options.verbose,
          clean: options.clean,
          filter,
        });
      }

      const entries: ResolvedSchemaEntry[] = folderConfigs.map(({ dir, config: folderCfg }) => {
        const name = basename(dir);
        const output = options.output ?? (folderCfg.output ? resolve(dir, folderCfg.output) : resolve(dir, 'client'));

        return {
          name,
          path: dir,
          output,
          clientClassName: toClientClassName(name),
        };
      });

      const filters = new Map<string, PathFilter>();
      for (const { dir, config: folderCfg } of folderConfigs) {
        const name = basename(dir);
        const folderCerialIgnore = (await loadCerialIgnore(dir)) ?? undefined;
        const folderFilterConfig: FilterConfig = {
          ignore: folderCfg.ignore,
          exclude: folderCfg.exclude,
          include: folderCfg.include,
        };

        const filter = resolvePathFilter({
          rootCerialIgnore,
          folderConfig: folderFilterConfig,
          folderCerialIgnore,
          basePath: cwd,
          schemaPath: dir,
        });
        filters.set(name, filter);
      }

      const multiResult = await generateMultiSchema(
        entries,
        {
          logLevel: options.log,
          verbose: options.verbose,
          clean: options.clean,
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

  // No folder configs → try convention marker discovery
  try {
    const markerRootFilter = await buildRootFilter(cwd);
    const schemaRoots = await findSchemaRoots(cwd, markerRootFilter);

    if (schemaRoots.length) {
      const logLevel = options.log ?? 'minimal';
      logger.setOutputLevel(logLevel);

      const rootCerialIgnore = (await loadCerialIgnore(cwd)) ?? undefined;

      // Check for marker-to-marker nesting
      const typedRoots = schemaRoots.map(({ path: mp }) => ({
        path: mp,
        type: 'convention-marker' as const,
      }));
      const { ignored } = detectNestedSchemaRoots(typedRoots);
      const validRoots = schemaRoots.filter(({ path: mp }) => !ignored.has(mp));

      if (validRoots.length === 1) {
        const root = validRoots[0]!;
        const outputDir = options.output ?? resolve(root.path, 'client');
        const folderCerialIgnore = (await loadCerialIgnore(root.path)) ?? undefined;

        const filter = resolvePathFilter({
          rootCerialIgnore,
          folderCerialIgnore,
          basePath: cwd,
          schemaPath: root.path,
        });

        return generateSingleSchema({
          schemaPath: root.path,
          outputDir,
          logLevel: options.log,
          verbose: options.verbose,
          clean: options.clean,
          filter,
        });
      }

      if (validRoots.length > 1) {
        const entries: ResolvedSchemaEntry[] = validRoots.map(({ path: mp }) => {
          const name = basename(mp);
          const output = options.output ?? resolve(mp, 'client');

          return {
            name,
            path: mp,
            output,
            clientClassName: toClientClassName(name),
          };
        });

        // Check for duplicate names/outputs among discovered markers
        validateCombinedEntries([], entries);

        const filters = new Map<string, PathFilter>();
        for (const root of validRoots) {
          const name = basename(root.path);
          const folderCerialIgnore = (await loadCerialIgnore(root.path)) ?? undefined;

          const filter = resolvePathFilter({
            rootCerialIgnore,
            folderCerialIgnore,
            basePath: cwd,
            schemaPath: root.path,
          });
          filters.set(name, filter);
        }

        const multiResult = await generateMultiSchema(
          entries,
          {
            logLevel: options.log,
            verbose: options.verbose,
            clean: options.clean,
          },
          filters,
        );

        const allFiles = Object.values(multiResult.results).flatMap((r) => r.files);

        return { success: multiResult.success, files: allFiles, errors: multiResult.errors };
      }
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
