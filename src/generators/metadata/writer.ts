/**
 * Metadata writer - writes model registry files
 */

import type { ModelMetadata, ObjectMetadata } from '../../types';
import { generateCombinedRegistryCode, generateRegistryCode } from './registry-generator';
import { mkdir } from 'node:fs/promises';
import * as prettier from 'prettier';

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

/** Write model registry file */
export async function writeModelRegistry(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/model-registry.ts`;
  const content = objects.length ? generateCombinedRegistryCode(models, objects) : generateRegistryCode(models);
  const formatted = await formatCode(content, outputDir);

  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write internal index file */
export async function writeInternalIndex(outputDir: string, hasObjects: boolean = false): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/index.ts`;

  const objectExports = hasObjects
    ? `\nexport { objectRegistry } from './model-registry';\nexport type { ObjectRegistry } from './model-registry';`
    : '';

  const content = `/**
 * Generated internal exports
 * Do not edit manually
 */

export { modelRegistry } from './model-registry';
export type { ModelRegistry } from './model-registry';${objectExports}
export { migrationsByModel, getModelMigrationQuery, getMigrationModelNames, modelNames } from './migrations';
export type { ModelName } from './migrations';
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}
