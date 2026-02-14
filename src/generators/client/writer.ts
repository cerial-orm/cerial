/**
 * Client writer - writes generated client files
 */

import { mkdir } from 'node:fs/promises';
import * as prettier from 'prettier';
import type { ModelMetadata, ObjectMetadata, ObjectRegistry, TupleMetadata, TupleRegistry } from '../../types';
import {
  generateAllDerivedTypes,
  generateInterfaces,
  generateModelTypes,
  generateObjectDerivedTypes,
  generateObjectInterfaces,
  generateObjectWhereInterface,
  generateTupleInterfaces,
  generateTupleWhereInterface,
  generateWhereTypes,
  objectHasDefaultOrTimestamp,
} from '../types';
import { generateFindUniqueWhereType } from '../types/method-generator';
import { generateConnectionExports } from './connection-template';
import { generateClientTemplate } from './template';

/** ts-toolbelt import for generated types */
const TS_TOOLBELT_IMPORT = `import type { Object as O, Any as A } from 'ts-toolbelt';`;

/** CerialId import for Record type fields */
const CERIAL_ID_IMPORT = `import { CerialId } from 'cerial';
import type { RecordIdInput } from 'cerial';`;

/** NONE sentinel import for nullable/optional update types */
const NONE_IMPORT = `import type { CerialNone } from 'cerial';`;

/** DeleteUnique, UpdateUnique, Upsert, select utility types, and CerialQueryPromise import for model files */
const UNIQUE_TYPES_IMPORT = `import type { DeleteUniqueReturn, DeleteUniqueReturnType, UpdateUniqueReturn, UpdateUniqueReturnType, UpsertReturn, UpsertReturnType, UpsertArrayReturnType, ResolveFieldSelect } from '..';
import type { CerialQueryPromise } from '..';`;

/** Prettier config cache */
let prettierConfig: prettier.Options | null = null;

/** Ensure directory exists */
async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Load prettier config from workspace root */
async function loadPrettierConfig(outputDir: string): Promise<prettier.Options> {
  if (prettierConfig) return prettierConfig;

  // Try to resolve config from the output directory
  const resolvedConfig = await prettier.resolveConfig(outputDir);

  prettierConfig = {
    ...resolvedConfig,
    parser: 'typescript',
  };

  return prettierConfig;
}

/** Format TypeScript code with prettier */
async function formatCode(code: string, outputDir: string): Promise<string> {
  try {
    const config = await loadPrettierConfig(outputDir);
    return await prettier.format(code, config);
  } catch {
    // If prettier fails, return the original code
    return code;
  }
}

