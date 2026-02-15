/**
 * Generate command - orchestrates the generation process
 */

import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { writeClient } from '../generators/client/writer';
import {
  convertModels,
  convertObjects,
  convertTuples,
  convertLiterals,
  createObjectRegistry,
  createTupleRegistry,
  createLiteralRegistry,
  resolveObjectFields,
} from '../generators/metadata';
import { writeModelRegistry } from '../generators/metadata/registry-writer';
import { writeInternalIndex } from '../generators/metadata/internal-writer';
import { writeMigrationFile } from '../generators/migrations/writer';
import { collectEnumNames, collectLiteralNames, collectObjectNames, collectTupleNames, parse } from '../parser/parser';
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
import { resolveSchemas, resolveSinglePath } from './resolvers';
import { logger } from './utils';
import type { CLIOptions } from './validators';
import { validateOptions, validateSchema } from './validators';

/** Generation result */
export interface GenerateResult {
  success: boolean;
  files: string[];
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

/** Run the generate command */
export async function generate(options: CLIOptions): Promise<GenerateResult> {
  const result: GenerateResult = {
    success: false,
    files: [],
    errors: [],
  };

  // Validate options
  const optionsValidation = validateOptions(options);
  if (!optionsValidation.valid) {
    result.errors = optionsValidation.errors.map((e) => e.message);

    return result;
  }

  const outputDir = options.output!;
  const logLevel = options.log ?? 'minimal';
  logger.setOutputLevel(logLevel);

  try {
    // Resolve schema files
    logger.progress('Finding schema files...');

    const schemaFiles: string[] = options.schema ? await resolveSinglePath(options.schema) : await resolveSchemas();

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

    // Actually read the files directly since loadSchemas uses patterns
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

    // Validate combined schema (all models, objects, tuples, literals, and enums together)
    const combinedAST: import('../types').SchemaAST = {
      models: allModels,
      objects: allObjects,
      tuples: allTuples,
      literals: allLiterals,
      enums: allEnums,
      source: '',
    };
    const validation = validateSchema(combinedAST);
    if (!validation.valid) {
      for (const error of validation.errors) {
        const modelFile = schemaContents.find((s) =>
          allModels.some((m) => m.name === error.model && s.content.includes(`model ${error.model}`)),
        );
        const prefix = modelFile ? `${modelFile.path}: ` : '';
        result.errors.push(`${prefix}${error.message}`);
      }
      logger.error('Schema errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    if (!allModels.length) {
      result.errors.push('No models found in schema files');

      return result;
    }

    const objectCount = allObjects.length;
    const tupleCount = allTuples.length;
    const literalCount = allLiterals.length;
    const enumCount = allEnums.length;
    const extraInfo = [
      objectCount ? `${objectCount} object(s)` : '',
      tupleCount ? `${tupleCount} tuple(s)` : '',
      literalCount ? `${literalCount} literal(s)` : '',
      enumCount ? `${enumCount} enum(s)` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    logger.info(`Found ${allModels.length} model(s)${extraInfo ? ` and ${extraInfo}` : ''}`);

    // Convert to metadata
    const models = convertModels(allModels);
    const objects = convertObjects(allObjects);
    const tuples = convertTuples(allTuples);

    // Convert enums to synthetic ASTLiteral entries for the literal pipeline
    // This merges enum definitions into the literal conversion so literalRef expansion works
    const syntheticEnumLiterals: ASTLiteral[] = allEnums.map((e) => ({
      name: e.name,
      variants: e.values.map((v): import('../types').ASTLiteralVariant => ({ kind: 'string', value: v })),
      range: e.range,
    }));
    const allLiteralsForConversion = [...allLiterals, ...syntheticEnumLiterals];
    const literals = convertLiterals(allLiteralsForConversion);
    // Mark enum-originating entries with isEnum flag
    for (const lit of literals) {
      if (allEnums.some((e) => e.name === lit.name)) {
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

    // Check for literal decorator warnings
    if (literals.length && (objRegistry || tupRegistry)) {
      const literalWarnings = collectLiteralWarnings(literals, objRegistry ?? {}, tupRegistry ?? {});
      for (const warning of literalWarnings) {
        logger.warn(warning);
      }
    }

    // Clean output directory if --clean flag is set
    if (options.clean) {
      logger.progress('Cleaning output directory...');
      await cleanOutputDir(outputDir);
    }

    // Generate files
    logger.progress('Generating files...');

    // Write model registry (includes object, tuple, and literal registries if they exist)
    const registryPath = await writeModelRegistry(outputDir, models, objects, tuples, literals);
    result.files.push(registryPath);
    if (logLevel === 'full') logger.fileCreated(registryPath);

    // Write migration file (pass object/tuple/literal registries for sub-field DEFINE statements)
    const objectRegistry = objRegistry;
    const tupleRegistry = tupRegistry;
    const literalRegistry = litRegistry;
    const migrationPath = await writeMigrationFile(outputDir, models, objectRegistry, tupleRegistry, literalRegistry);
    result.files.push(migrationPath);
    if (logLevel === 'full') logger.fileCreated(migrationPath);

    // Write internal index
    const internalIndexPath = await writeInternalIndex(
      outputDir,
      objects.length > 0,
      tuples.length > 0,
      literals.length > 0,
    );
    result.files.push(internalIndexPath);
    if (logLevel === 'full') logger.fileCreated(internalIndexPath);

    // Split literals into actual literals and enum-derived literals
    const actualLiterals = literals.filter((l) => !l.isEnum);
    const enumLiterals = literals.filter((l) => l.isEnum);

    // Write client files (including object, tuple, literal, and enum type files)
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
    );
    result.files.push(...clientFiles);
    if (logLevel === 'full') clientFiles.forEach((f) => logger.fileCreated(f));

    // Medium level: show category summary
    if (logLevel === 'medium') {
      const modelFiles = clientFiles.filter((f) => f.includes('/models/') && !f.endsWith('index.ts'));
      logger.info(`  ${modelFiles.length} model files`);
      logger.info(`  3 internal files`);
      logger.info(`  ${clientFiles.length - modelFiles.length} client files`);
    }

    // Remove stale files from previous generations (skipped if --clean already wiped the directory)
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
