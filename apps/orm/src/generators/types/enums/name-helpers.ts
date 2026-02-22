/**
 * Enum name helpers - resolves type names for enum vs literal fields
 *
 * Enum fields use different naming conventions than regular literals:
 * - Literal "Status" → type Status, where StatusWhere
 * - Enum "Status"    → const StatusEnum, type StatusEnumType, where StatusEnumWhere
 *
 * These helpers check the isEnum flag and return the correct names.
 */

import type { LiteralFieldMetadata, LiteralMetadata } from '../../../types';

/** Get the TypeScript output type name for a literal or enum field */
export function getLiteralTypeName(info: LiteralFieldMetadata | LiteralMetadata): string {
  const baseName = 'literalName' in info ? info.literalName : info.name;
  if (info.isEnum) return `${baseName}EnumType`;

  return baseName;
}

/** Get the TypeScript where type name for a literal or enum field */
export function getLiteralWhereName(info: LiteralFieldMetadata | LiteralMetadata): string {
  const baseName = 'literalName' in info ? info.literalName : info.name;
  if (info.isEnum) return `${baseName}EnumWhere`;

  return `${baseName}Where`;
}

/** Get the const object name for an enum (only for enums) */
export function getEnumConstName(name: string): string {
  return `${name}Enum`;
}

/** Get the union type name for an enum (only for enums) */
export function getEnumTypeName(name: string): string {
  return `${name}EnumType`;
}

/** Get the where type name for an enum (only for enums) */
export function getEnumWhereName(name: string): string {
  return `${name}EnumWhere`;
}
