/**
 * Client index writer - writes the top-level generated index.ts with all type re-exports
 */

import type { ModelMetadata, ObjectMetadata, ObjectRegistry, TupleMetadata } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { objectHasDefaultOrTimestamp, tupleHasObjectElementsDeep, tupleHasUnsetableElements } from '../types';
import { hasRelations } from './import-helpers';
import { RETURN_UTILITY_TYPES, SAFE_UNSET_TYPE, SELECT_UTILITY_TYPES } from './utility-types';

/** Write main client index file with all type exports */
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
  const unsetExports = models.map((m) => `${m.name}Unset`).join(',\n  ');
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

// Unset types (for bulk field removal)
export type {
  ${unsetExports},
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
} from './objects';

// Object input interfaces
export type {
  ${objInputs},
} from './objects';
`;

    if (objectsWithDefaults.length) {
      const objCreateInputs = objectsWithDefaults.map((o) => `${o.name}CreateInput`).join(',\n  ');
      content += `
// Object create input interfaces (fields with @default/@createdAt/@updatedAt are optional, @now fields omitted)
export type {
  ${objCreateInputs},
} from './objects';
`;
    }

    content += `
// Object where types
export type {
  ${objWheres},
} from './objects';

// Object select types
export type {
  ${objSelects},
} from './objects';

// Object orderBy types
export type {
  ${objOrderBys},
} from './objects';
`;
  }

  // Add Tuple type exports if there are tuples
  if (tuples.length > 0) {
    const tupInterfaces = tuples.map((t) => t.name).join(',\n  ');
    const tupInputs = tuples.map((t) => `${t.name}Input`).join(',\n  ');
    const tupWheres = tuples.map((t) => `${t.name}Where`).join(',\n  ');
    const tupUpdates = tuples.map((t) => `${t.name}Update`).join(',\n  ');

    // Only tuples with object elements at any depth get Select types
    const tuplesWithSelect = tuples.filter((t) => tupleHasObjectElementsDeep(t));
    // Only tuples with unsetable elements get Unset types
    const tuplesWithUnset = tuples.filter((t) => tupleHasUnsetableElements(t));

    content += `
// Tuple types (output types - TypeScript tuple literals)
export type {
  ${tupInterfaces},
} from './tuples';

// Tuple input types (accepts array or object form)
export type {
  ${tupInputs},
} from './tuples';

// Tuple where types
export type {
  ${tupWheres},
} from './tuples';

// Tuple update types (per-element update)
export type {
  ${tupUpdates},
} from './tuples';
`;

    if (tuplesWithSelect.length) {
      const tupSelects = tuplesWithSelect.map((t) => `${t.name}Select`).join(',\n  ');
      content += `
// Tuple select types (sub-field selection for tuples with object elements)
export type {
  ${tupSelects},
} from './tuples';
`;
    }

    if (tuplesWithUnset.length) {
      const tupUnsets = tuplesWithUnset.map((t) => `${t.name}Unset`).join(',\n  ');
      content += `
// Tuple unset types (per-element unset for tuples with optional elements)
export type {
  ${tupUnsets},
} from './tuples';
`;
    }
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
${SELECT_UTILITY_TYPES}
${SAFE_UNSET_TYPE}
${RETURN_UTILITY_TYPES}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}
