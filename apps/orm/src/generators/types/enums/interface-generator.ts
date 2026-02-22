/**
 * Enum interface generator - generates TypeScript const objects and union types for enum definitions
 *
 * For each enum, generates:
 * - Const object (StatusEnum): { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const
 * - Union type (StatusEnumType): typeof StatusEnum[keyof typeof StatusEnum]
 *
 * Enums are string-only named constants — no separate Input type is needed.
 */

import type { LiteralMetadata } from '../../../types';
import { getEnumConstName, getEnumTypeName } from './name-helpers';

/** Generate the const object for an enum */
export function generateEnumConst(enumMeta: LiteralMetadata): string {
  const constName = getEnumConstName(enumMeta.name);
  const members = enumMeta.variants
    .map((v) => {
      if (v.kind !== 'string') return '';

      return `  ${v.value}: '${v.value}',`;
    })
    .filter(Boolean)
    .join('\n');

  return `export const ${constName} = {
${members}
} as const;`;
}

/** Generate the union type for an enum */
export function generateEnumType(enumMeta: LiteralMetadata): string {
  const constName = getEnumConstName(enumMeta.name);
  const typeName = getEnumTypeName(enumMeta.name);

  return `export type ${typeName} = typeof ${constName}[keyof typeof ${constName}];`;
}

/** Generate all types for an enum (const + union) */
export function generateEnumTypes(enumMeta: LiteralMetadata): string {
  return `${generateEnumConst(enumMeta)}\n\n${generateEnumType(enumMeta)}`;
}

/** Generate types for all enums */
export function generateAllEnumTypes(enums: LiteralMetadata[]): string {
  if (!enums.length) return '';

  return enums.map(generateEnumTypes).join('\n\n');
}
