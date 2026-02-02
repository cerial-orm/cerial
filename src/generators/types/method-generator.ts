/**
 * Method generator - generates query method signatures
 */

import { getUniqueFields } from '../../parser/model-metadata';
import type { ModelMetadata } from '../../types';
import { schemaTypeToTsType } from '../../utils/type-utils';

/** Check if model has relation fields */
function hasRelations(model: ModelMetadata): boolean {
  return model.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Generate findOne method signature with full type inference */
export function generateFindOneMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    // No relations - simpler generic signature
    return `findOne<S extends ${model.name}Select | undefined = undefined>(options?: {
    where?: ${model.name}Where;
    select?: S;
  }): Promise<Get${model.name}Payload<S> | null>;`;
  }

  // With relations - full generic signature
  return `findOne<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
  >(options?: {
    where?: ${model.name}Where;
    select?: S;
    include?: I;
  }): Promise<Get${model.name}Payload<S, I> | null>;`;
}

/** Generate findMany method signature with full type inference */
export function generateFindManyMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    // No relations - simpler generic signature
    return `findMany<S extends ${model.name}Select | undefined = undefined>(options?: {
    where?: ${model.name}Where;
    select?: S;
    orderBy?: ${model.name}OrderBy;
    limit?: number;
    offset?: number;
  }): Promise<Get${model.name}Payload<S>[]>;`;
  }

  // With relations - full generic signature
  return `findMany<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
  >(options?: {
    where?: ${model.name}Where;
    select?: S;
    orderBy?: ${model.name}OrderBy;
    limit?: number;
    offset?: number;
    include?: I;
  }): Promise<Get${model.name}Payload<S, I>[]>;`;
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

/** Generate findUnique method signature with full type inference */
export function generateFindUniqueMethod(model: ModelMetadata): string {
  if (!hasRelations(model)) {
    return `findUnique<S extends ${model.name}Select | undefined = undefined>(options: {
    where: ${model.name}FindUniqueWhere;
    select?: S;
  }): Promise<Get${model.name}Payload<S> | null>;`;
  }

  return `findUnique<
    S extends ${model.name}Select | undefined = undefined,
    I extends ${model.name}Include | undefined = undefined,
  >(options: {
    where: ${model.name}FindUniqueWhere;
    select?: S;
    include?: I;
  }): Promise<Get${model.name}Payload<S, I> | null>;`;
}

/** Generate create method signature with full type inference */
export function generateCreateMethod(model: ModelMetadata): string {
  // Create doesn't support include, only select
  // Use CreateInput to support both raw fields and nested relations
  return `create<S extends ${model.name}Select | undefined = undefined>(options: {
    data: ${model.name}CreateInput;
    select?: S;
  }): Promise<Get${model.name}Payload<S>>;`;
}

/** Generate updateMany method signature with full type inference */
export function generateUpdateMethod(model: ModelMetadata): string {
  // UpdateMany doesn't support include, only select
  // Use UpdateInput to support both raw fields and nested relations
  return `updateMany<S extends ${model.name}Select | undefined = undefined>(options: {
    where: ${model.name}Where;
    data: ${model.name}UpdateInput;
    select?: S;
  }): Promise<Get${model.name}Payload<S>[]>;`;
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
