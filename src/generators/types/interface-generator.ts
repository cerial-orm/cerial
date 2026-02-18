/**
 * Interface generator - generates TypeScript interfaces for models
 *
 * Generates two types for each model:
 * - Output interface (User): CerialId for Record fields (what you get back from queries)
 * - Input interface (UserInput): RecordIdInput for Record fields (what you can pass in)
 *
 * Object interface generation lives in ./objects/interface-generator.ts
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry, ObjectRegistry, TupleRegistry } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';
import { getLiteralTypeName } from './enums';
import { getGeometryInputType, getGeometryOutputType } from './geometry-helpers';
import { literalNeedsInputType } from './literals';
import {
  getIdCreateInputType,
  getRecordInputType,
  getRecordOutputType,
  isIdOptionalInCreate,
} from './record-type-helpers';

/**
 * Get the TypeScript output type for a field
 * For Record fields, uses CerialId instead of string
 * For Object fields, uses the object's interface name
 */
function getOutputType(field: FieldMetadata, tupleRegistry?: TupleRegistry, objectRegistry?: ObjectRegistry): string {
  if (field.type === 'record') return getRecordOutputType(field, tupleRegistry, objectRegistry);
  if (field.type === 'uuid') return 'CerialUuid';
  if (field.type === 'duration') return 'CerialDuration';
  if (field.type === 'decimal') return 'CerialDecimal';
  if (field.type === 'bytes') return 'CerialBytes';
  if (field.type === 'any') return 'CerialAny';
  if (field.type === 'geometry') return getGeometryOutputType(field);
  if (field.type === 'object' && field.objectInfo) return field.objectInfo.objectName;
  if (field.type === 'tuple' && field.tupleInfo) return field.tupleInfo.tupleName;
  if (field.type === 'literal' && field.literalInfo) return getLiteralTypeName(field.literalInfo);

  return schemaTypeToTsType(field.type);
}

/**
 * Get the TypeScript input type for a field
 * For Record fields, uses RecordIdInput instead of CerialId
 * For Object fields, uses the object's Input interface name
 */
function getInputType(field: FieldMetadata, tupleRegistry?: TupleRegistry, objectRegistry?: ObjectRegistry): string {
  if (field.type === 'record') return getRecordInputType(field, tupleRegistry, objectRegistry);
  if (field.type === 'uuid') return 'CerialUuidInput';
  if (field.type === 'duration') return 'CerialDurationInput';
  if (field.type === 'decimal') return 'CerialDecimalInput';
  if (field.type === 'bytes') return 'CerialBytesInput';
  if (field.type === 'any') return 'CerialAny';
  if (field.type === 'geometry') return getGeometryInputType(field);
  if (field.type === 'object' && field.objectInfo) return `${field.objectInfo.objectName}Input`;
  if (field.type === 'tuple' && field.tupleInfo) return `${field.tupleInfo.tupleName}Input`;
  if (field.type === 'literal' && field.literalInfo) {
    const lit = field.literalInfo;
    // Enums are string-only — no separate Input type needed
    if (lit.isEnum) return getLiteralTypeName(lit);
    if (literalNeedsInputType({ name: lit.literalName, variants: lit.variants })) return `${lit.literalName}Input`;

    return lit.literalName;
  }

  return schemaTypeToTsType(field.type);
}

/**
 * Generate TypeScript type for a field (output type - what you get back from queries)
 *
 * NONE vs null semantics:
 * - `field String?` → `field?: string` (NONE only — field absent or string value)
 * - `field String @nullable` → `field: string | null` (null only — required but can be null)
 * - `field String? @nullable` → `field?: string | null` (both NONE and null)
 */
export function generateFieldType(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const tsType = getOutputType(field, tupleRegistry, objectRegistry);

  // Handle array types (String[] -> string[], Int[] -> number[], Date[] -> Date[], Record[] -> CerialId[])
  if (field.isArray) {
    if (field.isSet) return `CerialSet<${tsType}>`;

    return `${tsType}[]`;
  }

  // @nullable adds | null to the type
  if (field.isNullable) {
    return `${tsType} | null`;
  }

  // Without @nullable, the type is just the base type (optional adds ? on the property, not | null)
  return tsType;
}

/** Wrap a type with Record<string, any> intersection for @flexible fields */
function wrapFlexible(type: string, field: FieldMetadata): string {
  if (!field.isFlexible) return type;

  return `${type} & Record<string, any>`;
}

