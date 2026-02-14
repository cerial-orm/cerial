/**
 * Model writer - writes per-model type files to the models/ directory
 */

import type { ModelMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateAllDerivedTypes, generateInterfaces, generateModelTypes, generateWhereTypes } from '../types';
import { generateFindUniqueWhereType } from '../types/method-generator';
import {
  CERIAL_ID_IMPORT,
  NONE_IMPORT,
  TS_TOOLBELT_IMPORT,
  UNIQUE_TYPES_IMPORT,
  collectTupleObjectNamesDeep,
  collectTupleTupleNamesDeep,
  createRegistryFromModels,
  generateObjectImports,
  generateRelatedImports,
  generateTupleImports,
  getReferencedObjectNames,
  getReferencedTupleNames,
  getRelatedModelNames,
  needsCerialNone,
} from './import-helpers';

/** Write model type file to models/ directory */
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

  // Get referenced object names for imports (direct object fields + objects from tuple array-forms)
  const referencedObjectsSet = new Set(getReferencedObjectNames(model));

  // Single (non-array) tuple fields generate inline array-form types in the Update type
  // that may reference object Input types (e.g., `[string, DeepMidObjInput]`)
  for (const field of model.fields) {
    if (field.type === 'tuple' && field.tupleInfo && !field.isArray) {
      for (const name of collectTupleObjectNamesDeep(field.tupleInfo)) {
        referencedObjectsSet.add(name);
      }
    }
  }

  const referencedObjects = Array.from(referencedObjectsSet);
  const objectImports = generateObjectImports(referencedObjects, objectRegistry, '../objects');

  // Get referenced tuple names for imports (direct tuple fields + nested tuples from array-forms)
  const referencedTuplesSet = new Set(getReferencedTupleNames(model));

  // Single (non-array) tuple fields generate inline array-form types in the Update type
  // that may reference nested tuple Input types (e.g., `[string, DeepMidTupleInput]`)
  for (const field of model.fields) {
    if (field.type === 'tuple' && field.tupleInfo && !field.isArray) {
      for (const name of collectTupleTupleNamesDeep(field.tupleInfo)) {
        referencedTuplesSet.add(name);
      }
    }
  }

  const referencedTuples = Array.from(referencedTuplesSet);
  const tupleImports = generateTupleImports(referencedTuples, tupleRegistry, '../tuples');

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
