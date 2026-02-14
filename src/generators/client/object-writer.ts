/**
 * Object writer - writes per-object type files to the objects/ directory
 */

import type { ObjectMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateObjectDerivedTypes, generateObjectInterfaces, generateObjectWhereInterface } from '../types';
import {
  CERIAL_ID_IMPORT,
  generateObjectImports,
  generateTupleImports,
  getObjectReferencedObjectNames,
  getObjectReferencedTupleNames,
} from './import-helpers';

/** Write object type file to objects/ directory */
export async function writeObjectTypes(
  outputDir: string,
  object: ObjectMetadata,
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): Promise<string> {
  const objectsDir = `${outputDir}/objects`;
  await ensureDir(objectsDir);

  const filePath = `${objectsDir}/${object.name.toLowerCase()}.ts`;

  // Get cross-referenced object names for imports (same directory)
  const referencedObjects = getObjectReferencedObjectNames(object);
  const objectImports = generateObjectImports(referencedObjects);

  // Get referenced tuple names for imports (cross-directory)
  const referencedTuples = getObjectReferencedTupleNames(object);
  const tupleImports = generateTupleImports(referencedTuples, tupleRegistry, '../tuples');

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
