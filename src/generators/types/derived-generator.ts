/**
 * Derived type generator - generates Create, Update, and other derived types
 */

import type { ModelMetadata } from '../../types';

/** Get fields that should be omitted from create (auto-generated) */
function getOmitForCreate(model: ModelMetadata): string[] {
  // Users can provide their own values for all fields, so nothing is omitted by default
  return [];
}

/** Get fields that should be optional in create (have defaults or are auto-generated) */
function getOptionalForCreate(model: ModelMetadata): string[] {
  const optional = new Set<string>();

  for (const field of model.fields) {
    // Fields with default values are optional
    if (field.defaultValue !== undefined) {
      optional.add(field.name);
    }
    // @id fields are optional (db can auto-generate)
    if (field.isId) {
      optional.add(field.name);
    }
    // @now fields are optional (db can auto-generate)
    if (field.hasNowDefault) {
      optional.add(field.name);
    }
    // Optional fields are optional
    if (!field.isRequired) {
      optional.add(field.name);
    }
  }

  return Array.from(optional);
}

/** Generate Create type */
export function generateCreateType(model: ModelMetadata): string {
  const omit = getOmitForCreate(model);
  const optional = getOptionalForCreate(model);

  if (!omit.length && !optional.length) return `export type ${model.name}Create = ${model.name};`;

  let type = omit.length ? `Omit<${model.name}, ${omit.map((f) => `'${f}'`).join(' | ')}>` : '';

  if (optional.length) {
    const optionalFields = optional.filter((f) => !omit.includes(f));
    if (optionalFields.length)
      type += `Omit<${model.name}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}> & Partial<Pick<${model.name}, ${optionalFields.map((f) => `'${f}'`).join(' | ')}>>`;
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

/** Generate Select type (boolean map of fields, requires at least one field) */
export function generateSelectType(model: ModelMetadata): string {
  const fieldNames = model.fields.map((f) => f.name);

  if (fieldNames.length === 0) {
    return `export interface ${model.name}Select {}`;
  }

  if (fieldNames.length === 1) {
    return `export type ${model.name}Select = { ${fieldNames[0]}: boolean; };`;
  }

  // Generate union where each variant requires at least one field
  // For each field, make it required and all others optional
  const variants = fieldNames.map((field) => {
    const otherFields = fieldNames
      .filter((f) => f !== field)
      .map((f) => `'${f}'`)
      .join(' | ');
    return `  | { ${field}: boolean } & Partial<Record<${otherFields}, boolean>>`;
  });

  return `export type ${model.name}Select =
${variants.join('\n')};`;
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
