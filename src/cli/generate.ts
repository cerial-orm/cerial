/**
 * Generate command - orchestrates the generation process
 */

import { writeClient } from '../generators/client/writer';
import { convertModels, convertObjects, createObjectRegistry, resolveObjectFields } from '../generators/metadata';
import { writeInternalIndex, writeModelRegistry } from '../generators/metadata/writer';
import { writeMigrationFile } from '../generators/migrations/writer';
import { collectObjectNames, parse } from '../parser/parser';
import type { ASTModel, ASTObject } from '../types';
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

    // Two-pass parsing: first collect all object names across all files
    const allObjectNames = new Set<string>();
    for (const { content } of schemaContents) {
      const names = collectObjectNames(content);
      for (const name of names) {
        allObjectNames.add(name);
      }
    }

    // Second pass: parse each schema with full object name context
    const allModels: ASTModel[] = [];
    const allObjects: ASTObject[] = [];
    const parseErrors: string[] = [];

    for (const { path, content } of schemaContents) {
      const parseResult = parse(content, allObjectNames);

      if (parseResult.errors.length) {
        for (const error of parseResult.errors) {
          parseErrors.push(`${path}:${error.position.line}: ${error.message}`);
        }
        continue;
      }

      allModels.push(...parseResult.ast.models);
      allObjects.push(...parseResult.ast.objects);
    }

    // Check for parse errors before validation
    if (parseErrors.length) {
      result.errors = parseErrors;
      logger.error('Parse errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));

      return result;
    }

    // Validate combined schema (all models and objects together)
    const combinedAST = { models: allModels, objects: allObjects, source: '' };
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
    logger.info(`Found ${allModels.length} model(s)${objectCount ? ` and ${objectCount} object(s)` : ''}`);

    // Convert to metadata
    const models = convertModels(allModels);
    const objects = convertObjects(allObjects);

    // Resolve inline object fields (populate objectInfo.fields for runtime query building)
    if (objects.length) {
      const objRegistry = createObjectRegistry(objects);
      resolveObjectFields(models, objects, objRegistry);
    }

    // Generate files
    logger.progress('Generating files...');

    // Write model registry (includes object registry if objects exist)
    const registryPath = await writeModelRegistry(outputDir, models, objects);
    result.files.push(registryPath);
    if (logLevel === 'full') logger.fileCreated(registryPath);

    // Write migration file (pass object registry for sub-field DEFINE statements)
    const objectRegistry = objects.length ? createObjectRegistry(objects) : undefined;
    const migrationPath = await writeMigrationFile(outputDir, models, objectRegistry);
    result.files.push(migrationPath);
    if (logLevel === 'full') logger.fileCreated(migrationPath);

    // Write internal index
    const internalIndexPath = await writeInternalIndex(outputDir, objects.length > 0);
    result.files.push(internalIndexPath);
    if (logLevel === 'full') logger.fileCreated(internalIndexPath);

    // Write client files (including object type files)
    const clientFiles = await writeClient(outputDir, models, objects, objectRegistry);
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
