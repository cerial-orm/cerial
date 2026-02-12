/**
 * DEFINE statement generator for SurrealDB tables and fields
 */

import type {
  CompositeIndex,
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectMetadata,
  ObjectRegistry,
} from '../../types';
import {
  generateAssertClause,
  generateDefaultClause,
  generateTypeClause,
  generateValueClause,
  mapToSurrealType,
} from './type-mapper';

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

/** Generate DEFINE INDEX statement for unique or indexed fields */
export function generateDefineIndex(field: FieldMetadata, tableName: string, options: DefineFieldOptions = {}): string {
  // Skip fields that are neither @unique nor @index
  if (!field.isUnique && !field.isIndexed) return '';

  // Skip @id fields — SurrealDB has a built-in primary index
  if (field.isId) return '';

  // Skip Relation fields - they are virtual
  if (field.type === 'relation') return '';

  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };
  const isUnique = field.isUnique;
  const indexSuffix = isUnique ? 'unique' : 'index';
  const indexName = `${tableName}_${field.name}_${indexSuffix}`;
  const parts: string[] = ['DEFINE INDEX'];

  if (opts.overwrite) parts.push('OVERWRITE');
  else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

  parts.push(indexName);
  parts.push('ON TABLE');
  parts.push(tableName);
  parts.push('COLUMNS');
  parts.push(field.name);

  if (isUnique) parts.push('UNIQUE');

  return parts.join(' ') + ';';
}

/** Generate DEFINE INDEX statement for a composite index/unique directive */
export function generateDefineCompositeIndex(
  directive: CompositeIndex,
  tableName: string,
  options: DefineFieldOptions = {},
): string {
  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };
  const parts: string[] = ['DEFINE INDEX'];

  if (opts.overwrite) parts.push('OVERWRITE');
  else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

  parts.push(directive.name);
  parts.push('ON TABLE');
  parts.push(tableName);
  parts.push('COLUMNS');
  parts.push(directive.fields.join(', '));

  if (directive.kind === 'unique') parts.push('UNIQUE');

  return parts.join(' ') + ';';
}

/**
 * Generate DEFINE FIELD statements for object sub-fields (recursive).
 * Each sub-field uses dot notation: parentPath.fieldName
 * For array parents, uses .* notation: parentPath.*.fieldName
 *
 * @param fieldPath - The dot-separated path prefix (e.g., "address" or "locations.*")
 * @param tableName - The table name for ON TABLE clause
 * @param objectMeta - The object metadata whose fields we're defining
 * @param objectRegistry - Registry of all objects (for nested object resolution)
 * @param options - DEFINE FIELD options (OVERWRITE, IF NOT EXISTS)
 * @param visited - Set of object names already visited (cycle detection for self-referencing)
 */
export function generateObjectFieldDefines(
  fieldPath: string,
  tableName: string,
  objectMeta: ObjectMetadata,
  objectRegistry: ObjectRegistry,
  options: DefineFieldOptions = {},
  visited: Set<string> = new Set(),
): string[] {
  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };
  const statements: string[] = [];

  for (const subField of objectMeta.fields) {
    const subPath = `${fieldPath}.${subField.name}`;

    // Check if this sub-field is itself an object type
    if (subField.type === 'object' && subField.objectInfo) {
      const nestedObjectName = subField.objectInfo.objectName;

      // Self-referencing or cycle detection: use FLEXIBLE TYPE
      if (visited.has(nestedObjectName)) {
        const parts: string[] = ['DEFINE FIELD'];
        if (opts.overwrite) parts.push('OVERWRITE');
        else if (opts.ifNotExists) parts.push('IF NOT EXISTS');
        parts.push(subPath);
        parts.push('ON TABLE');
        parts.push(tableName);

        if (subField.isArray) {
          parts.push('TYPE array<object> FLEXIBLE');
        } else if (!subField.isRequired) {
          parts.push('TYPE option<object> FLEXIBLE');
        } else {
          parts.push('TYPE object FLEXIBLE');
        }

        statements.push(parts.join(' ') + ';');
        continue;
      }

      // Generate parent object field DEFINE
      const parentParts: string[] = ['DEFINE FIELD'];
      if (opts.overwrite) parentParts.push('OVERWRITE');
      else if (opts.ifNotExists) parentParts.push('IF NOT EXISTS');
      parentParts.push(subPath);
      parentParts.push('ON TABLE');
      parentParts.push(tableName);

      if (subField.isArray) {
        parentParts.push('TYPE array<object>');
      } else if (!subField.isRequired) {
        parentParts.push('TYPE option<object>');
      } else {
        parentParts.push('TYPE object');
      }
      statements.push(parentParts.join(' ') + ';');

      // Recursively generate sub-fields for the nested object
      const nestedObject = objectRegistry[nestedObjectName];
      if (nestedObject) {
        const nestedVisited = new Set(visited);
        nestedVisited.add(nestedObjectName);
        const nestedPath = subField.isArray ? `${subPath}.*` : subPath;
        statements.push(
          ...generateObjectFieldDefines(nestedPath, tableName, nestedObject, objectRegistry, options, nestedVisited),
        );
      }
    } else {
      // Primitive or record sub-field — standard DEFINE FIELD
      const parts: string[] = ['DEFINE FIELD'];
      if (opts.overwrite) parts.push('OVERWRITE');
      else if (opts.ifNotExists) parts.push('IF NOT EXISTS');
      parts.push(subPath);
      parts.push('ON TABLE');
      parts.push(tableName);

      // Generate TYPE clause for the sub-field
      // Sub-fields retain their own types (not affected by parent optionality)
      if (subField.isArray) {
        const surrealType = mapToSurrealType(subField.type);
        parts.push(`TYPE array<${surrealType}>`);
      } else if (subField.isRequired) {
        const surrealType = mapToSurrealType(subField.type);
        parts.push(`TYPE ${surrealType}`);
      } else {
        const surrealType = mapToSurrealType(subField.type);
        parts.push(`TYPE option<${surrealType} | null>`);
      }

      // Add VALUE clause for array fields with @distinct/@sort decorators
      if (subField.isArray && (subField.isDistinct || subField.sortOrder)) {
        const operations: string[] = [];
        if (subField.isDistinct) operations.push('.distinct()');
        if (subField.sortOrder) {
          operations.push(subField.sortOrder === 'desc' ? '.sort(false)' : '.sort(true)');
        }
        parts.push(`VALUE IF $value THEN $value${operations.join('')} ELSE [] END`);
      }

      // Add ASSERT clause if needed
      const assertClause = generateAssertClause(subField.type);
      if (assertClause) parts.push(assertClause);

      // Add DEFAULT clause for @default or @now decorators
      const defaultClause = generateDefaultClause(subField.hasNowDefault, subField.defaultValue);
      if (defaultClause) parts.push(defaultClause);

      statements.push(parts.join(' ') + ';');
    }
  }

  return statements;
}

