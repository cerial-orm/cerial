/**
 * Interface generator - generates TypeScript interfaces for models
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

/**
 * Generate TypeScript type for a field
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
  const tsType = schemaTypeToTsType(field.type);

  // Handle array types (String[] -> string[], Int[] -> number[], Date[] -> Date[], Record[] -> string[])
  if (field.isArray) {
    return `${tsType}[]`;
  }

  // Required fields: just the type
  if (field.isRequired) {
    return tsType;
  }

  // Optional fields: user can pass value, null, or undefined
  // The difference between ? and ?+@default(null) is runtime behavior, not TS type
  return `${tsType} | null`;
}

/** Generate a single field definition */
export function generateFieldDefinition(field: FieldMetadata): string {
  // Skip Relation fields (virtual, not stored in database)
  if (field.type === 'relation') {
    return '';
  }

  // Fields with @id decorator are always required and always string type
  if (field.isId) {
    return `${field.name}: string;`;
  }

  // Handle array types - always required (defaults to empty array)
  if (field.isArray) {
    const tsType = schemaTypeToTsType(field.type);
    return `${field.name}: ${tsType}[];`;
  }

  const optional = field.isRequired ? '' : '?';
  const type = generateFieldType(field);
  return `${field.name}${optional}: ${type};`;
}

/** Generate model interface (base interface without relations) */
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

/** Generate interfaces for all models */
export function generateInterfaces(models: ModelMetadata[]): string {
  return models.map(generateInterface).join('\n\n');
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
