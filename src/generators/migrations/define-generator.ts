/**
 * DEFINE statement generator for SurrealDB tables and fields
 */

import type { ModelMetadata, FieldMetadata, ModelRegistry } from '../../types';
import { generateTypeClause, generateAssertClause, generateDefaultClause } from './type-mapper';

/** Options for DEFINE TABLE statement */
export interface DefineTableOptions {
  /** Use SCHEMAFULL mode (strict schema enforcement) */
  schemafull?: boolean;
  /** Use OVERWRITE to replace existing definition */
  overwrite?: boolean;
  /** Use IF NOT EXISTS to avoid errors on existing tables */
  ifNotExists?: boolean;
}

/** Options for DEFINE FIELD statement */
export interface DefineFieldOptions {
  /** Use OVERWRITE to replace existing definition */
  overwrite?: boolean;
  /** Use IF NOT EXISTS to avoid errors on existing fields */
  ifNotExists?: boolean;
}

/** Default options for table definitions */
const DEFAULT_TABLE_OPTIONS: DefineTableOptions = {
  schemafull: true,
  overwrite: true,
  ifNotExists: false,
};

/** Default options for field definitions */
const DEFAULT_FIELD_OPTIONS: DefineFieldOptions = {
  overwrite: true,
  ifNotExists: false,
};

/** Generate DEFINE TABLE statement for a model */
export function generateDefineTable(model: ModelMetadata, options: DefineTableOptions = {}): string {
  const opts = { ...DEFAULT_TABLE_OPTIONS, ...options };
  const parts: string[] = ['DEFINE TABLE'];

  if (opts.overwrite) parts.push('OVERWRITE');
  else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

  parts.push(model.tableName);

  if (opts.schemafull) parts.push('SCHEMAFULL');

  return parts.join(' ') + ';';
}

/** Generate DEFINE FIELD statement for a single field */
export function generateDefineField(
  field: FieldMetadata,
  tableName: string,
  options: DefineFieldOptions = {},
): string {
  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };

  // Skip id field - SurrealDB manages this automatically
  if (field.isId) return '';

  const parts: string[] = ['DEFINE FIELD'];

  if (opts.overwrite) parts.push('OVERWRITE');
  else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

  parts.push(field.name);
  parts.push('ON TABLE');
  parts.push(tableName);

  // Add TYPE clause
  parts.push(generateTypeClause(field.type, field.isRequired));

  // Add ASSERT clause if needed (e.g., for email validation)
  const assertClause = generateAssertClause(field.type);
  if (assertClause) parts.push(assertClause);

  // Add DEFAULT clause if needed
  const defaultClause = generateDefaultClause(field.hasNowDefault, field.defaultValue);
  if (defaultClause) parts.push(defaultClause);

  return parts.join(' ') + ';';
}

/** Generate DEFINE INDEX statement for unique fields */
export function generateDefineIndex(
  field: FieldMetadata,
  tableName: string,
  options: DefineFieldOptions = {},
): string {
  if (!field.isUnique || field.isId) return '';

  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };
  const indexName = `${tableName}_${field.name}_unique`;
  const parts: string[] = ['DEFINE INDEX'];

  if (opts.overwrite) parts.push('OVERWRITE');
  else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

  parts.push(indexName);
  parts.push('ON TABLE');
  parts.push(tableName);
  parts.push('COLUMNS');
  parts.push(field.name);
  parts.push('UNIQUE');

  return parts.join(' ') + ';';
}

/** Generate all DEFINE statements for a single model */
export function generateModelDefineStatements(
  model: ModelMetadata,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
): string[] {
  const statements: string[] = [];

  // 1. Define the table first
  statements.push(generateDefineTable(model, tableOptions));

  // 2. Define each field
  for (const field of model.fields) {
    const fieldDef = generateDefineField(field, model.tableName, fieldOptions);
    if (fieldDef) statements.push(fieldDef);
  }

  // 3. Define indexes for unique fields
  for (const field of model.fields) {
    const indexDef = generateDefineIndex(field, model.tableName, fieldOptions);
    if (indexDef) statements.push(indexDef);
  }

  return statements;
}

/** Generate all DEFINE statements for all models in registry */
export function generateRegistryDefineStatements(
  registry: ModelRegistry,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
): string[] {
  const statements: string[] = [];

  for (const modelName in registry) {
    const model = registry[modelName];
    if (!model) continue;
    const modelStatements = generateModelDefineStatements(model, tableOptions, fieldOptions);
    statements.push(...modelStatements);
  }

  return statements;
}

/** Generate a single combined migration query string */
export function generateMigrationQuery(
  registry: ModelRegistry,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
): string {
  const statements = generateRegistryDefineStatements(registry, tableOptions, fieldOptions);
  return statements.join('\n');
}

/** Generate TypeScript code for migration function */
export function generateMigrationCode(models: ModelMetadata[]): string {
  const registry: ModelRegistry = {};
  for (const model of models) {
    registry[model.name] = model;
  }

  const statements = generateRegistryDefineStatements(registry);
  const statementsStr = statements.map((s) => `    '${s}'`).join(',\n');

  return `
/** Migration statements for all models */
export const migrationStatements: string[] = [
${statementsStr}
];

/** Get migration query string */
export function getMigrationQuery(): string {
  return migrationStatements.join('\\n');
}
`;
}
