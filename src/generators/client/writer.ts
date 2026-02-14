/**
 * Client writer - orchestrates writing all generated client files
 */

import type {
  LiteralMetadata,
  LiteralRegistry,
  ModelMetadata,
  ObjectMetadata,
  ObjectRegistry,
  TupleMetadata,
  TupleRegistry,
} from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateConnectionExports } from './connection-template';
import { generateClientTemplate } from './template';
import { writeLiteralsIndex, writeModelsIndex, writeObjectsIndex, writeTuplesIndex } from './barrel-writer';
import { writeClientIndex } from './client-index-writer';
import { writeLiteralFile } from './literal-writer';
import { writeModelTypes } from './model-writer';
import { writeObjectTypes } from './object-writer';
import { writeTupleTypes } from './tuple-writer';

/** Write client main file */
export async function writeClientMain(outputDir: string, models: ModelMetadata[]): Promise<string> {
  await ensureDir(outputDir);

  const filePath = `${outputDir}/client.ts`;
  const content = `/**
 * Generated database client
 * Do not edit manually
 */

${generateClientTemplate(models)}

${generateConnectionExports()}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write all client files */
export async function writeClient(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
  tuples: TupleMetadata[] = [],
  literals: LiteralMetadata[] = [],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
): Promise<string[]> {
  const files: string[] = [];

  // Write client main
  files.push(await writeClientMain(outputDir, models));

  // Write literal types first (they don't depend on anything except objects/tuples they reference)
  for (const literal of literals) {
    files.push(await writeLiteralFile(outputDir, literal, objectRegistry, tupleRegistry));
  }

  // Write tuple types (before objects and models so imports can resolve)
  for (const tuple of tuples) {
    files.push(await writeTupleTypes(outputDir, tuple, tupleRegistry, objectRegistry, literalRegistry));
  }

  // Write object types (before models so model imports can resolve)
  for (const object of objects) {
    files.push(await writeObjectTypes(outputDir, object, objectRegistry, tupleRegistry, literalRegistry));
  }

  // Write model types
  for (const model of models) {
    files.push(await writeModelTypes(outputDir, model, models, objectRegistry, tupleRegistry, literalRegistry));
  }

  // Write barrel files for each type directory
  files.push(await writeModelsIndex(outputDir, models));
  const objectsIndex = await writeObjectsIndex(outputDir, objects);
  if (objectsIndex) files.push(objectsIndex);
  const tuplesIndex = await writeTuplesIndex(outputDir, tuples);
  if (tuplesIndex) files.push(tuplesIndex);
  const literalsIndex = await writeLiteralsIndex(outputDir, literals);
  if (literalsIndex) files.push(literalsIndex);

  // Write main index (includes model, object, tuple, and literal exports)
  files.push(await writeClientIndex(outputDir, models, objects, tuples, literals));

  return files;
}

/** Export formatCode for use in other writers */
export { formatCode } from '../shared';
