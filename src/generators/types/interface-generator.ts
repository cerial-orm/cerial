/**
 * Interface generator - generates TypeScript interfaces for models
 *
 * Generates two types for each model:
 * - Output interface (User): CerialId for Record fields (what you get back from queries)
 * - Input interface (UserInput): RecordIdInput for Record fields (what you can pass in)
 *
 * Object interface generation lives in ./objects/interface-generator.ts
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

/**
 * Get the TypeScript output type for a field
 * For Record fields, uses CerialId instead of string
 * For Object fields, uses the object's interface name
 */
function getOutputType(field: FieldMetadata): string {
  if (field.type === 'record') return 'CerialId';
  if (field.type === 'object' && field.objectInfo) return field.objectInfo.objectName;

  return schemaTypeToTsType(field.type);
}

/**
 * Get the TypeScript input type for a field
 * For Record fields, uses RecordIdInput instead of CerialId
 * For Object fields, uses the object's Input interface name
 */
function getInputType(field: FieldMetadata): string {
  if (field.type === 'record') return 'RecordIdInput';
  if (field.type === 'object' && field.objectInfo) return `${field.objectInfo.objectName}Input`;

  return schemaTypeToTsType(field.type);
}

/**
 * Generate TypeScript type for a field (output type - what you get back from queries)
 *
 * NONE vs null semantics (both have same TS type, different runtime behavior):
 * - `field String?` → `field?: string | null`
 *   - undefined → NONE (field absent in DB)
 *   - null → null stored in DB
 * - `field String? @default(null)` → `field?: string | null`
 *   - undefined → null stored (default applied)
 *   - null → null stored in DB
 */
export function generateFieldType(field: FieldMetadata): string {
  const tsType = getOutputType(field);

  // Handle array types (String[] -> string[], Int[] -> number[], Date[] -> Date[], Record[] -> CerialId[])
  if (field.isArray) {
    return `${tsType}[]`;
  }

  // Required fields: just the type
  if (field.isRequired) {
    return tsType;
  }

  // Optional fields: user can pass value or undefined
  // The difference between ? and ?+@default(null) is runtime behavior, not TS type
  // Object fields don't support null — only NONE (absent) or a valid object value
  if (field.type === 'object') return tsType;

  return `${tsType} | null`;
}

/** Wrap a type with Record<string, any> intersection for @flexible fields */
function wrapFlexible(type: string, field: FieldMetadata): string {
  if (!field.isFlexible) return type;

  return `${type} & Record<string, any>`;
}

/** Generate a single field definition (output type) */
export function generateFieldDefinition(field: FieldMetadata): string {
  // Skip Relation fields (virtual, not stored in database)
  if (field.type === 'relation') {
    return '';
  }

  // Fields with @id decorator are always required and CerialId type
  if (field.isId) {
    return `${field.name}: CerialId;`;
  }

  // Handle array types - always required (defaults to empty array)
  if (field.isArray) {
    const tsType = getOutputType(field);
    if (field.isFlexible) {
      return `${field.name}: (${tsType} & Record<string, any>)[];`;
    }

    return `${field.name}: ${tsType}[];`;
  }

  const optional = field.isRequired ? '' : '?';
  const type = generateFieldType(field);
  const wrappedType = wrapFlexible(type, field);

  return `${field.name}${optional}: ${wrappedType};`;
}

/**
 * Generate TypeScript input type for a field
 * Uses RecordIdInput for Record fields
 */
export function generateInputFieldType(field: FieldMetadata): string {
  const tsType = getInputType(field);

  // Handle array types
  if (field.isArray) {
    return `${tsType}[]`;
  }

  // Required fields: just the type
  if (field.isRequired) {
    return tsType;
  }

  // Optional fields
  // Object fields don't support null — only NONE (absent) or a valid object value
  if (field.type === 'object') return tsType;

  return `${tsType} | null`;
}

