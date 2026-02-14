/**
 * Registry writer - writes the model/object/tuple registry file
 */

import type { ModelMetadata, ObjectMetadata, TupleMetadata } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateCombinedRegistryCode, generateFullRegistryCode, generateRegistryCode } from './registry-generator';

/** Write model registry file to internal/ directory */
export async function writeModelRegistry(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
  tuples: TupleMetadata[] = [],
): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/model-registry.ts`;
  let content: string;
  if (tuples.length) {
    content = generateFullRegistryCode(models, objects, tuples);
  } else if (objects.length) {
    content = generateCombinedRegistryCode(models, objects);
  } else {
    content = generateRegistryCode(models);
  }
  const formatted = await formatCode(content, outputDir);

  await Bun.write(filePath, formatted);

  return filePath;
}
