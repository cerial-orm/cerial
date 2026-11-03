/**
 * Object writer - writes per-object type files to the objects/ directory
 */

import type { TypeFilesMode } from '../../cli/config/types';
import { writeFile } from 'node:fs/promises';
import type { LiteralRegistry, ObjectMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateObjectDerivedTypes, generateObjectInterfaces, generateObjectWhereInterface } from '../types';
import {
  AT_LEAST_ONE_IMPORT,
  CERIAL_ANY_IMPORT,
  CERIAL_BYTES_IMPORT,
  CERIAL_DECIMAL_IMPORT,
  CERIAL_DURATION_IMPORT,
  CERIAL_GEOMETRY_IMPORT,
  CERIAL_ID_IMPORT,
  CERIAL_UUID_IMPORT,
  generateEnumImports,
  generateLiteralImports,
  generateObjectImports,
  generateTupleImports,
  getObjectReferencedEnumNames,
  getObjectReferencedLiteralNames,
  getObjectReferencedObjectNames,
  getObjectReferencedTupleNames,
  objectHasAnyFields,
  objectHasBytesFields,
  objectHasDecimalFields,
  objectHasDurationFields,
  objectHasGeometryFields,
  objectHasUuidFields,
} from './import-helpers';
import { typeFileName } from './type-file';

/** Write object type file to objects/ directory */
export async function writeObjectTypes(
  outputDir: string,
  object: ObjectMetadata,
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
  literalRegistry?: LiteralRegistry,
  typeFiles: TypeFilesMode = 'ts',
): Promise<string> {
  const objectsDir = `${outputDir}/objects`;
  await ensureDir(objectsDir);

  const filePath = `${objectsDir}/${typeFileName(object.name.toLowerCase(), typeFiles)}`;

  // Get cross-referenced object names for imports (same directory)
  const referencedObjects = getObjectReferencedObjectNames(object);
  const objectImports = generateObjectImports(referencedObjects);

  // Get referenced tuple names for imports (cross-directory)
  const referencedTuples = getObjectReferencedTupleNames(object);
  const tupleImports = generateTupleImports(referencedTuples, tupleRegistry, '../tuples');

  // Get referenced literal names for imports (cross-directory, excludes enums)
  const referencedLiterals = getObjectReferencedLiteralNames(object);
  const literalImports = generateLiteralImports(referencedLiterals, literalRegistry, '../literals');

  // Get referenced enum names for imports (cross-directory)
  const referencedEnums = getObjectReferencedEnumNames(object);
  const enumImports = generateEnumImports(referencedEnums, '../enums');

  const hasRecordFields = object.fields.some((f) => f.type === 'record');
  const cerialIdImport = hasRecordFields ? `${CERIAL_ID_IMPORT}\n` : '';
  const hasUuidFields = objectHasUuidFields(object, objectRegistry);
  const cerialUuidImport = hasUuidFields ? `${CERIAL_UUID_IMPORT}\n` : '';
  const hasDurationFields = objectHasDurationFields(object, objectRegistry);
  const cerialDurationImport = hasDurationFields ? `${CERIAL_DURATION_IMPORT}\n` : '';
  const hasDecimalFields = objectHasDecimalFields(object, objectRegistry);
  const cerialDecimalImport = hasDecimalFields ? `${CERIAL_DECIMAL_IMPORT}\n` : '';
  const hasBytesFields = objectHasBytesFields(object, objectRegistry);
  const cerialBytesImport = hasBytesFields ? `${CERIAL_BYTES_IMPORT}\n` : '';
  const hasGeometryFields = objectHasGeometryFields(object, objectRegistry);
  const cerialGeometryImport = hasGeometryFields ? `${CERIAL_GEOMETRY_IMPORT}\n` : '';
  const hasAnyFields = objectHasAnyFields(object, objectRegistry);
  const cerialAnyImport = hasAnyFields ? `${CERIAL_ANY_IMPORT}\n` : '';
  // Only a Select of two or more fields is built with AtLeastOne
  const atLeastOneImport = object.fields.length > 1 ? `${AT_LEAST_ONE_IMPORT}\n` : '';

  // Generate all type content for this object
  const interfaceCode = generateObjectInterfaces([object], objectRegistry, tupleRegistry);
  const whereCode = generateObjectWhereInterface(object, objectRegistry);
  const derivedCode = generateObjectDerivedTypes(object);

  const content = `/**
 * Generated types for ${object.name}
 * Do not edit manually
 */

${cerialIdImport}${cerialUuidImport}${cerialDurationImport}${cerialDecimalImport}${cerialBytesImport}${cerialGeometryImport}${cerialAnyImport}${atLeastOneImport}${objectImports}${tupleImports}${literalImports}${enumImports}${interfaceCode}

${whereCode}

${derivedCode}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}
