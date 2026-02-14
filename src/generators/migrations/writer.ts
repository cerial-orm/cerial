/**
 * Migration writer - writes migration-related generated files
 */

import type { ModelMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generatePerModelMigrationCode } from './define-generator';

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