/** Write client main file */
export async function writeClientMain(outputDir: string, models: ModelMetadata[]): Promise<string> {
  await ensureDir(outputDir);

  const filePath = `${outputDir}/client.ts`;
  const content = `/**
 * Generated database client
 * Do not edit manually
 */

${generateClientTemplate(models)}

${generateConnectionExports()}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Get related model names from a model's relation fields */
function getRelatedModelNames(model: ModelMetadata): string[] {
  const relatedModels = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'relation' && field.relationInfo?.targetModel) {
      relatedModels.add(field.relationInfo.targetModel);
    }
  }

  return Array.from(relatedModels);
}

/** Get referenced object names from a model's object fields */
function getReferencedObjectNames(model: ModelMetadata): string[] {
  const objectNames = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'object' && field.objectInfo) {
      objectNames.add(field.objectInfo.objectName);
    }
  }

  return Array.from(objectNames);
}

/** Get referenced object names from an object's fields (for cross-object imports) */
function getObjectReferencedObjectNames(object: ObjectMetadata): string[] {
  const objectNames = new Set<string>();

  for (const field of object.fields) {
    if (field.type === 'object' && field.objectInfo && field.objectInfo.objectName !== object.name) {
      objectNames.add(field.objectInfo.objectName);
    }
  }

  return Array.from(objectNames);
}

/** Get referenced tuple names from a model's tuple fields */
function getReferencedTupleNames(model: ModelMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const field of model.fields) {
    if (field.type === 'tuple' && field.tupleInfo) {
      tupleNames.add(field.tupleInfo.tupleName);
    }
  }

  return Array.from(tupleNames);
}

/** Get referenced tuple names from an object's fields */
function getObjectReferencedTupleNames(object: ObjectMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const field of object.fields) {
    if (field.type === 'tuple' && field.tupleInfo) {
      tupleNames.add(field.tupleInfo.tupleName);
    }
  }

  return Array.from(tupleNames);
}

/** Get referenced object and tuple names from a tuple's elements */
function getTupleReferencedObjectNames(tuple: TupleMetadata): string[] {
  const objectNames = new Set<string>();

  for (const element of tuple.elements) {
    if (element.type === 'object' && element.objectInfo) {
      objectNames.add(element.objectInfo.objectName);
    }
  }

  return Array.from(objectNames);
}

/** Get referenced tuple names from a tuple's elements (for cross-tuple imports) */
function getTupleReferencedTupleNames(tuple: TupleMetadata): string[] {
  const tupleNames = new Set<string>();

  for (const element of tuple.elements) {
    if (element.type === 'tuple' && element.tupleInfo && element.tupleInfo.tupleName !== tuple.name) {
      tupleNames.add(element.tupleInfo.tupleName);
    }
  }

  return Array.from(tupleNames);
}

/** Check if a model has any relation fields */
function hasRelations(model: ModelMetadata): boolean {
  return model.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Check if a model's Update type needs CerialNone (has optional non-array non-id non-readonly fields) */
function needsCerialNone(model: ModelMetadata): boolean {
  return model.fields.some((f) => {
    if (f.isId || f.isReadonly || f.type === 'relation' || f.isArray) return false;
    if (f.timestampDecorator === 'now') return false;
    // Optional non-array fields (object, tuple, or primitive) can be cleared with NONE
    if (!f.isRequired) return true;
    // Nullable non-array fields can be set to null (handled by | null, not CerialNone)
    // But nullable + optional needs CerialNone too — already covered above

    return false;
  });
}

/** Generate import statements for related model types */
function generateRelatedImports(relatedModels: string[], allModels: ModelMetadata[]): string {
  if (relatedModels.length === 0) return '';

  const imports = relatedModels.map((name) => {
    const fileName = name.toLowerCase();
    const relatedModel = allModels.find((m) => m.name === name);
    const hasInclude = relatedModel && hasRelations(relatedModel);

    // Import base model interface + Where, Select, OrderBy + NestedCreate + Include/IncludePayload if exists
    const baseImports = [name, `${name}Where`, `${name}Select`, `${name}OrderBy`, `${name}NestedCreate`];

    if (hasInclude) {
      baseImports.push(`${name}Include`, `Get${name}IncludePayload`);
    }

    return `import type { ${baseImports.join(', ')} } from './${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/** Generate import statements for referenced object types */
function generateObjectImports(objectNames: string[], objectRegistry?: ObjectRegistry): string {
  if (objectNames.length === 0) return '';

  const imports = objectNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Input`, `${name}Where`, `${name}Select`, `${name}OrderBy`];

    // Import CreateInput if the object has @default/@now fields
    if (objectRegistry) {
      const objMeta = objectRegistry[name];
      if (objMeta && objectHasDefaultOrTimestamp(objMeta, objectRegistry)) {
        importNames.push(`${name}CreateInput`);
      }
    }

    return `import type { ${importNames.join(', ')} } from './${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/** Generate import statements for referenced tuple types */
function generateTupleImports(tupleNames: string[]): string {
  if (tupleNames.length === 0) return '';

  const imports = tupleNames.map((name) => {
    const fileName = name.toLowerCase();
    const importNames = [name, `${name}Input`, `${name}Where`];

    return `import type { ${importNames.join(', ')} } from './${fileName}';`;
  });

  return imports.join('\n') + '\n';
}

/** Create a registry from model array */
function createRegistryFromModels(models: ModelMetadata[]): Record<string, ModelMetadata> {
  const registry: Record<string, ModelMetadata> = {};
  for (const model of models) {
    registry[model.name] = model;
  }
  return registry;
}

/** Write model type file */
export async function writeModelTypes(
  outputDir: string,
  model: ModelMetadata,
  allModels: ModelMetadata[],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/${model.name.toLowerCase()}.ts`;

  // Get related model names for imports, excluding self-references
  const relatedModels = getRelatedModelNames(model).filter((name) => name !== model.name);
  const relatedImports = generateRelatedImports(relatedModels, allModels);

  // Get referenced object names for imports
  const referencedObjects = getReferencedObjectNames(model);
  const objectImports = generateObjectImports(referencedObjects, objectRegistry);

  // Get referenced tuple names for imports
  const referencedTuples = getReferencedTupleNames(model);
  const tupleImports = generateTupleImports(referencedTuples);

  // Create registry for Include type generation
  const registry = createRegistryFromModels(allModels);

  // Check if CerialNone import is needed for this model's Update type
  const noneImport = needsCerialNone(model) ? `\n${NONE_IMPORT}` : '';

  // Generate all type content for this model
  const interfaceCode = generateInterfaces([model]);
  const whereCode = generateWhereTypes([model]);
  const findUniqueWhereCode = generateFindUniqueWhereType(model, objectRegistry);
  const derivedCode = generateAllDerivedTypes([model], registry, objectRegistry);
  const modelCode = generateModelTypes([model]);

  const content = `/**
 * Generated types for ${model.name}
 * Do not edit manually
 */

${TS_TOOLBELT_IMPORT}
${CERIAL_ID_IMPORT}${noneImport}
${UNIQUE_TYPES_IMPORT}
${relatedImports}${objectImports}${tupleImports}${interfaceCode}

${whereCode}

${findUniqueWhereCode ? `${findUniqueWhereCode}\n\n` : ''}${derivedCode}

${modelCode}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write object type file */
export async function writeObjectTypes(
  outputDir: string,
  object: ObjectMetadata,
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/${object.name.toLowerCase()}.ts`;

  // Get cross-referenced object names for imports
  const referencedObjects = getObjectReferencedObjectNames(object);
  const objectImports = generateObjectImports(referencedObjects);

  // Get referenced tuple names for imports
  const referencedTuples = getObjectReferencedTupleNames(object);
  const tupleImports = generateTupleImports(referencedTuples);

  // Determine if we need CerialId import (for Record fields in objects)
  const hasRecordFields = object.fields.some((f) => f.type === 'record');
  const cerialIdImport = hasRecordFields ? `${CERIAL_ID_IMPORT}\n` : '';

  // Generate all type content for this object
  const interfaceCode = generateObjectInterfaces([object], objectRegistry);
  const whereCode = generateObjectWhereInterface(object, objectRegistry);
  const derivedCode = generateObjectDerivedTypes(object);

  const content = `/**
 * Generated types for ${object.name}
 * Do not edit manually
 */

${cerialIdImport}${objectImports}${tupleImports}${interfaceCode}

${whereCode}

${derivedCode}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write tuple type file */
export async function writeTupleTypes(
  outputDir: string,
  tuple: TupleMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/${tuple.name.toLowerCase()}.ts`;

  // Get cross-referenced object names for imports (object elements in tuple)
  const referencedObjects = getTupleReferencedObjectNames(tuple);
  const objectImports = generateObjectImports(referencedObjects, objectRegistry);

  // Get cross-referenced tuple names for imports (nested tuple elements)
  const referencedTuples = getTupleReferencedTupleNames(tuple);
  const tupleImports = generateTupleImports(referencedTuples);

  // Generate all type content for this tuple
  const interfaceCode = generateTupleInterfaces([tuple], tupleRegistry, objectRegistry);
  const whereCode = generateTupleWhereInterface(tuple, tupleRegistry, objectRegistry);

  const content = `/**
 * Generated types for ${tuple.name}
 * Do not edit manually
 */

${objectImports}${tupleImports}${interfaceCode}

${whereCode}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write models index file */
export async function writeModelsIndex(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
  tuples: TupleMetadata[] = [],
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/index.ts`;
  const modelExports = models.map((m) => `export * from './${m.name.toLowerCase()}';`).join('\n');
  const objectExports = objects.map((o) => `export * from './${o.name.toLowerCase()}';`).join('\n');
  const tupleExports = tuples.map((t) => `export * from './${t.name.toLowerCase()}';`).join('\n');
  const allExports = [tupleExports, objectExports, modelExports].filter(Boolean).join('\n');

  const content = `/**
 * Generated model exports
 * Do not edit manually
 */

${allExports}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write main client index file */
export async function writeClientIndex(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
  tuples: TupleMetadata[] = [],
): Promise<string> {
  await ensureDir(outputDir);

  const filePath = `${outputDir}/index.ts`;

  const modelExports = models.map((m) => m.name).join(',\n  ');
  const inputExports = models.map((m) => `${m.name}Input`).join(',\n  ');
  const createExports = models.map((m) => `${m.name}Create`).join(',\n  ');
  const nestedCreateExports = models.map((m) => `${m.name}NestedCreate`).join(',\n  ');
  const createInputExports = models.map((m) => `${m.name}CreateInput`).join(',\n  ');
  const updateExports = models.map((m) => `${m.name}Update`).join(',\n  ');
  const updateInputExports = models.map((m) => `${m.name}UpdateInput`).join(',\n  ');
  const whereExports = models.map((m) => `${m.name}Where`).join(',\n  ');
  const findUniqueWhereExports = models.map((m) => `${m.name}FindUniqueWhere`).join(',\n  ');
  const selectExports = models.map((m) => `${m.name}Select`).join(',\n  ');
  const orderByExports = models.map((m) => `${m.name}OrderBy`).join(',\n  ');
  const modelTypeExports = models.map((m) => `${m.name}Model`).join(',\n  ');

  // Include types only for models with relations
  const modelsWithRelations = models.filter(hasRelations);
  const includeExports = modelsWithRelations.map((m) => `${m.name}Include`).join(',\n  ');
  const relationsExports = models.map((m) => `${m.name}$Relations`).join(',\n  ');
  const includePayloadExports = modelsWithRelations.map((m) => `Get${m.name}IncludePayload`).join(',\n  ');
  const getPayloadExports = models.map((m) => `Get${m.name}Payload`).join(',\n  ');

  let content = `/**
 * Generated database client
 * Do not edit manually
 */

// Model interfaces (output types - CerialId for Record fields)
export type {
  ${modelExports},
} from './models';

// Model input interfaces (input types - RecordIdInput for Record fields)
export type {
  ${inputExports},
} from './models';

// Create types
export type {
  ${createExports},
} from './models';

// NestedCreate types (for use in nested operations)
export type {
  ${nestedCreateExports},
} from './models';

// CreateInput types (with nested relation operations)
export type {
  ${createInputExports},
} from './models';

// Update types
export type {
  ${updateExports},
} from './models';

// UpdateInput types (with nested relation operations)
export type {
  ${updateInputExports},
} from './models';

// Where types
export type {
  ${whereExports},
} from './models';

// FindUniqueWhere types
export type {
  ${findUniqueWhereExports},
} from './models';

// Select types
export type {
  ${selectExports},
} from './models';

// OrderBy types
export type {
  ${orderByExports},
} from './models';

// Model types
export type {
  ${modelTypeExports},
} from './models';
`;

  // Add Object type exports if there are objects
  if (objects.length > 0) {
    // Build registry for checking @default/@now
    const objRegistry: ObjectRegistry = {};
    for (const o of objects) objRegistry[o.name] = o;

    const objInterfaces = objects.map((o) => o.name).join(',\n  ');
    const objInputs = objects.map((o) => `${o.name}Input`).join(',\n  ');
    const objWheres = objects.map((o) => `${o.name}Where`).join(',\n  ');
    const objSelects = objects.map((o) => `${o.name}Select`).join(',\n  ');
    const objOrderBys = objects.map((o) => `${o.name}OrderBy`).join(',\n  ');

    // Only export CreateInput for objects that have @default or timestamp fields
    const objectsWithDefaults = objects.filter((o) => objectHasDefaultOrTimestamp(o, objRegistry));

    content += `
// Object interfaces (output types)
export type {
  ${objInterfaces},
} from './models';

// Object input interfaces
export type {
  ${objInputs},
} from './models';
`;

    if (objectsWithDefaults.length) {
      const objCreateInputs = objectsWithDefaults.map((o) => `${o.name}CreateInput`).join(',\n  ');
      content += `
// Object create input interfaces (fields with @default/@createdAt/@updatedAt are optional, @now fields omitted)
export type {
  ${objCreateInputs},
} from './models';
`;
    }

    content += `
// Object where types
export type {
  ${objWheres},
} from './models';

// Object select types
export type {
  ${objSelects},
} from './models';

// Object orderBy types
export type {
  ${objOrderBys},
} from './models';
`;
  }

  // Add Tuple type exports if there are tuples
  if (tuples.length > 0) {
    const tupInterfaces = tuples.map((t) => t.name).join(',\n  ');
    const tupInputs = tuples.map((t) => `${t.name}Input`).join(',\n  ');
    const tupWheres = tuples.map((t) => `${t.name}Where`).join(',\n  ');

    content += `
// Tuple types (output types - TypeScript tuple literals)
export type {
  ${tupInterfaces},
} from './models';

// Tuple input types (accepts array or object form)
export type {
  ${tupInputs},
} from './models';

// Tuple where types
export type {
  ${tupWheres},
} from './models';
`;
  }

  // Add Include exports if there are models with relations
  if (modelsWithRelations.length > 0) {
    content += `
// Include types
export type {
  ${includeExports},
} from './models';

// Include payload types (for type inference)
export type {
  ${includePayloadExports},
} from './models';
`;
  }

  // Add Relations and GetPayload exports
  content += `
// Relations types
export type {
  ${relationsExports},
} from './models';

// GetPayload types (for type inference)
export type {
  ${getPayloadExports},
} from './models';

// Client exports
export { CerialClient } from './client';
export type { ConnectionConfig, TypedDb } from './client';

// CerialQueryPromise (for $transaction type inference)
export { CerialQueryPromise } from 'cerial';
export type { QueryResultType } from 'cerial';

// NONE sentinel (for explicitly unsetting optional fields)
export { NONE } from 'cerial';
export type { CerialNone } from 'cerial';

// Registry
export { modelRegistry } from './internal';

// Type utilities from ts-toolbelt (re-exported for consumer convenience)
import type { Object as O, Any as A } from 'ts-toolbelt';
export type Compute<T> = A.Compute<T>;
export type Merge<T extends object, U extends object> = O.Merge<T, U>;
export type Optional<T extends object, K extends keyof T> = O.Optional<T, K>;

// Simplified type helper
export type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** Resolve a field's return type based on its select value (true = full type, object = sub-field select) */
export type ResolveFieldSelect<FieldType, SelectValue> = SelectValue extends true
  ? FieldType
  : SelectValue extends Record<string, any>
    ? FieldType extends (infer E)[]
      ? ApplyObjectSelect<NonNullable<E>, SelectValue>[]
      : null extends FieldType
        ? undefined extends FieldType
          ? ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | null | undefined
          : ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | null
        : undefined extends FieldType
          ? ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | undefined
          : ApplyObjectSelect<NonNullable<FieldType>, SelectValue>
    : never;

/** Recursively apply sub-field selection to an object type */
export type ApplyObjectSelect<T, S extends Record<string, any>> = {
  [K in keyof S as S[K] extends false | undefined ? never : K]: K extends keyof T
    ? ResolveFieldSelect<T[K], S[K]>
    : never;
};

/**
 * DeleteUnique return option
 * - undefined/null: RETURN NONE, always returns true (operation completed)
 * - true: RETURN BEFORE, returns boolean (true if existed, false if not)
 * - 'before': RETURN BEFORE, returns Model | null (no schema validation)
 */
export type DeleteUniqueReturn = null | undefined | true | 'before';

/**
 * Infer deleteUnique return type based on return option
 * @template T - The model type
 * @template R - The return option
 */
export type DeleteUniqueReturnType<T, R extends DeleteUniqueReturn> = R extends null | undefined
  ? boolean
  : R extends true
    ? boolean
    : R extends 'before'
      ? T | null
      : boolean;

/**
 * UpdateUnique return option
 * - undefined/null/'after': returns updated record (supports select/include)
 * - true: returns boolean (true if found and updated, false if not)
 * - 'before': returns pre-update record (no select/include support)
 */
export type UpdateUniqueReturn = null | undefined | true | 'before' | 'after';

/**
 * Infer updateUnique return type based on return option
 * @template T - The model type (or payload type with select/include)
 * @template R - The return option
 */
export type UpdateUniqueReturnType<T, R extends UpdateUniqueReturn> = R extends true ? boolean : T | null;

/**
 * Upsert return option
 * - undefined/null/'after': returns upserted record (supports select/include)
 * - true: returns boolean (true if record was created or updated)
 * - 'before': returns pre-upsert record state (null for new records, no select/include support)
 */
export type UpsertReturn = null | undefined | true | 'before' | 'after';

/**
 * Infer upsert return type based on return option (single record variant)
 * @template T - The model type (or payload type with select/include)
 * @template R - The return option
 */
export type UpsertReturnType<T, R extends UpsertReturn> = R extends true ? boolean : T | null;

/**
 * Infer upsert return type based on return option (array variant for non-unique where)
 * @template T - The model type (or payload type with select/include)
 * @template R - The return option
 */
export type UpsertArrayReturnType<T, R extends UpsertReturn> = R extends true ? boolean : T[];
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write all client files */
export async function writeClient(
  outputDir: string,
  models: ModelMetadata[],
  objects: ObjectMetadata[] = [],
  tuples: TupleMetadata[] = [],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): Promise<string[]> {
  const files: string[] = [];

  // Write client main
  files.push(await writeClientMain(outputDir, models));

  // Write tuple types (before objects and models so imports can resolve)
  for (const tuple of tuples) {
    files.push(await writeTupleTypes(outputDir, tuple, tupleRegistry, objectRegistry));
  }

  // Write object types (before models so model imports can resolve)
  for (const object of objects) {
    files.push(await writeObjectTypes(outputDir, object, objectRegistry, tupleRegistry));
  }

  // Write model types
  for (const model of models) {
    files.push(await writeModelTypes(outputDir, model, models, objectRegistry, tupleRegistry));
  }

  // Write models index (includes objects and tuples)
  files.push(await writeModelsIndex(outputDir, models, objects, tuples));

  // Write main index (includes object and tuple exports)
  files.push(await writeClientIndex(outputDir, models, objects, tuples));

  return files;
}

/** Export formatCode for use in other writers */
export { formatCode };
