/**
 * Generate command - orchestrates the generation process
 */

import { writeClient } from '../generators/client/writer';
import { convertModels } from '../generators/metadata';
import { writeInternalIndex, writeModelRegistry } from '../generators/metadata/writer';
import { parse } from '../parser/parser';
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

    // Parse each schema
    const allModels: ReturnType<typeof parse>['ast']['models'] = [];

    for (const { path, content } of schemaContents) {
      const parseResult = parse(content);

      if (parseResult.errors.length) {
        for (const error of parseResult.errors) {
          result.errors.push(`${path}:${error.position.line}: ${error.message}`);
        }
        continue;
      }

      // Validate schema
      const validation = validateSchema(parseResult.ast);
      if (!validation.valid) {
        for (const error of validation.errors) {
          result.errors.push(`${path}: ${error.message}`);
        }
        continue;
      }

      allModels.push(...parseResult.ast.models);
    }

    if (result.errors.length) {
      logger.error('Schema errors found:');
      result.errors.forEach((e) => logger.error(`  ${e}`));
      return result;
    }

    if (!allModels.length) {
      result.errors.push('No models found in schema files');
      return result;
    }

    logger.info(`Found ${allModels.length} model(s)`);

    // Convert to metadata
    const models = convertModels(allModels);

    // Generate files
    logger.progress('Generating files...');

    // Write model registry
    const registryPath = await writeModelRegistry(outputDir, models);
    result.files.push(registryPath);
    logger.fileCreated(registryPath);

    // Write internal index
    const internalIndexPath = await writeInternalIndex(outputDir);
    result.files.push(internalIndexPath);
    logger.fileCreated(internalIndexPath);

    // Write client files
    const clientFiles = await writeClient(outputDir, models);
    result.files.push(...clientFiles);
    clientFiles.forEach((f) => logger.fileCreated(f));

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
