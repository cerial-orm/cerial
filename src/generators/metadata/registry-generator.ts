/**
 * Registry generator - generates model registry code
 */

import type { ModelMetadata, ModelRegistry, FieldMetadata } from '../../types';

/** Generate FieldMetadata as TypeScript code */
function generateFieldMetadata(field: FieldMetadata): string {
  const parts = [
    `name: '${field.name}'`,
    `type: '${field.type}'`,
    `isId: ${field.isId}`,
    `isUnique: ${field.isUnique}`,
    `hasNowDefault: ${field.hasNowDefault}`,
    `isRequired: ${field.isRequired}`,
  ];

  if (field.defaultValue !== undefined) {
    const value =
      typeof field.defaultValue === 'string'
        ? `'${field.defaultValue}'`
        : JSON.stringify(field.defaultValue);
    parts.push(`defaultValue: ${value}`);
  }

  return `{ ${parts.join(', ')} }`;
}

/** Generate ModelMetadata as TypeScript code */
function generateModelMetadata(model: ModelMetadata): string {
  const fields = model.fields.map((f) => `      ${generateFieldMetadata(f)}`).join(',\n');

  return `  ${model.name}: {
    name: '${model.name}',
    tableName: '${model.tableName}',
    fields: [
${fields}
    ]
  }`;
}

/** Generate model registry code */
export function generateRegistryCode(models: ModelMetadata[]): string {
  const modelEntries = models.map(generateModelMetadata).join(',\n');

  return `/**
 * Generated model registry
 * Do not edit manually
 */

import type { ModelRegistry } from '@org/lib_backend_surreal-om';

export const modelRegistry: ModelRegistry = {
${modelEntries}
};

export type { ModelRegistry };
`;
}

/** Create ModelRegistry object from models */
export function createRegistry(models: ModelMetadata[]): ModelRegistry {
  const registry: ModelRegistry = {};

  for (const model of models) {
    registry[model.name] = model;
  }

  return registry;
}
