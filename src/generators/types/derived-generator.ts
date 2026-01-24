/**
 * Derived type generator - generates Create, Update, and other derived types
 */

import type { ModelMetadata, FieldMetadata } from '../../types';

/** Get fields that should be omitted from create (auto-generated) */
function getOmitForCreate(model: ModelMetadata): string[] {
  // Users can provide their own values for all fields, so nothing is omitted by default
  return [];
}

/** Get fields that should be optional in create (have defaults) */
function getOptionalForCreate(model: ModelMetadata): string[] {
  const optional: string[] = [];

  for (const field of model.fields) {
    // Fields with default values are optional
    if (field.defaultValue !== undefined) {
      optional.push(field.name);
    }
    // Optional fields are optional
    if (!field.isRequired) {
      optional.push(field.name);
    }
  }

  return optional;
}

/** Generate Create type */
export function generateCreateType(model: ModelMetadata): string {
  const omit = getOmitForCreate(model);
  const optional = getOptionalForCreate(model);

  if (omit.length === 0 && optional.length === 0) {
    return `export type ${model.name}Create = ${model.name};`;
  }

  let type = model.name;

  if (omit.length > 0) {
    type = `Omit<${type}, ${omit.map((f) => `'${f}'`).join(' | ')}>`;
  }

  if (optional.length > 0) {
    const optionalFields = optional.filter((f) => !omit.includes(f));
    if (optionalFields.length > 0) {
      type = `Omit<${type}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}> & Partial<Pick<${model.name}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}>>`;
    }
  }

  return `export type ${model.name}Create = ${type};`;
}

/** Generate Update type (all fields partial except id) */
export function generateUpdateType(model: ModelMetadata): string {
  // Find the id field
  const idField = model.fields.find((f) => f.isId);
  if (idField) {
    return `export type ${model.name}Update = Partial<Omit<${model.name}, '${idField.name}'>>;`;
  }
  return `export type ${model.name}Update = Partial<${model.name}>;`;
}

/** Generate Select type (boolean map of fields) */
export function generateSelectType(model: ModelMetadata): string {
  const fields = model.fields.map((f) => `  ${f.name}?: boolean;`);
  return `export interface ${model.name}Select {
${fields.join('\n')}
}`;
}

/** Generate OrderBy type */
export function generateOrderByType(model: ModelMetadata): string {
  const fields = model.fields.map((f) => `  ${f.name}?: 'asc' | 'desc';`);
  return `export interface ${model.name}OrderBy {
${fields.join('\n')}
}`;
}

/** Generate all derived types for a model */
export function generateDerivedTypes(model: ModelMetadata): string {
  return [
    generateCreateType(model),
    generateUpdateType(model),
    generateSelectType(model),
    generateOrderByType(model),
  ].join('\n\n');
}

/** Generate derived types for all models */
export function generateAllDerivedTypes(models: ModelMetadata[]): string {
  return models.map(generateDerivedTypes).join('\n\n');
}