/** Generate a single input field definition */
export function generateInputFieldDefinition(field: FieldMetadata): string {
  // Skip Relation fields (virtual, not stored in database)
  if (field.type === 'relation') {
    return '';
  }

  // Fields with @id decorator are optional in input (can be auto-generated)
  // but when provided, accept RecordIdInput
  if (field.isId) {
    return `${field.name}?: RecordIdInput;`;
  }

  // Handle array types - always required (defaults to empty array)
  if (field.isArray) {
    const tsType = getInputType(field);
    if (field.isFlexible) {
      return `${field.name}: (${tsType} & Record<string, any>)[];`;
    }

    return `${field.name}: ${tsType}[];`;
  }

  const optional = field.isRequired ? '' : '?';
  const type = generateInputFieldType(field);
  const wrappedType = wrapFlexible(type, field);

  return `${field.name}${optional}: ${wrappedType};`;
}

/** Generate model interface (base interface without relations - output type) */
export function generateInterface(model: ModelMetadata): string {
  const fields = model.fields
    .map((f) => generateFieldDefinition(f))
    .filter((line) => line !== '') // Filter out empty lines from Relation fields
    .map((line) => `  ${line}`)
    .join('\n');

  return `export interface ${model.name} {
${fields}
}`;
}

/** Generate model input interface (for create/update - accepts RecordIdInput) */
export function generateInputInterface(model: ModelMetadata): string {
  const fields = model.fields
    .map((f) => generateInputFieldDefinition(f))
    .filter((line) => line !== '') // Filter out empty lines from Relation fields
    .map((line) => `  ${line}`)
    .join('\n');

  return `export interface ${model.name}Input {
${fields}
}`;
}

/** Generate interfaces for all models (both output and input) */
export function generateInterfaces(models: ModelMetadata[]): string {
  const interfaces: string[] = [];
  for (const model of models) {
    interfaces.push(generateInterface(model));
    interfaces.push(generateInputInterface(model));
  }

  return interfaces.join('\n\n');
}

/** Generate WithRelations interface for populated relations */
export function generateWithRelationsInterface(model: ModelMetadata, _registry: ModelRegistry): string {
  const relationFields = model.fields.filter((f) => f.type === 'relation' && f.relationInfo);

  if (relationFields.length === 0) {
    return ''; // No relations to include
  }

  // Find Record fields that have paired Relations (to omit from base)
  const recordFieldsWithRelations = model.fields
    .filter((f) => f.type === 'record')
    .filter((recordField) =>
      model.fields.some((rel) => rel.type === 'relation' && rel.relationInfo?.fieldRef === recordField.name),
    )
    .map((f) => f.name);

  const omitFields =
    recordFieldsWithRelations.length > 0
      ? `Omit<${model.name}, '${recordFieldsWithRelations.join("' | '")}'>`
      : model.name;

  const relationFieldDefs = relationFields
    .map((field) => {
      if (!field.relationInfo) return '';
      const targetModel = field.relationInfo.targetModel;

      // Find if the storage field is an array (one-to-many)
      const storageField = field.relationInfo.fieldRef
        ? model.fields.find((f) => f.name === field.relationInfo!.fieldRef)
        : null;

      const isArrayRelation = storageField?.isArray || false;

      if (isArrayRelation) {
        return `  ${field.name}: ${targetModel}[];`;
      }

      // For reverse relations, check if it's one-to-one or one-to-many
      if (field.relationInfo.isReverse) {
        // Reverse relation - could be single or array depending on source
        // For now, assume single for reverse relations (one-to-one from the other side)
        return `  ${field.name}?: ${targetModel} | null;`;
      }

      // Single relation (one-to-one forward)
      const optional = !storageField || !storageField.isRequired;
      return `  ${field.name}${optional ? '?' : ''}: ${targetModel}${optional ? ' | null' : ''};`;
    })
    .filter((line) => line !== '')
    .join('\n');

  return `export interface ${model.name}WithRelations extends ${omitFields} {
${relationFieldDefs}
}`;
}

/** Generate all WithRelations interfaces */
export function generateAllWithRelationsInterfaces(models: ModelMetadata[], registry: ModelRegistry): string {
  return models
    .map((model) => generateWithRelationsInterface(model, registry))
    .filter((iface) => iface !== '')
    .join('\n\n');
}

// Object interface generation has been moved to ./objects/interface-generator.ts
export {
  generateObjectCreateInputInterface,
  generateObjectInputInterface,
  generateObjectInterface,
  generateObjectInterfaces,
  objectHasDefaultOrTimestamp,
  objectHasRecordFields,
} from './objects/interface-generator';
