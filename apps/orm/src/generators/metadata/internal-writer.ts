/**
 * Internal writer - writes the internal barrel index file
 */

import { writeFile } from 'node:fs/promises';
import { ensureDir, formatCode } from '../shared';

/** Write internal index file */
export async function writeInternalIndex(
  outputDir: string,
  hasObjects: boolean = false,
  hasTuples: boolean = false,
  hasLiterals: boolean = false,
): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/index.ts`;

  const objectExports = hasObjects
    ? `\nexport { objectRegistry } from './model-registry.js';\nexport type { ObjectRegistry } from './model-registry.js';`
    : '';

  const tupleExports = hasTuples
    ? `\nexport { tupleRegistry } from './model-registry.js';\nexport type { TupleRegistry } from './model-registry.js';`
    : '';

  const literalExports = hasLiterals
    ? `\nexport { literalRegistry } from './model-registry.js';\nexport type { LiteralRegistry } from './model-registry.js';`
    : '';

  const content = `/**
 * Generated internal exports
 * Do not edit manually
 */

export { modelRegistry } from './model-registry.js';
export type { ModelRegistry } from './model-registry.js';${objectExports}${tupleExports}${literalExports}
export { migrationsByModel, getModelMigrationQuery, getMigrationModelNames, modelNames } from './migrations.js';
export type { ModelName } from './migrations.js';
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}