/**
 * Collect DEFINE INDEX statements for object subfields with @index or @unique decorators.
 * Indexes are table-level and use the full dot-notation path as COLUMNS.
 *
 * @param fieldPath - The dot-separated path prefix (e.g., "address" or "locations.*")
 * @param tableName - The table name for ON TABLE clause
 * @param objectMeta - The object metadata whose fields we're scanning
 * @param objectRegistry - Registry of all objects (for nested object resolution)
 * @param options - DEFINE INDEX options
 * @param visited - Cycle detection set
 */
export function collectObjectFieldIndexes(
  fieldPath: string,
  tableName: string,
  objectMeta: ObjectMetadata,
  objectRegistry: ObjectRegistry,
  options: DefineFieldOptions = {},
  visited: Set<string> = new Set(),
): string[] {
  const opts = { ...DEFAULT_FIELD_OPTIONS, ...options };
  const statements: string[] = [];

  for (const subField of objectMeta.fields) {
    const subPath = `${fieldPath}.${subField.name}`;

    if (subField.type === 'object' && subField.objectInfo) {
      const nestedObjectName = subField.objectInfo.objectName;
      if (visited.has(nestedObjectName)) continue;

      const nestedObject = objectRegistry[nestedObjectName];
      if (nestedObject) {
        const nestedVisited = new Set(visited);
        nestedVisited.add(nestedObjectName);
        const nestedPath = subField.isArray ? `${subPath}.*` : subPath;
        statements.push(
          ...collectObjectFieldIndexes(nestedPath, tableName, nestedObject, objectRegistry, options, nestedVisited),
        );
      }
    } else if (subField.isUnique || subField.isIndexed) {
      // Generate DEFINE INDEX for this subfield
      const isUnique = subField.isUnique;
      const indexSuffix = isUnique ? 'unique' : 'index';
      // Use dot-notation path with dots replaced by underscores for index name
      const indexFieldPath = subPath.replace(/\.\*/g, '').replace(/\./g, '_');
      const indexName = `${tableName}_${indexFieldPath}_${indexSuffix}`;
      const parts: string[] = ['DEFINE INDEX'];

      if (opts.overwrite) parts.push('OVERWRITE');
      else if (opts.ifNotExists) parts.push('IF NOT EXISTS');

      parts.push(indexName);
      parts.push('ON TABLE');
      parts.push(tableName);
      parts.push('COLUMNS');
      parts.push(subPath);

      if (isUnique) parts.push('UNIQUE');

      statements.push(parts.join(' ') + ';');
    }
  }

  return statements;
}

/**
 * Check if an object type contains self-referencing cycles.
 * Returns true if the object (or any nested object it references) eventually references itself.
 */
function objectHasCycles(
  objectName: string,
  objectRegistry: ObjectRegistry,
  visited: Set<string> = new Set(),
): boolean {
  if (visited.has(objectName)) return true;

  const obj = objectRegistry[objectName];
  if (!obj) return false;

  visited.add(objectName);

  for (const field of obj.fields) {
    if (field.type === 'object' && field.objectInfo) {
      if (objectHasCycles(field.objectInfo.objectName, objectRegistry, new Set(visited))) return true;
    }
  }

  return false;
}

