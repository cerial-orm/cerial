/**
 * Generate command - orchestrates the generation process
 */

import { writeClient } from '../generators/client/writer';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createObjectRegistry,
  createTupleRegistry,
  resolveObjectFields,
} from '../generators/metadata';
import { writeInternalIndex, writeModelRegistry } from '../generators/metadata/writer';
import { writeMigrationFile } from '../generators/migrations/writer';
import { collectObjectNames, collectTupleNames, parse } from '../parser/parser';
import type { ASTModel, ASTObject, ASTTuple } from '../types';
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

    // Two-pass parsing: first collect all object and tuple names across all files
    const allObjectNames = new Set<string>();
    const allTupleNames = new Set<string>();
    for (const { content } of schemaContents) {
      const objNames = collectObjectNames(content);
      for (const name of objNames) {
        allObjectNames.add(name);
      }
      const tupNames = collectTupleNames(content);
      for (const name of tupNames) {
        allTupleNames.add(name);
      }
    }

    // Second pass: parse each schema with full object and tuple name context
    const allModels: ASTModel[] = [];
    const allObjects: ASTObject[] = [];
    const allTuples: ASTTuple[] = [];
    const parseErrors: string[] = [];

    for (const { path, content } of schemaContents) {
      const parseResult = parse(content, allObjectNames, allTupleNames);

      if (parseResult.errors.length) {
        for (const error of parseResult.errors) {
          parseErrors.push(`${path}:${error.position.line}: ${error.message}`);
        }
        continue;
      }

      allModels.push(...parseResult.ast.models);
      allObjects.push(...parseResult.ast.objects);
      allTuples.push(...parseResult.ast.tuples);
    }

    // Check for parse errors before validation
    if (parseErrors.length) {
      result.errors = parseErrors;
      logger.error('Parse errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    // Validate combined schema (all models, objects, and tuples together)
    const combinedAST = { models: allModels, objects: allObjects, tuples: allTuples, source: '' };
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
    const extraInfo = [objectCount ? `${objectCount} object(s)` : '', tupleCount ? `${tupleCount} tuple(s)` : '']
      .filter(Boolean)
      .join(' and ');
    logger.info(`Found ${allModels.length} model(s)${extraInfo ? ` and ${extraInfo}` : ''}`);

    // Convert to metadata
    const models = convertModels(allModels);
    const objects = convertObjects(allObjects);
    const tuples = convertTuples(allTuples);

    // Resolve inline object and tuple fields (populate objectInfo.fields / tupleInfo.elements for runtime query building)
    const objRegistry = objects.length ? createObjectRegistry(objects) : undefined;
    const tupRegistry = tuples.length ? createTupleRegistry(tuples) : undefined;
    if (objects.length || tuples.length) {
      resolveObjectFields(models, objects, objRegistry ?? {}, tupRegistry);
    }

    // Generate files
    logger.progress('Generating files...');

    // Write model registry (includes object and tuple registries if they exist)
    const registryPath = await writeModelRegistry(outputDir, models, objects, tuples);
    result.files.push(registryPath);
    if (logLevel === 'full') logger.fileCreated(registryPath);

    // Write migration file (pass object/tuple registries for sub-field DEFINE statements)
    const objectRegistry = objRegistry;
    const tupleRegistry = tupRegistry;
    const migrationPath = await writeMigrationFile(outputDir, models, objectRegistry, tupleRegistry);
    result.files.push(migrationPath);
    if (logLevel === 'full') logger.fileCreated(migrationPath);

    // Write internal index
    const internalIndexPath = await writeInternalIndex(outputDir, objects.length > 0, tuples.length > 0);
    result.files.push(internalIndexPath);
    if (logLevel === 'full') logger.fileCreated(internalIndexPath);

    // Write client files (including object and tuple type files)
    const clientFiles = await writeClient(outputDir, models, objects, tuples, objectRegistry, tupleRegistry);
    result.files.push(...clientFiles);
    if (logLevel === 'full') clientFiles.forEach((f) => logger.fileCreated(f));

    // Medium level: show category summary
    if (logLevel === 'medium') {
      const modelFiles = clientFiles.filter((f) => f.includes('/models/') && !f.endsWith('index.ts'));
      logger.info(`  ${modelFiles.length} model files`);
      logger.info(`  3 internal files`);
      logger.info(`  ${clientFiles.length - modelFiles.length} client files`);
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
