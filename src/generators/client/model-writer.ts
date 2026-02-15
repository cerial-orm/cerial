/**
 * Model writer - writes per-model type files to the models/ directory
 */

import type { LiteralRegistry, ModelMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateAllDerivedTypes, generateInterfaces, generateModelTypes, generateWhereTypes } from '../types';
import { generateFindUniqueWhereType } from '../types/method-generator';
import {
  CERIAL_BYTES_IMPORT,
  CERIAL_DECIMAL_IMPORT,
  CERIAL_DURATION_IMPORT,
  CERIAL_ID_IMPORT,
  CERIAL_UUID_IMPORT,
  NONE_IMPORT,
  TS_TOOLBELT_IMPORT,
  UNIQUE_TYPES_IMPORT,
  collectTupleObjectNamesDeep,
  collectTupleTupleNamesDeep,
  createRegistryFromModels,
  generateEnumImports,
  generateLiteralImports,
  generateObjectImports,
  generateRelatedImports,
  generateTupleImports,
  getModelReferencedEnumNames,
  getModelReferencedLiteralNames,
  getReferencedObjectNames,
  getReferencedTupleNames,
  getRelatedModelNames,
  modelHasBytesFields,
  modelHasDecimalFields,
  modelHasDurationFields,
  modelHasUuidFields,
  needsCerialNone,
} from './import-helpers';

/** Write model type file to models/ directory */
export async function writeModelTypes(
  outputDir: string,
  model: ModelMetadata,
  allModels: ModelMetadata[],
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
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

  // Get referenced literal names for imports (excludes enums)
  const referencedLiterals = getModelReferencedLiteralNames(model);
  const literalImports = generateLiteralImports(referencedLiterals, literalRegistry, '../literals');

  // Get referenced enum names for imports
  const referencedEnums = getModelReferencedEnumNames(model);
  const enumImports = generateEnumImports(referencedEnums, '../enums');

  // Create registry for Include type generation
  const registry = createRegistryFromModels(allModels);

  const noneImport = needsCerialNone(model) ? `\n${NONE_IMPORT}` : '';
  const uuidImport = modelHasUuidFields(model) ? `\n${CERIAL_UUID_IMPORT}` : '';
  const durationImport = modelHasDurationFields(model) ? `\n${CERIAL_DURATION_IMPORT}` : '';
  const decimalImport = modelHasDecimalFields(model) ? `\n${CERIAL_DECIMAL_IMPORT}` : '';
  const bytesImport = modelHasBytesFields(model) ? `\n${CERIAL_BYTES_IMPORT}` : '';

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
${CERIAL_ID_IMPORT}${noneImport}${uuidImport}${durationImport}${decimalImport}${bytesImport}
${UNIQUE_TYPES_IMPORT}
${relatedImports}${objectImports}${tupleImports}${literalImports}${enumImports}${interfaceCode}

${whereCode}

${findUniqueWhereCode ? `${findUniqueWhereCode}\n\n` : ''}${derivedCode}

${modelCode}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}
