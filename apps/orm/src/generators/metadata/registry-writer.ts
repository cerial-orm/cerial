/**
 * Registry writer - writes the model/object/tuple/literal registry as chunk files plus an aggregator
 */

import { writeFile } from 'node:fs/promises';
import type { LiteralMetadata, ModelMetadata, ObjectMetadata, TupleMetadata } from '../../types';
import { ensureDir, formatCode } from '../shared';
import {
  generateRegistryAggregatorCode,
  generateRegistryChunks,
  registryChunkPath,
  type RegistryKind,
} from './registry-generator';

/** Write the registry chunks and `internal/model-registry.ts`; returns every file written */
export async function writeModelRegistry(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
  tuples: TupleMetadata[] = [],
  literals: LiteralMetadata[] = [],
): Promise<string[]> {
  const internalDir = `${outputDir}/internal`;
  await ensureDir(internalDir);

  const written: string[] = [];
  const chunkCounts: Record<RegistryKind, number> = { models: 0, objects: 0, tuples: 0, literals: 0 };
  const kinds: Array<[RegistryKind, ModelMetadata[] | ObjectMetadata[] | TupleMetadata[] | LiteralMetadata[]]> = [
    ['models', models],
    ['objects', objects],
    ['tuples', tuples],
    ['literals', literals],
  ];

  for (const [kind, entries] of kinds) {
    const chunks = generateRegistryChunks(kind, entries);
    chunkCounts[kind] = chunks.length;
    for (const [index, code] of chunks.entries()) {
      const filePath = `${internalDir}/${registryChunkPath(kind, index)}.ts`;
      await ensureDir(`${internalDir}/registry/${kind}`);
      await writeFile(filePath, await formatCode(code, outputDir), 'utf-8');
      written.push(filePath);
    }
  }

  const filePath = `${internalDir}/model-registry.ts`;
  await writeFile(filePath, await formatCode(generateRegistryAggregatorCode(chunkCounts), outputDir), 'utf-8');
  written.push(filePath);

  return written;
}
