/**
 * Registry generator - generates model registry code
 */

import type {
  FieldMetadata,
  LiteralMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectMetadata,
  ObjectRegistry,
  ResolvedLiteralVariant,
  TupleElementMetadata,
  TupleMetadata,
  TupleRegistry,
} from '../../types';

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

  // Include isSet when true
  if (field.isSet) {
    parts.push(`isSet: true`);
  }

  // Include sortOrder when present
  if (field.sortOrder) {
    parts.push(`sortOrder: '${field.sortOrder}'`);
  }

  // Include isFlexible when true
  if (field.isFlexible) {
    parts.push(`isFlexible: true`);
  }

  // Include isReadonly when true
  if (field.isReadonly) {
    parts.push(`isReadonly: true`);
  }

  // Include isNullable when true
  if (field.isNullable) {
    parts.push(`isNullable: true`);
  }

  // Include recordIdTypes when present (for typed Record IDs)
  if (field.recordIdTypes?.length) {
    parts.push(`recordIdTypes: [${field.recordIdTypes.map((t) => `'${t}'`).join(', ')}]`);
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

  // Include tupleInfo when present (with inline elements for runtime query building)
  if (field.tupleInfo) {
    if (field.tupleInfo.elements.length) {
      const inlineElements = field.tupleInfo.elements.map((e) => generateTupleElementMetadata(e)).join(', ');
      parts.push(`tupleInfo: { tupleName: '${field.tupleInfo.tupleName}', elements: [${inlineElements}] }`);
    } else {
      parts.push(`tupleInfo: { tupleName: '${field.tupleInfo.tupleName}', elements: [] }`);
    }
  }

  // Include literalInfo when present
  if (field.literalInfo) {
    if (field.literalInfo.variants.length) {
      const inlineVariants = field.literalInfo.variants.map((v) => generateLiteralVariantCode(v)).join(', ');
      parts.push(`literalInfo: { literalName: '${field.literalInfo.literalName}', variants: [${inlineVariants}] }`);
    } else {
      parts.push(`literalInfo: { literalName: '${field.literalInfo.literalName}', variants: [] }`);
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

/** Generate a single ResolvedLiteralVariant as TypeScript code */
export function generateLiteralVariantCode(variant: ResolvedLiteralVariant): string {
  switch (variant.kind) {
    case 'string':
      return `{ kind: 'string', value: '${variant.value}' }`;
    case 'int':
      return `{ kind: 'int', value: ${variant.value} }`;
    case 'float':
      return `{ kind: 'float', value: ${variant.value} }`;
    case 'bool':
      return `{ kind: 'bool', value: ${variant.value} }`;
    case 'broadType':
      return `{ kind: 'broadType', typeName: '${variant.typeName}' }`;
    case 'tupleRef': {
      const elements = variant.tupleInfo.elements.length
        ? variant.tupleInfo.elements.map((e) => generateTupleElementMetadata(e)).join(', ')
        : '';

      return `{ kind: 'tupleRef', tupleName: '${variant.tupleName}', tupleInfo: { tupleName: '${variant.tupleInfo.tupleName}', elements: [${elements}] } }`;
    }
    case 'objectRef': {
      const fields = variant.objectInfo.fields.length
        ? variant.objectInfo.fields.map((f) => generateFieldMetadata(f)).join(', ')
        : '';

      return `{ kind: 'objectRef', objectName: '${variant.objectName}', objectInfo: { objectName: '${variant.objectInfo.objectName}', fields: [${fields}] } }`;
    }
  }
}

/** Generate LiteralMetadata as TypeScript code */
export function generateLiteralMetadataCode(literal: LiteralMetadata): string {
  const variants = literal.variants.map((v) => `      ${generateLiteralVariantCode(v)}`).join(',\n');

  return `  ${literal.name}: {
    name: '${literal.name}',
    variants: [
${variants}
    ]
  }`;
}

/** Generate literal registry code */
export function generateLiteralRegistryCode(literals: LiteralMetadata[]): string {
  if (!literals.length) return '';

  const literalEntries = literals.map(generateLiteralMetadataCode).join(',\n');

  return `
import type { LiteralRegistry } from 'cerial';

export const literalRegistry: LiteralRegistry = {
${literalEntries}
};

export type { LiteralRegistry };
`;
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

/** Generate TupleElementMetadata as TypeScript code */
function generateTupleElementMetadata(element: TupleElementMetadata): string {
  const parts = [`index: ${element.index}`, `type: '${element.type}'`, `isOptional: ${element.isOptional}`];

  if (element.name) {
    parts.push(`name: '${element.name}'`);
  }

  if (element.isNullable) {
    parts.push(`isNullable: true`);
  }

  if (element.objectInfo) {
    if (element.objectInfo.fields.length) {
      const inlineFields = element.objectInfo.fields.map((f) => generateFieldMetadata(f)).join(', ');
      parts.push(`objectInfo: { objectName: '${element.objectInfo.objectName}', fields: [${inlineFields}] }`);
    } else {
      parts.push(`objectInfo: { objectName: '${element.objectInfo.objectName}', fields: [] }`);
    }
  }

  if (element.tupleInfo) {
    if (element.tupleInfo.elements.length) {
      const inlineElements = element.tupleInfo.elements.map((e) => generateTupleElementMetadata(e)).join(', ');
      parts.push(`tupleInfo: { tupleName: '${element.tupleInfo.tupleName}', elements: [${inlineElements}] }`);
    } else {
      parts.push(`tupleInfo: { tupleName: '${element.tupleInfo.tupleName}', elements: [] }`);
    }
  }

  return `{ ${parts.join(', ')} }`;
}

/** Generate TupleMetadata as TypeScript code */
function generateTupleMetadata(tuple: TupleMetadata): string {
  const elements = tuple.elements.map((e) => `      ${generateTupleElementMetadata(e)}`).join(',\n');

  return `  ${tuple.name}: {
    name: '${tuple.name}',
    elements: [
${elements}
    ]
  }`;
}

/** Generate tuple registry code */
export function generateTupleRegistryCode(tuples: TupleMetadata[]): string {
  if (!tuples.length) return '';

  const tupleEntries = tuples.map(generateTupleMetadata).join(',\n');

  return `
import type { TupleRegistry } from 'cerial';

export const tupleRegistry: TupleRegistry = {
${tupleEntries}
};

export type { TupleRegistry };
`;
}

/** Generate combined registry code (models + objects + tuples + literals) */
export function generateFullRegistryCode(
  models: ModelMetadata[],
  objects: ObjectMetadata[],
  tuples: TupleMetadata[],
  literals: LiteralMetadata[] = [],
): string {
  const modelEntries = models.map(generateModelMetadata).join(',\n');
  const importTypes = ['ModelRegistry'];
  if (objects.length) importTypes.push('ObjectRegistry');
  if (tuples.length) importTypes.push('TupleRegistry');
  if (literals.length) importTypes.push('LiteralRegistry');

  let code = `/**
 * Generated model registry
 * Do not edit manually
 */

import type { ${importTypes.join(', ')} } from 'cerial';

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

  if (tuples.length) {
    const tupleEntries = tuples.map(generateTupleMetadata).join(',\n');
    code += `
export const tupleRegistry: TupleRegistry = {
${tupleEntries}
};

export type { TupleRegistry };
`;
  }

  if (literals.length) {
    const literalEntries = literals.map(generateLiteralMetadataCode).join(',\n');
    code += `
export const literalRegistry: LiteralRegistry = {
${literalEntries}
};

export type { LiteralRegistry };
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
