/**
 * Literal writer - writes per-literal type files to the literals/ directory
 */

import { writeFile } from 'node:fs/promises';
import type { LiteralMetadata, ObjectRegistry, TupleRegistry } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateLiteralTypes, generateLiteralWhereInterface } from '../types/literals';
import {
  generateLiteralObjectImports,
  generateLiteralTupleImports,
  getLiteralReferencedObjectNames,
  getLiteralReferencedTupleNames,
} from './import-helpers';

/** Write literal type file to literals/ directory */
export async function writeLiteralFile(
  outputDir: string,
  literal: LiteralMetadata,
  objectRegistry?: ObjectRegistry,
  tupleRegistry?: TupleRegistry,
): Promise<string> {
  const literalsDir = `${outputDir}/literals`;
  await ensureDir(literalsDir);

  const filePath = `${literalsDir}/${literal.name.toLowerCase()}.ts`;

  // Get cross-referenced object names for imports (cross-directory)
  const referencedObjects = getLiteralReferencedObjectNames(literal);
  const objectImports = generateLiteralObjectImports(referencedObjects, objectRegistry, '../objects');

  // Get cross-referenced tuple names for imports (cross-directory)
  const referencedTuples = getLiteralReferencedTupleNames(literal);
  const tupleImports = generateLiteralTupleImports(referencedTuples, tupleRegistry, '../tuples');

  // Generate all type content for this literal
  const typeCode = generateLiteralTypes(literal);
  const whereCode = generateLiteralWhereInterface(literal);

  const content = `/**
 * Generated types for ${literal.name}
 * Do not edit manually
 */

${objectImports}${tupleImports}${typeCode}

${whereCode}
`;

  const formatted = await formatCode(content, outputDir);
  await writeFile(filePath, formatted, 'utf-8');

  return filePath;
}
