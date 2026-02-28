/**
 * Barrel writer - writes index.ts barrel files for models/, objects/, and tuples/ directories
 */

import { writeFile } from 'node:fs/promises';
import type { LiteralMetadata, ModelMetadata, ObjectMetadata, TupleMetadata } from '../../types';
import { ensureDir, formatCode } from '../shared';

/** Write models/index.ts barrel file (models only) */
export async function writeModelsIndex(outputDir: string, models: ModelMetadata[]): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/index.ts`;
  const exports = models.map((m) => `export * from './${m.name.toLowerCase()}';`).join('\n');

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
export async function writeObjectsIndex(outputDir: string, objects: ObjectMetadata[]): Promise<string> {
  if (!objects.length) return '';

  const objectsDir = `${outputDir}/objects`;
  await ensureDir(objectsDir);

  const filePath = `${objectsDir}/index.ts`;
  const exports = objects.map((o) => `export * from './${o.name.toLowerCase()}';`).join('\n');

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
export async function writeTuplesIndex(outputDir: string, tuples: TupleMetadata[]): Promise<string> {
  if (!tuples.length) return '';

  const tuplesDir = `${outputDir}/tuples`;
  await ensureDir(tuplesDir);

  const filePath = `${tuplesDir}/index.ts`;
  const exports = tuples.map((t) => `export * from './${t.name.toLowerCase()}';`).join('\n');

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
export async function writeLiteralsIndex(outputDir: string, literals: LiteralMetadata[]): Promise<string> {
  if (!literals.length) return '';

  const literalsDir = `${outputDir}/literals`;
  await ensureDir(literalsDir);

  const filePath = `${literalsDir}/index.ts`;
  const exports = literals.map((l) => `export * from './${l.name.toLowerCase()}';`).join('\n');

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

/** Write enums/index.ts barrel file (enums only) */
export async function writeEnumsIndex(outputDir: string, enums: LiteralMetadata[]): Promise<string> {
  if (!enums.length) return '';

  const enumsDir = `${outputDir}/enums`;
  await ensureDir(enumsDir);

  const filePath = `${enumsDir}/index.ts`;
  const exports = enums.map((e) => `export * from './${e.name.toLowerCase()}';`).join('\n');

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