/** Generate all DEFINE statements for a single model */
export function generateModelDefineStatements(
  model: ModelMetadata,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
  objectRegistry?: ObjectRegistry,
): string[] {
  const statements: string[] = [];

  // 1. Define the table first
  statements.push(generateDefineTable(model, tableOptions));

  // 2. Define each field (skips id and relation fields)
  for (const field of model.fields) {
    const fieldDef = generateDefineField(field, model.tableName, model, fieldOptions);
    if (fieldDef) statements.push(fieldDef);

    // For object fields, generate sub-field DEFINE statements
    if (field.type === 'object' && field.objectInfo && objectRegistry) {
      const objectMeta = objectRegistry[field.objectInfo.objectName];
      if (objectMeta) {
        // If the object has self-referencing cycles, use FLEXIBLE on the parent field
        // with no sub-field definitions — SurrealDB SCHEMAFULL tables can't handle
        // arbitrarily deep nesting even with FLEXIBLE on nested self-ref fields
        if (objectHasCycles(field.objectInfo.objectName, objectRegistry)) {
          // Replace the last statement (the parent DEFINE FIELD) with a FLEXIBLE version
          const lastIdx = statements.length - 1;
          const lastStmt = statements[lastIdx]!;
          if (lastStmt.includes(` ${field.name} `)) {
            statements[lastIdx] = lastStmt.replace(/;$/, ' FLEXIBLE;');
          }
          // Skip sub-field definitions entirely
        } else {
          const visited = new Set<string>([field.objectInfo.objectName]);
          const fieldPath = field.isArray ? `${field.name}.*` : field.name;
          statements.push(
            ...generateObjectFieldDefines(
              fieldPath,
              model.tableName,
              objectMeta,
              objectRegistry,
              fieldOptions,
              visited,
            ),
          );
        }
      }
    }
  }

  // 3. Define indexes for unique and indexed fields
  for (const field of model.fields) {
    const indexDef = generateDefineIndex(field, model.tableName, fieldOptions);
    if (indexDef) statements.push(indexDef);
  }

  // 3b. Define indexes for object subfields with @index/@unique
  if (objectRegistry) {
    for (const field of model.fields) {
      if (field.type === 'object' && field.objectInfo) {
        const objectMeta = objectRegistry[field.objectInfo.objectName];
        if (objectMeta && !objectHasCycles(field.objectInfo.objectName, objectRegistry)) {
          const visited = new Set<string>([field.objectInfo.objectName]);
          const fieldPath = field.isArray ? `${field.name}.*` : field.name;
          statements.push(
            ...collectObjectFieldIndexes(fieldPath, model.tableName, objectMeta, objectRegistry, fieldOptions, visited),
          );
        }
      }
    }
  }

  // 4. Define composite indexes (@@index and @@unique)
  for (const directive of model.compositeDirectives ?? []) {
    statements.push(generateDefineCompositeIndex(directive, model.tableName, fieldOptions));
  }

  return statements;
}

/** Generate all DEFINE statements for all models in registry */
export function generateRegistryDefineStatements(
  registry: ModelRegistry,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
  objectRegistry?: ObjectRegistry,
): string[] {
  const statements: string[] = [];

  for (const modelName in registry) {
    const model = registry[modelName];
    if (!model) continue;
    const modelStatements = generateModelDefineStatements(model, tableOptions, fieldOptions, objectRegistry);
    statements.push(...modelStatements);
  }

  return statements;
}

/** Generate a single combined migration query string */
export function generateMigrationQuery(
  registry: ModelRegistry,
  tableOptions?: DefineTableOptions,
  fieldOptions?: DefineFieldOptions,
  objectRegistry?: ObjectRegistry,
): string {
  const statements = generateRegistryDefineStatements(registry, tableOptions, fieldOptions, objectRegistry);
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
  objectRegistry?: ObjectRegistry,
): ModelMigrationMap {
  const map: ModelMigrationMap = {};

  for (const modelName in registry) {
    const model = registry[modelName];
    if (!model) continue;
    map[modelName] = generateModelDefineStatements(model, tableOptions, fieldOptions, objectRegistry);
  }

  return map;
}

/** Escape single quotes in SurrealQL statements for TypeScript string literals */
function escapeSingleQuotes(surql: string): string {
  return surql.replace(/'/g, "\\'");
}

/** Generate TypeScript code for per-model migrations */
export function generatePerModelMigrationCode(models: ModelMetadata[], objectRegistry?: ObjectRegistry): string {
  const registry: ModelRegistry = {};
  for (const model of models) {
    registry[model.name] = model;
  }

  // Generate per-model map
  const migrationMap = generateModelMigrationMap(registry, undefined, undefined, objectRegistry);
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
