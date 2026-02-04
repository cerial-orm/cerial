/**
 * DEFINE statement generator for SurrealDB tables and fields
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../types';
import { generateAssertClause, generateDefaultClause, generateTypeClause, generateValueClause } from './type-mapper';

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
  model: ModelMetadata,
  options: DefineFieldOptions = {},
): string {
  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };

  // Skip id field - SurrealDB manages this automatically
  if (field.isId) return '';

  // Skip Relation fields - they are virtual and not stored in database
  if (field.type === 'relation') return '';

  const parts: string[] = ['DEFINE FIELD'];

  if (opts.overwrite) parts.push('OVERWRITE');
  else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

  parts.push(field.name);
  parts.push('ON TABLE');
  parts.push(tableName);

  // Add TYPE clause (pass field and model for Record type handling)
  parts.push(generateTypeClause(field.type, field.isRequired, field, model));

  // Add VALUE clause for array fields (distinct, sort)
  const valueClause = generateValueClause(field, model);
  if (valueClause) parts.push(valueClause);

  // Add ASSERT clause if needed (e.g., for email validation)
  const assertClause = generateAssertClause(field.type);
  if (assertClause) parts.push(assertClause);

  // Add DEFAULT clause if needed
  const defaultClause = generateDefaultClause(field.hasNowDefault, field.defaultValue);
  if (defaultClause) parts.push(defaultClause);

  return parts.join(' ') + ';';
}

/** Generate DEFINE INDEX statement for unique fields */
export function generateDefineIndex(field: FieldMetadata, tableName: string, options: DefineFieldOptions = {}): string {
  if (!field.isUnique || field.isId) return '';

  // Skip Relation fields - they are virtual
  if (field.type === 'relation') return '';

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

  // 2. Define each field (skips id and relation fields)
  for (const field of model.fields) {
    const fieldDef = generateDefineField(field, model.tableName, model, fieldOptions);
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

/** Map of model name to migration statements */
export interface ModelMigrationMap {
  [modelName: string]: string[];
}

/** Generate migration map grouped by model */
export function generateModelMigrationMap(
  registry: ModelRegistry,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
): ModelMigrationMap {
  const map: ModelMigrationMap = {};

  for (const modelName in registry) {
    const model = registry[modelName];
    if (!model) continue;
    map[modelName] = generateModelDefineStatements(model, tableOptions, fieldOptions);
  }

  return map;
}

/** Escape single quotes in SurrealQL statements for TypeScript string literals */
function escapeSingleQuotes(surql: string): string {
  return surql.replace(/'/g, "\\'");
}

/** Generate TypeScript code for per-model migrations */
export function generatePerModelMigrationCode(models: ModelMetadata[]): string {
  const registry: ModelRegistry = {};
  for (const model of models) {
    registry[model.name] = model;
  }

  // Generate per-model map
  const migrationMap = generateModelMigrationMap(registry);
  const mapEntries = Object.entries(migrationMap)
    .map(([modelName, modelStatements]) => {
      const modelStatementsStr = modelStatements.map((s) => `    '${escapeSingleQuotes(s)}'`).join(',\n');
      return `  ${modelName}: [\n${modelStatementsStr}\n  ]`;
    })
    .join(',\n');

  // Generate typed model name union
  const modelNameUnion = Object.keys(migrationMap)
    .map((name) => `'${name}'`)
    .join(' | ');

  // Generate model names array as const
  const modelNamesArray = Object.keys(migrationMap)
    .map((name) => `'${name}'`)
    .join(', ');

  return `/** Union type of all model names */
export type ModelName = ${modelNameUnion};

/** All model names as const array */
export const modelNames = [${modelNamesArray}] as const;

/** Migration statements grouped by model */
export const migrationsByModel: Record<ModelName, string[]> = {
${mapEntries}
};

/** Get migration query string for a specific model */
export function getModelMigrationQuery(modelName: ModelName): string {
  const statements = migrationsByModel[modelName];
  return statements.join('\\n');
}

/** Get all model names that have migrations */
export function getMigrationModelNames(): ModelName[] {
  return [...modelNames];
}
`;
}
