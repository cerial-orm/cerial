/**
 * Interface generator - generates TypeScript interfaces for models
 */

import type { ModelMetadata, FieldMetadata } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';
import { indent } from '../../utils/string-utils';

/** Generate TypeScript type for a field */
export function generateFieldType(field: FieldMetadata): string {
  const tsType = schemaTypeToTsType(field.type);
  return field.isRequired ? tsType : `${tsType} | null`;
}

/** Generate a single field definition */
export function generateFieldDefinition(field: FieldMetadata): string {
  // Fields with @id decorator are always required and always string type
  if (field.isId) {
    return `${field.name}: string;`;
  }
  const optional = field.isRequired ? '' : '?';
  const type = generateFieldType(field);
  return `${field.name}${optional}: ${type};`;
}

/** Generate model interface */
export function generateInterface(model: ModelMetadata): string {
  const fields = model.fields.map((f) => generateFieldDefinition(f)).map((line) => `  ${line}`).join('\n');

  return `export interface ${model.name} {
${fields}
}`;
}

/** Generate interfaces for all models */
export function generateInterfaces(models: ModelMetadata[]): string {
  return models.map(generateInterface).join('\n\n');
}
