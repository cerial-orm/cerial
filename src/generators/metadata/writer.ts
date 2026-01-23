/**
 * Metadata writer - writes model registry files
 */

import type { ModelMetadata } from '../../types';
import { generateRegistryCode } from './registry-generator';
import { mkdir } from 'node:fs/promises';

/** Ensure directory exists */
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Write model registry file */
export async function writeModelRegistry(
  outputDir: string,
  models: ModelMetadata[],
): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/model-registry.ts`;
  const content = generateRegistryCode(models);

  await Bun.write(filePath, content);

  return filePath;
}

/** Write internal index file */
export async function writeInternalIndex(outputDir: string): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/index.ts`;
  const content = `/**
 * Generated internal exports
 * Do not edit manually
 */

export { modelRegistry } from './model-registry';
export type { ModelRegistry } from './model-registry';
`;

  await Bun.write(filePath, content);

  return filePath;
}
