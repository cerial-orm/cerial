/**
 * Client writer - writes generated client files
 */

import { mkdir } from 'node:fs/promises';
import * as prettier from 'prettier';
import type { ModelMetadata } from '../../types';
import { generateAllDerivedTypes, generateInterfaces, generateModelTypes, generateWhereTypes } from '../types';
import { generateFindUniqueWhereType } from '../types/method-generator';
import { generateConnectionExports } from './connection-template';
import { generateClientTemplate } from './template';

/** ts-toolbelt import for generated types */
const TS_TOOLBELT_IMPORT = `import type { Object as O, Any as A } from 'ts-toolbelt';`;

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

/** Check if a model has any relation fields */
function hasRelations(model: ModelMetadata): boolean {
  return model.fields.some((f) => f.type === 'relation' && f.relationInfo);
}

/** Generate import statements for related model types */
function generateRelatedImports(relatedModels: string[], allModels: ModelMetadata[]): string {
  if (relatedModels.length === 0) return '';

  const imports = relatedModels.map((name) => {
    const fileName = name.toLowerCase();
    const relatedModel = allModels.find((m) => m.name === name);
    const hasInclude = relatedModel && hasRelations(relatedModel);

    // Import base model interface + Where, Select, OrderBy + Include/IncludePayload if exists
    const baseImports = [name, `${name}Where`, `${name}Select`, `${name}OrderBy`];

    if (hasInclude) {
      baseImports.push(`${name}Include`, `Get${name}IncludePayload`);
    }

    return `import type { ${baseImports.join(', ')} } from './${fileName}';`;
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
): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/${model.name.toLowerCase()}.ts`;

  // Get related model names for imports
  const relatedModels = getRelatedModelNames(model);
  const relatedImports = generateRelatedImports(relatedModels, allModels);

  // Create registry for Include type generation
  const registry = createRegistryFromModels(allModels);

  // Generate all type content for this model
  const interfaceCode = generateInterfaces([model]);
  const whereCode = generateWhereTypes([model]);
  const findUniqueWhereCode = generateFindUniqueWhereType(model);
  const derivedCode = generateAllDerivedTypes([model], registry);
  const modelCode = generateModelTypes([model]);

  const content = `/**
 * Generated types for ${model.name}
 * Do not edit manually
 */

${TS_TOOLBELT_IMPORT}
${relatedImports}${interfaceCode}

${whereCode}

${findUniqueWhereCode ? `${findUniqueWhereCode}\n\n` : ''}${derivedCode}

${modelCode}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write models index file */
export async function writeModelsIndex(outputDir: string, models: ModelMetadata[]): Promise<string> {
  const modelsDir = `${outputDir}/models`;
  await ensureDir(modelsDir);

  const filePath = `${modelsDir}/index.ts`;
  const exports = models.map((m) => `export * from './${m.name.toLowerCase()}';`).join('\n');

  const content = `/**
 * Generated model exports
 * Do not edit manually
 */

${exports}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write main client index file */
export async function writeClientIndex(outputDir: string, models: ModelMetadata[]): Promise<string> {
  await ensureDir(outputDir);

  const filePath = `${outputDir}/index.ts`;

  const modelExports = models.map((m) => m.name).join(',\n  ');
  const createExports = models.map((m) => `${m.name}Create`).join(',\n  ');
  const updateExports = models.map((m) => `${m.name}Update`).join(',\n  ');
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

// Model interfaces
export type {
  ${modelExports},
} from './models';

// Create types
export type {
  ${createExports},
} from './models';

// Update types
export type {
  ${updateExports},
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

// Registry
export { modelRegistry } from './internal';

// Type utilities from ts-toolbelt (re-exported for consumer convenience)
import type { Object as O, Any as A } from 'ts-toolbelt';
export type Compute<T> = A.Compute<T>;
export type Merge<T extends object, U extends object> = O.Merge<T, U>;
export type Optional<T extends object, K extends keyof T> = O.Optional<T, K>;

// Simplified type helper
export type Simplify<T> = { [K in keyof T]: T[K] } & {};
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}

/** Write all client files */
export async function writeClient(outputDir: string, models: ModelMetadata[]): Promise<string[]> {
  const files: string[] = [];

  // Write client main
  files.push(await writeClientMain(outputDir, models));

  // Write model types
  for (const model of models) {
    files.push(await writeModelTypes(outputDir, model, models));
  }

  // Write models index
  files.push(await writeModelsIndex(outputDir, models));

  // Write main index
  files.push(await writeClientIndex(outputDir, models));

  return files;
}

/** Export formatCode for use in other writers */
export { formatCode };
