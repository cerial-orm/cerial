/**
 * Barrel writer - writes index.ts barrel files for models/, objects/, and tuples/ directories
 */

import { writeFile } from 'node:fs/promises';
import type { LiteralMetadata, ModelMetadata, ObjectMetadata, TupleMetadata } from '../../types';
import type { TypeFilesMode } from '../../cli/config/types';
import { ensureDir, formatCode } from '../shared';
import { typeFileName } from './type-file';

/** Write models/index.ts barrel file (models only). The type barrels use `export type *` so they hold no runtime */
export async function writeModelsIndex(
  outputDir: string,
  models: ModelMetadata[],
  typeFiles: TypeFilesMode = 'ts',
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/${typeFileName('index', typeFiles)}`;
  const exports = models.map((m) => `export type * from './${m.name.toLowerCase()}.js';`).join('\n');

  const content = `/**
 * Generated model exports
 * Do not edit manually
 */

${exports}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}

/** Write objects/index.ts barrel file (objects only) */
export async function writeObjectsIndex(
  outputDir: string,
  objects: ObjectMetadata[],
  typeFiles: TypeFilesMode = 'ts',
): Promise<string> {
  if (!objects.length) return '';

  const objectsDir = `${outputDir}/objects`;
  await ensureDir(objectsDir);

  const filePath = `${objectsDir}/${typeFileName('index', typeFiles)}`;
  const exports = objects.map((o) => `export type * from './${o.name.toLowerCase()}.js';`).join('\n');

  const content = `/**
 * Generated object exports
 * Do not edit manually
 */

${exports}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}

/** Write tuples/index.ts barrel file (tuples only) */
export async function writeTuplesIndex(
  outputDir: string,
  tuples: TupleMetadata[],
  typeFiles: TypeFilesMode = 'ts',
): Promise<string> {
  if (!tuples.length) return '';

  const tuplesDir = `${outputDir}/tuples`;
  await ensureDir(tuplesDir);

  const filePath = `${tuplesDir}/${typeFileName('index', typeFiles)}`;
  const exports = tuples.map((t) => `export type * from './${t.name.toLowerCase()}.js';`).join('\n');

  const content = `/**
 * Generated tuple exports
 * Do not edit manually
 */

${exports}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}

/** Write literals/index.ts barrel file (literals only) */
export async function writeLiteralsIndex(
  outputDir: string,
  literals: LiteralMetadata[],
  typeFiles: TypeFilesMode = 'ts',
): Promise<string> {
  if (!literals.length) return '';

  const literalsDir = `${outputDir}/literals`;
  await ensureDir(literalsDir);

  const filePath = `${literalsDir}/${typeFileName('index', typeFiles)}`;
  const exports = literals.map((l) => `export type * from './${l.name.toLowerCase()}.js';`).join('\n');

  const content = `/**
 * Generated literal exports
 * Do not edit manually
 */

${exports}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}

/** Write enums/index.ts barrel file (enums only). Stays `export *`: enums hold runtime consts */
export async function writeEnumsIndex(outputDir: string, enums: LiteralMetadata[]): Promise<string> {
  if (!enums.length) return '';

  const enumsDir = `${outputDir}/enums`;
  await ensureDir(enumsDir);

  const filePath = `${enumsDir}/index.ts`;
  const exports = enums.map((e) => `export * from './${e.name.toLowerCase()}.js';`).join('\n');

  const content = `/**
 * Generated enum exports
 * Do not edit manually
 */

${exports}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}
