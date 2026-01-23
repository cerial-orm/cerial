/**
 * Model generator - generates model class with static methods
 */

import type { ModelMetadata } from '../../types';
import { generateMethodSignatures } from './method-generator';

/** Generate model interface (for type declarations) */
export function generateModelInterface(model: ModelMetadata): string {
  const methods = generateMethodSignatures(model);
  const methodsStr = methods.map((m) => `  ${m}`).join('\n\n');

  return `export interface ${model.name}Model {
${methodsStr}
}`;
}

/** Generate model type declarations for a file */
export function generateModelTypes(models: ModelMetadata[]): string {
  return models.map(generateModelInterface).join('\n\n');
}

/** Generate database client interface with all models */
export function generateDbClientInterface(models: ModelMetadata[]): string {
  const modelProps = models.map((m) => `  ${m.name}: ${m.name}Model;`).join('\n');

  return `export interface DbClient {
${modelProps}
}`;
}
