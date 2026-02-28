/**
 * Tuple writer - writes per-tuple type files to the tuples/ directory
 */

import { writeFile } from 'node:fs/promises';
import type { LiteralRegistry, ObjectRegistry, TupleMetadata, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import {
  generateTupleInterfaces,
  generateTupleSelectType,
  generateTupleUnsetType,
  generateTupleUpdateType,
  generateTupleWhereInterface,
} from '../types';
import {
  CERIAL_BYTES_IMPORT,
  CERIAL_DECIMAL_IMPORT,
  CERIAL_DURATION_IMPORT,
  CERIAL_GEOMETRY_IMPORT,
  CERIAL_UUID_IMPORT,
  collectTupleObjectNamesDeep,
  collectTupleTupleNamesDeep,
  generateEnumImports,
  generateLiteralImports,
  generateObjectImports,
  generateTupleImports,
  getTupleReferencedEnumNames,
  getTupleReferencedLiteralNames,
  getTupleReferencedObjectNames,
  getTupleReferencedTupleNames,
  NONE_IMPORT,
  tupleHasBytesElements,
  tupleHasDecimalElements,
  tupleHasDurationElements,
  tupleHasGeometryElements,
  tupleHasUuidElements,
} from './import-helpers';

/** Write tuple type file to tuples/ directory */
export async function writeTupleTypes(
  outputDir: string,
  tuple: TupleMetadata,
  tupleRegistry?: TupleRegistry,
  objectRegistry?: ObjectRegistry,
  literalRegistry?: LiteralRegistry,
): Promise<string> {
  const tuplesDir = `${outputDir}/tuples`;
  await ensureDir(tuplesDir);

  const filePath = `${tuplesDir}/${tuple.name.toLowerCase()}.ts`;

  // Get cross-referenced object names for imports (cross-directory)
  const referencedObjectsSet = new Set(getTupleReferencedObjectNames(tuple));

  // The Update type's array-form for nested tuple elements may reference object Input types
  // from deeper levels (e.g., DeepOuterTupleUpdate references DeepMidObjInput via array-form)
  for (const element of tuple.elements) {
    if (element.type === 'tuple' && element.tupleInfo) {
      for (const name of collectTupleObjectNamesDeep(element.tupleInfo)) {
        referencedObjectsSet.add(name);
      }
    }
  }

  const referencedObjects = Array.from(referencedObjectsSet);
  const objectImports = generateObjectImports(referencedObjects, objectRegistry, '../objects');

  // Get cross-referenced tuple names for imports (same directory)
  const referencedTuplesSet = new Set(getTupleReferencedTupleNames(tuple));

  // The Update type's array-form for nested tuple elements may reference deeper tuple Input types
  for (const element of tuple.elements) {
    if (element.type === 'tuple' && element.tupleInfo) {
      for (const name of collectTupleTupleNamesDeep(element.tupleInfo)) {
        if (name !== tuple.name) referencedTuplesSet.add(name);
      }
    }
  }

  const referencedTuples = Array.from(referencedTuplesSet);
  const tupleImports = generateTupleImports(referencedTuples, tupleRegistry);

  // Get referenced literal names for imports (cross-directory, excludes enums)
  const referencedLiterals = getTupleReferencedLiteralNames(tuple);
  const literalImports = generateLiteralImports(referencedLiterals, literalRegistry, '../literals');

  // Get referenced enum names for imports (cross-directory)
  const referencedEnums = getTupleReferencedEnumNames(tuple);
  const enumImports = generateEnumImports(referencedEnums, '../enums');

  // Generate all type content for this tuple
  const interfaceCode = generateTupleInterfaces([tuple], tupleRegistry, objectRegistry);
  const whereCode = generateTupleWhereInterface(tuple, tupleRegistry, objectRegistry);
  const updateCode = generateTupleUpdateType(tuple);
  const selectCode = generateTupleSelectType(tuple);
  const unsetCode = generateTupleUnsetType(tuple);

  const needsNone = tuple.elements.some((e) => e.isOptional);
  const noneImport = needsNone ? `${NONE_IMPORT}\n` : '';
  const uuidImport = tupleHasUuidElements(tuple) ? `${CERIAL_UUID_IMPORT}\n` : '';
  const durationImport = tupleHasDurationElements(tuple) ? `${CERIAL_DURATION_IMPORT}\n` : '';
  const decimalImport = tupleHasDecimalElements(tuple) ? `${CERIAL_DECIMAL_IMPORT}\n` : '';
  const bytesImport = tupleHasBytesElements(tuple) ? `${CERIAL_BYTES_IMPORT}\n` : '';
  const geometryImport = tupleHasGeometryElements(tuple) ? `${CERIAL_GEOMETRY_IMPORT}\n` : '';

  const content = `/**
 * Generated types for ${tuple.name}
 * Do not edit manually
 */

${noneImport}${uuidImport}${durationImport}${decimalImport}${bytesImport}${geometryImport}${objectImports}${tupleImports}${literalImports}${enumImports}${interfaceCode}

${whereCode}

${updateCode}
${selectCode ? `\n${selectCode}\n` : ''}${unsetCode ? `\n${unsetCode}\n` : ''}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}
