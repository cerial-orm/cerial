/**
 * Migration writer - writes migration-related generated files
 */

import { writeFile } from 'node:fs/promises';
import type { LiteralRegistry, ModelMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generatePerModelMigrationCode, migrationChunkPath } from './define-generator';
import { generateManifestCode } from './manifest';

/** Write the migration chunks and `internal/migrations.ts`; returns every file written */
export async function writeMigrationFile(
  outputDir: string,
  models: ModelMetadata[],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
): Promise<string[]> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const { aggregator, chunks } = generatePerModelMigrationCode(models, objectRegistry, tupleRegistry, literalRegistry);
  const written: string[] = [];

  for (const [index, code] of chunks.entries()) {
    const filePath = `${internalDir}/${migrationChunkPath(index)}.ts`;
    await ensureDir(`${internalDir}/migrations`);
    await writeFile(filePath, await formatCode(code, outputDir), 'utf-8');
    written.push(filePath);
  }

  const filePath = `${internalDir}/migrations.ts`;
  const content = `/**
 * Generated migration statements
 * Do not edit manually
 */

${aggregator}
`;
  await writeFile(filePath, await formatCode(content, outputDir), 'utf-8');
  written.push(filePath);

  return written;
}

/** Write the desired-schema manifest beside the migration file */
export async function writeManifestFile(
  outputDir: string,
  models: ModelMetadata[],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
): Promise<string> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const filePath = `${internalDir}/manifest.ts`;
  const formatted = await formatCode(
    generateManifestCode(models, objectRegistry, tupleRegistry, literalRegistry),
    outputDir,
  );
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}
