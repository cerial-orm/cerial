/**
 * Enum where type generator - generates Where types for enum definitions
 *
 * Enums are string-only, so they always get:
 * - eq, neq, in, notIn (standard operators)
 * - contains, startsWith, endsWith (string operators)
 */

import type { LiteralMetadata } from '../../../types';
import { getEnumTypeName, getEnumWhereName } from './name-helpers';

/** Generate Where interface for an enum definition */
export function generateEnumWhereInterface(enumMeta: LiteralMetadata): string {
  const typeName = getEnumTypeName(enumMeta.name);
  const whereName = getEnumWhereName(enumMeta.name);

  const fields = [
    `  eq?: ${typeName};`,
    `  neq?: ${typeName};`,
    `  in?: ${typeName}[];`,
    `  notIn?: ${typeName}[];`,
    `  contains?: string;`,
    `  startsWith?: string;`,
    `  endsWith?: string;`,
  ];

  return `export interface ${whereName} {
${fields.join('\n')}
}`;
}

/** Generate Where types for all enums */
export function generateAllEnumWhereTypes(enums: LiteralMetadata[]): string {
  if (!enums.length) return '';

  return enums.map(generateEnumWhereInterface).join('\n\n');
}
