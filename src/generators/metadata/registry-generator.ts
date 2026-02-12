/**
 * Registry generator - generates model registry code
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry, ObjectMetadata, ObjectRegistry } from '../../types';

/** Generate FieldMetadata as TypeScript code */
function generateFieldMetadata(field: FieldMetadata): string {
  const parts = [
    `name: '${field.name}'`,
    `type: '${field.type}'`,
    `isId: ${field.isId}`,
    `isUnique: ${field.isUnique}`,
    `isIndexed: ${field.isIndexed}`,
    `timestampDecorator: ${field.timestampDecorator ? `'${field.timestampDecorator}'` : 'undefined'}`,
    `isRequired: ${field.isRequired}`,
  ];

  if (field.defaultValue !== undefined) {
    const value =
      typeof field.defaultValue === 'string' ? `'${field.defaultValue}'` : JSON.stringify(field.defaultValue);
    parts.push(`defaultValue: ${value}`);
  }

  if (field.defaultAlwaysValue !== undefined) {
    const value =
      typeof field.defaultAlwaysValue === 'string'
        ? `'${field.defaultAlwaysValue}'`
        : JSON.stringify(field.defaultAlwaysValue);
    parts.push(`defaultAlwaysValue: ${value}`);
  }

  // Include isArray when true
  if (field.isArray) {
    parts.push(`isArray: true`);
  }

  // Include isDistinct when true
  if (field.isDistinct) {
    parts.push(`isDistinct: true`);
  }

  // Include sortOrder when present
  if (field.sortOrder) {
    parts.push(`sortOrder: '${field.sortOrder}'`);
  }

  // Include objectInfo when present (with inline fields for runtime query building)
  if (field.objectInfo) {
    if (field.objectInfo.fields.length) {
      const inlineFields = field.objectInfo.fields.map((f) => generateFieldMetadata(f)).join(', ');
      parts.push(`objectInfo: { objectName: '${field.objectInfo.objectName}', fields: [${inlineFields}] }`);
    } else {
      parts.push(`objectInfo: { objectName: '${field.objectInfo.objectName}', fields: [] }`);
    }
  }

  // Include relationInfo when present
  if (field.relationInfo) {
    const relParts = [
      `targetModel: '${field.relationInfo.targetModel}'`,
      `targetTable: '${field.relationInfo.targetTable}'`,
      `isReverse: ${field.relationInfo.isReverse}`,
    ];
    if (field.relationInfo.fieldRef) {
      relParts.push(`fieldRef: '${field.relationInfo.fieldRef}'`);
    }
    if (field.relationInfo.onDelete) {
      relParts.push(`onDelete: '${field.relationInfo.onDelete}'`);
    }
    if (field.relationInfo.key) {
      relParts.push(`key: '${field.relationInfo.key}'`);
    }
    parts.push(`relationInfo: { ${relParts.join(', ')} }`);
  }

  return `{ ${parts.join(', ')} }`;
}

/** Generate CompositeIndex as TypeScript code */
function generateCompositeDirective(directive: { kind: string; name: string; fields: string[] }): string {
  const fields = directive.fields.map((f) => `'${f}'`).join(', ');

  return `{ kind: '${directive.kind}', name: '${directive.name}', fields: [${fields}] }`;
}

/** Generate ModelMetadata as TypeScript code */
function generateModelMetadata(model: ModelMetadata): string {
  const fields = model.fields.map((f) => `      ${generateFieldMetadata(f)}`).join(',\n');
  const directives = model.compositeDirectives ?? [];
  const composites = directives.length
    ? `\n      ${directives.map(generateCompositeDirective).join(',\n      ')}\n    `
    : '';

  return `  ${model.name}: {
    name: '${model.name}',
    tableName: '${model.tableName}',
    fields: [
${fields}
    ],
    compositeDirectives: [${composites}]
  }`;
}

/** Generate model registry code */
export function generateRegistryCode(models: ModelMetadata[]): string {
  const modelEntries = models.map(generateModelMetadata).join(',\n');

  return `/**
 * Generated model registry
 * Do not edit manually
 */

import type { ModelRegistry } from 'cerial';

export const modelRegistry: ModelRegistry = {
${modelEntries}
};

export type { ModelRegistry };
`;
}

/** Generate ObjectMetadata as TypeScript code */
function generateObjectMetadata(object: ObjectMetadata): string {
  const fields = object.fields.map((f) => `      ${generateFieldMetadata(f)}`).join(',\n');

  return `  ${object.name}: {
    name: '${object.name}',
    fields: [
${fields}
    ]
  }`;
}

/** Generate object registry code */
export function generateObjectRegistryCode(objects: ObjectMetadata[]): string {
  if (!objects.length) return '';

  const objectEntries = objects.map(generateObjectMetadata).join(',\n');

  return `
import type { ObjectRegistry } from 'cerial';

export const objectRegistry: ObjectRegistry = {
${objectEntries}
};

export type { ObjectRegistry };
`;
}

/** Generate combined registry code (models + objects) */
export function generateCombinedRegistryCode(models: ModelMetadata[], objects: ObjectMetadata[]): string {
  const modelEntries = models.map(generateModelMetadata).join(',\n');

  let code = `/**
 * Generated model registry
 * Do not edit manually
 */

import type { ModelRegistry${objects.length ? ', ObjectRegistry' : ''} } from 'cerial';

export const modelRegistry: ModelRegistry = {
${modelEntries}
};

export type { ModelRegistry };
`;

  if (objects.length) {
    const objectEntries = objects.map(generateObjectMetadata).join(',\n');
    code += `
export const objectRegistry: ObjectRegistry = {
${objectEntries}
};

export type { ObjectRegistry };
`;
  }

  return code;
}

/** Create ModelRegistry object from models */
export function createRegistry(models: ModelMetadata[]): ModelRegistry {
  const registry: ModelRegistry = {};

  for (const model of models) {
    registry[model.name] = model;
  }

  return registry;
}

/** Create ObjectRegistry object from objects */
export function createObjectRegistry(objects: ObjectMetadata[]): ObjectRegistry {
  const registry: ObjectRegistry = {};

  for (const object of objects) {
    registry[object.name] = object;
  }

  return registry;
}
