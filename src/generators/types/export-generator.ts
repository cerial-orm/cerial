/**
 * Export generator - generates index.ts exports
 */

import type { ModelMetadata } from '../../types';

/** Generate model exports */
export function generateModelExports(models: ModelMetadata[]): string {
  const exports = models.map((m) => `export * from './${m.name.toLowerCase()}';`);
  return exports.join('\n');
}

/** Generate index.ts content for models directory */
export function generateModelsIndex(models: ModelMetadata[]): string {
  return `/**
 * Generated model exports
 * Do not edit manually
 */

${generateModelExports(models)}
`;
}

/** Generate internal index.ts content */
export function generateInternalIndex(): string {
  return `/**
 * Generated internal exports
 * Do not edit manually
 */

export { modelRegistry } from './model-registry';
export type { ModelRegistry } from './model-registry';
`;
}

/** Generate main client index.ts content */
export function generateClientIndex(models: ModelMetadata[]): string {
  const modelImports = models.map((m) => `  ${m.name},`).join('\n');

  return `/**
 * Generated database client
 * Do not edit manually
 */

export {
${modelImports}
} from './models';

export type {
${models.map((m) => `  ${m.name}Create,`).join('\n')}
${models.map((m) => `  ${m.name}Update,`).join('\n')}
${models.map((m) => `  ${m.name}Where,`).join('\n')}
${models.map((m) => `  ${m.name}Select,`).join('\n')}
${models.map((m) => `  ${m.name}OrderBy,`).join('\n')}
} from './models';

export { $connect, $disconnect, db } from './client';
export type { DbClient } from './client';
`;
}
