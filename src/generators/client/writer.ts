/**
 * Client writer - writes generated client files
 */

import type { ModelMetadata } from '../../types';
import { generateClientTemplate } from './template';
import { generateConnectionExports, generateDbProxyInterface } from './connection-template';
import { generateInterfaces, generateWhereTypes, generateAllDerivedTypes, generateModelTypes, generateDbClientInterface } from '../types';
import { mkdir } from 'node:fs/promises';

/** Ensure directory exists */
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Write client main file */
export async function writeClientMain(outputDir: string): Promise<string> {
  await ensureDir(outputDir);

  const filePath = `${outputDir}/client.ts`;
  const content = `/**
 * Generated database client
 * Do not edit manually
 */

${generateClientTemplate()}

${generateConnectionExports()}
`;

  await Bun.write(filePath, content);

  return filePath;
}

/** Write model type file */
export async function writeModelTypes(
  outputDir: string,
  model: ModelMetadata,
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/${model.name.toLowerCase()}.ts`;

  // Generate all type content for this model
  const interfaceCode = generateInterfaces([model]);
  const whereCode = generateWhereTypes([model]);
  const derivedCode = generateAllDerivedTypes([model]);
  const modelCode = generateModelTypes([model]);

  const content = `/**
 * Generated types for ${model.name}
 * Do not edit manually
 */

${interfaceCode}

${whereCode}

${derivedCode}

${modelCode}
`;

  await Bun.write(filePath, content);

  return filePath;
}

/** Write models index file */
export async function writeModelsIndex(
  outputDir: string,
  models: ModelMetadata[],
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/index.ts`;
  const exports = models
    .map((m) => `export * from './${m.name.toLowerCase()}';`)
    .join('\n');

  const content = `/**
 * Generated model exports
 * Do not edit manually
 */

${exports}
`;

  await Bun.write(filePath, content);

  return filePath;
}

/** Write main client index file */
export async function writeClientIndex(
  outputDir: string,
  models: ModelMetadata[],
): Promise<string> {
  await ensureDir(outputDir);

  const filePath = `${outputDir}/index.ts`;

  const modelExports = models.map((m) => m.name).join(',\n  ');
  const createExports = models.map((m) => `${m.name}Create`).join(',\n  ');
  const updateExports = models.map((m) => `${m.name}Update`).join(',\n  ');
  const whereExports = models.map((m) => `${m.name}Where`).join(',\n  ');
  const selectExports = models.map((m) => `${m.name}Select`).join(',\n  ');
  const orderByExports = models.map((m) => `${m.name}OrderBy`).join(',\n  ');
  const modelTypeExports = models.map((m) => `${m.name}Model`).join(',\n  ');

  const content = `/**
 * Generated database client
 * Do not edit manually
 */

// Model interfaces
export type {
  ${modelExports},
} from './models';

// Create types
export type {
  ${createExports},
} from './models';

// Update types
export type {
  ${updateExports},
} from './models';

// Where types
export type {
  ${whereExports},
} from './models';

// Select types
export type {
  ${selectExports},
} from './models';

// OrderBy types
export type {
  ${orderByExports},
} from './models';

// Model types
export type {
  ${modelTypeExports},
} from './models';

// Client exports
export { $connect, $disconnect, $useConnection, db } from './client';
export type { ConnectionConfig } from './client';

// Registry
export { modelRegistry } from './internal';
`;

  await Bun.write(filePath, content);

  return filePath;
}

/** Write all client files */
export async function writeClient(
  outputDir: string,
  models: ModelMetadata[],
): Promise<string[]> {
  const files: string[] = [];

  // Write client main
  files.push(await writeClientMain(outputDir));

  // Write model types
  for (const model of models) {
    files.push(await writeModelTypes(outputDir, model));
  }

  // Write models index
  files.push(await writeModelsIndex(outputDir, models));

  // Write main index
  files.push(await writeClientIndex(outputDir, models));

  return files;
}
