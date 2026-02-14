/**
 * Literal interface generator - generates TypeScript types for literal definitions
 *
 * Generates one or two types for each literal:
 * - Output type (Status): Union of literal variant values (always generated)
 * - Input type (PayloadInput): Same but with Input variants for tupleRef/objectRef (only when needed)
 */

import type { LiteralMetadata, ResolvedLiteralVariant } from '../../../types';

/** Map a broad type name to its TypeScript equivalent */
function broadTypeToTs(typeName: string): string {
  const map: Record<string, string> = {
    String: 'string',
    Int: 'number',
    Float: 'number',
    Bool: 'boolean',
    Date: 'Date',
  };

  return map[typeName] ?? 'unknown';
}

/** Map a single variant to its TypeScript output type string */
function variantToOutputType(variant: ResolvedLiteralVariant): string {
  switch (variant.kind) {
    case 'string':
      return `'${variant.value}'`;
    case 'int':
    case 'float':
      return `${variant.value}`;
    case 'bool':
      return `${variant.value}`;
    case 'broadType':
      return broadTypeToTs(variant.typeName);
    case 'tupleRef':
      return variant.tupleName;
    case 'objectRef':
      return variant.objectName;
  }
}

/** Map a single variant to its TypeScript input type string */
function variantToInputType(variant: ResolvedLiteralVariant): string {
  switch (variant.kind) {
    case 'string':
      return `'${variant.value}'`;
    case 'int':
    case 'float':
      return `${variant.value}`;
    case 'bool':
      return `${variant.value}`;
    case 'broadType':
      return broadTypeToTs(variant.typeName);
    case 'tupleRef':
      return `${variant.tupleName}Input`;
    case 'objectRef':
      return `${variant.objectName}Input`;
  }
}

/** Check if a literal needs a separate Input type (has tupleRef or objectRef variants) */
export function literalNeedsInputType(literal: LiteralMetadata): boolean {
  return literal.variants.some((v) => v.kind === 'tupleRef' || v.kind === 'objectRef');
}

/** Generate the output type string for a literal */
export function generateLiteralType(literal: LiteralMetadata): string {
  const members = literal.variants.map(variantToOutputType).join(' | ');

  return `export type ${literal.name} = ${members};`;
}

/** Generate the input type string for a literal */
export function generateLiteralInputType(literal: LiteralMetadata): string {
  const members = literal.variants.map(variantToInputType).join(' | ');

  return `export type ${literal.name}Input = ${members};`;
}

/** Generate all types for a literal (output + optional input) */
export function generateLiteralTypes(literal: LiteralMetadata): string {
  const parts = [generateLiteralType(literal)];

  if (literalNeedsInputType(literal)) {
    parts.push(generateLiteralInputType(literal));
  }

  return parts.join('\n\n');
}

/** Generate types for all literals */
export function generateAllLiteralTypes(literals: LiteralMetadata[]): string {
  if (!literals.length) return '';

  return literals.map(generateLiteralTypes).join('\n\n');
}
