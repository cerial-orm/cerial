/**
 * Internal writer - writes the internal barrel index file
 */

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
    ? `\nexport { objectRegistry } from './model-registry';\nexport type { ObjectRegistry } from './model-registry';`
    : '';

  const tupleExports = hasTuples
    ? `\nexport { tupleRegistry } from './model-registry';\nexport type { TupleRegistry } from './model-registry';`
    : '';

  const literalExports = hasLiterals
    ? `\nexport { literalRegistry } from './model-registry';\nexport type { LiteralRegistry } from './model-registry';`
    : '';

  const content = `/**
 * Generated internal exports
 * Do not edit manually
 */

export { modelRegistry } from './model-registry';
export type { ModelRegistry } from './model-registry';${objectExports}${tupleExports}${literalExports}
export { migrationsByModel, getModelMigrationQuery, getMigrationModelNames, modelNames } from './migrations';
export type { ModelName } from './migrations';
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}
