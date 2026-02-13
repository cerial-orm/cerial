/**
 * Migration writer - writes migration-related generated files
 */

import { mkdir } from 'node:fs/promises';
import * as prettier from 'prettier';
import type { ModelMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { generatePerModelMigrationCode } from './define-generator';

/** Prettier config cache */
let prettierConfig: prettier.Options | null = null;

/** Ensure directory exists */
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Load prettier config from workspace root */
async function loadPrettierConfig(outputDir: string): Promise<prettier.Options> {
  if (prettierConfig) return prettierConfig;

  const resolvedConfig = await prettier.resolveConfig(outputDir);

  prettierConfig = {
    ...resolvedConfig,
    parser: 'typescript',
  };

  return prettierConfig;
}

/** Format TypeScript code with prettier */
async function formatCode(code: string, outputDir: string): Promise<string> {
  try {
    const config = await loadPrettierConfig(outputDir);
    return await prettier.format(code, config);
  } catch {
    return code;
  }
}

/** Write migration file to internal directory */
export async function writeMigrationFile(
  outputDir: string,
  models: ModelMetadata[],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/migrations.ts`;
  const content = `/**
 * Generated migration statements
 * Do not edit manually
 */

${generatePerModelMigrationCode(models, objectRegistry, tupleRegistry)}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);
  return filePath;
}