/** Generate a single field definition (output type) */
export function generateFieldDefinition(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  // Skip Relation fields (virtual, not stored in database)
  if (field.type === 'relation') {
    return '';
  }

  if (field.isId) {
    return `${field.name}: ${getRecordOutputType(field, tupleRegistry, objectRegistry)};`;
  }

  // Handle array types - always required (defaults to empty array)
  if (field.isArray) {
    const tsType = getOutputType(field, tupleRegistry, objectRegistry);
    if (field.isFlexible) {
      return `${field.name}: (${tsType} & Record<string, any>)[];`;
    }
    if (field.isSet) return `${field.name}: CerialSet<${tsType}>;`;

    return `${field.name}: ${tsType}[];`;
  }

  const optional = field.isRequired ? '' : '?';
  const type = generateFieldType(field, tupleRegistry, objectRegistry);
  const wrappedType = wrapFlexible(type, field);

  return `${field.name}${optional}: ${wrappedType};`;
}

/**
 * Generate TypeScript input type for a field
 * Uses RecordIdInput for Record fields
 */
export function generateInputFieldType(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const tsType = getInputType(field, tupleRegistry, objectRegistry);

  // Handle array types
  if (field.isArray) {
    return `${tsType}[]`;
  }

  // @nullable adds | null to the type
  if (field.isNullable) {
    return `${tsType} | null`;
  }

  // Without @nullable, the type is just the base type
  return tsType;
}

/** Generate a single input field definition */
export function generateInputFieldDefinition(
  field: FieldMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  // Skip Relation fields (virtual, not stored in database)
  if (field.type === 'relation') {
    return '';
  }

  if (field.isId) {
    const inputType = getIdCreateInputType(field, tupleRegistry, objectRegistry);
    const optional = isIdOptionalInCreate(field.recordIdTypes) ? '?' : '';

    return `${field.name}${optional}: ${inputType};`;
  }

  // Handle array types - always required (defaults to empty array)
  if (field.isArray) {
    const tsType = getInputType(field, tupleRegistry, objectRegistry);
    if (field.isFlexible) {
      return `${field.name}: (${tsType} & Record<string, any>)[];`;
    }

    return `${field.name}: ${tsType}[];`;
  }

  const optional = field.isRequired ? '' : '?';
  const type = generateInputFieldType(field, tupleRegistry, objectRegistry);
  const wrappedType = wrapFlexible(type, field);

  return `${field.name}${optional}: ${wrappedType};`;
}

/** Generate model interface (base interface without relations - output type) */
export function generateInterface(
  model: ModelMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const fields = model.fields
    .map((f) => generateFieldDefinition(f, tupleRegistry, objectRegistry))
    .filter((line) => line !== '') // Filter out empty lines from Relation fields
    .map((line) => `  ${line}`)
    .join('\n');

  return `export interface ${model.name} {
${fields}
}`;
}

/** Generate model input interface (for create/update - accepts RecordIdInput) */
export function generateInputInterface(
  model: ModelMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const fields = model.fields
    .map((f) => generateInputFieldDefinition(f, tupleRegistry, objectRegistry))
    .filter((line) => line !== '') // Filter out empty lines from Relation fields
    .map((line) => `  ${line}`)
    .join('\n');

  return `export interface ${model.name}Input {
${fields}
}`;
}

/** Generate interfaces for all models (both output and input) */
export function generateInterfaces(
  models: ModelMetadata[],
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): string {
  const interfaces: string[] = [];
  for (const model of models) {
    interfaces.push(generateInterface(model, tupleRegistry, objectRegistry));
    interfaces.push(generateInputInterface(model, tupleRegistry, objectRegistry));
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
        // Reverse relations are always optional (NONE) and nullable (the related record may not exist)
        return `  ${field.name}?: ${targetModel} | null;`;
      }

      // Single relation (one-to-one forward)
      // Optional (?) means the storage field can be NONE (absent) → field?: T
      // @nullable means the storage field can be null → T | null
      const isOptional = !storageField || !storageField.isRequired;
      const isNullable = storageField?.isNullable || false;
      const nullSuffix = isNullable ? ' | null' : '';

      return `  ${field.name}${isOptional ? '?' : ''}: ${targetModel}${nullSuffix};`;
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
