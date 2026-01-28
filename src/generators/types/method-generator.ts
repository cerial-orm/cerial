/**
 * Method generator - generates query method signatures
 */

import type { ModelMetadata } from '../../types';
import { getUniqueFields } from '../../parser/model-metadata';
import { schemaTypeToTsType } from '../../utils/type-utils';

/** Generate findOne method signature */
export function generateFindOneMethod(model: ModelMetadata): string {
  return `findOne(options?: {
    where?: ${model.name}Where;
    select?: ${model.name}Select;
  }): Promise<${model.name} | null>;`;
}

/** Generate findMany method signature */
export function generateFindManyMethod(model: ModelMetadata): string {
  return `findMany(options?: {
    where?: ${model.name}Where;
    select?: ${model.name}Select;
    orderBy?: ${model.name}OrderBy;
    limit?: number;
    offset?: number;
  }): Promise<${model.name}[]>;`;
}

/** Generate FindUniqueWhere type for a model */
export function generateFindUniqueWhereType(model: ModelMetadata): string {
  // Get ID field
  const idField = model.fields.find((f) => f.isId);

  // Get unique fields (excluding ID since it's handled separately)
  const uniqueFields = getUniqueFields(model).filter((f) => !f.isId);

  // Get all unique field names
  const allUniqueFieldNames = [idField?.name, ...uniqueFields.map((f) => f.name)].filter(Boolean);

  // If no unique fields at all, fallback to old behavior
  if (allUniqueFieldNames.length === 0) {
    return '';
  }

  // Build union type: one variant per unique field (as required field)
  // Each variant allows other unique fields as optional direct values
  const variants: string[] = [];

  // Helper to build optional unique fields type (excluding the required one)
  const buildOptionalUniqueFields = (excludeField: string): string => {
    const otherUniqueFields = allUniqueFieldNames.filter((n) => n !== excludeField);
    if (otherUniqueFields.length === 0) return '';

    const optionalFields = otherUniqueFields
      .map((fieldName) => {
        const field = model.fields.find((f) => f.name === fieldName);
        const tsType = field?.isId ? 'string' : schemaTypeToTsType(field!.type);
        return `${fieldName}?: ${tsType}`;
      })
      .join('; ');

    return ` & { ${optionalFields} }`;
  };

  // ID variant: { id: string } & { email?: string } & Omit<UserWhere, 'id' | 'email'>
  if (idField) {
    const optionalUnique = buildOptionalUniqueFields(idField.name);
    variants.push(
      `({ ${idField.name}: string }${optionalUnique} & Omit<${model.name}Where, ${allUniqueFieldNames.map((n) => `'${n}'`).join(' | ')}>)`,
    );
  }

  // Unique field variants: { email: string } & { id?: string } & Omit<UserWhere, 'id' | 'email'>
  for (const field of uniqueFields) {
    const tsType = schemaTypeToTsType(field.type);
    const optionalUnique = buildOptionalUniqueFields(field.name);
    variants.push(
      `({ ${field.name}: ${tsType} }${optionalUnique} & Omit<${model.name}Where, ${allUniqueFieldNames.map((n) => `'${n}'`).join(' | ')}>)`,
    );
  }

  return `export type ${model.name}FindUniqueWhere = ${variants.join(' | ')};`;
}

/** Generate findUnique method signature */
export function generateFindUniqueMethod(model: ModelMetadata): string {
  return `findUnique(options: {
    where: ${model.name}FindUniqueWhere;
    select?: ${model.name}Select;
  }): Promise<${model.name} | null>;`;
}

/** Generate create method signature */
export function generateCreateMethod(model: ModelMetadata): string {
  return `create(options: {
    data: ${model.name}Create;
    select?: ${model.name}Select;
  }): Promise<${model.name}>;`;
}

/** Generate updateMany method signature */
export function generateUpdateMethod(model: ModelMetadata): string {
  return `updateMany(options: {
    where: ${model.name}Where;
    data: ${model.name}Update;
    select?: ${model.name}Select;
  }): Promise<${model.name}[]>;`;
}

/** Generate deleteMany method signature */
export function generateDeleteManyMethod(model: ModelMetadata): string {
  return `deleteMany(options: {
    where: ${model.name}Where;
  }): Promise<number>;`;
}

/** Generate count method signature */
export function generateCountMethod(model: ModelMetadata): string {
  return `count(where?: ${model.name}Where): Promise<number>;`;
}

/** Generate exists method signature */
export function generateExistsMethod(model: ModelMetadata): string {
  return `exists(where: ${model.name}Where): Promise<boolean>;`;
}

/** Generate all method signatures for a model */
export function generateMethodSignatures(model: ModelMetadata): string[] {
  return [
    generateFindOneMethod(model),
    generateFindManyMethod(model),
    generateFindUniqueMethod(model),
    generateCreateMethod(model),
    generateUpdateMethod(model),
    generateDeleteManyMethod(model),
    generateCountMethod(model),
    generateExistsMethod(model),
  ];
}
