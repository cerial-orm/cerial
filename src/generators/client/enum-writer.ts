/**
 * Enum writer - writes per-enum type files to the enums/ directory
 *
 * Each enum gets its own file containing:
 * - Const object (StatusEnum)
 * - Union type (StatusEnumType)
 * - Where interface (StatusEnumWhere)
 */

import type { LiteralMetadata } from '../../types';
import { ensureDir, formatCode } from '../shared';
import { generateEnumTypes, generateEnumWhereInterface } from '../types/enums';

/** Write enum type file to enums/ directory */
export async function writeEnumFile(outputDir: string, enumMeta: LiteralMetadata): Promise<string> {
  const enumsDir = `${outputDir}/enums`;
  await ensureDir(enumsDir);

  const filePath = `${enumsDir}/${enumMeta.name.toLowerCase()}.ts`;

  // Enums are string-only — no cross-type imports needed
  const typeCode = generateEnumTypes(enumMeta);
  const whereCode = generateEnumWhereInterface(enumMeta);

  const content = `/**
 * Generated types for ${enumMeta.name} enum
 * Do not edit manually
 */

${typeCode}

${whereCode}
`;

  const formatted = await formatCode(content, outputDir);
  await Bun.write(filePath, formatted);

  return filePath;
}
