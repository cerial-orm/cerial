/**
 * Column alignment for schema fields.
 * Calculates widths and formats fields in 2 or 3 columns (name | type | decorators)
 * with configurable group vs block scope.
 */

import type { FormatConfig } from './types';

/**
 * Pre-processed field data ready for alignment.
 * The caller is responsible for computing these values from the AST.
 */
export interface AlignedField {
  /** Field name (e.g., 'email') */
  name: string;
  /** Type with optional ? and [] modifiers (e.g., 'String', 'Int?', 'String[]', 'Address?', 'Relation[]') */
  typeWithModifiers: string;
  /** Pre-formatted decorators as a single string (e.g., '@unique @default("x")') */
  decoratorString: string;
  /** Indicates group boundary for alignment scope */
  hasBlankLineAfter: boolean;
  /** Trailing comment text (e.g., '# important') */
  trailingComment?: string;
  /** Private marker (e.g., '!!private') — formatted as a 4th alignment column */
  privateMarker?: string;
}

/**
 * Per-field column widths for alignment.
 */
interface ColumnWidths {
  nameWidth: number;
  typeWidth: number;
  /** Max decorator string length in the group (used for !!private 4th column alignment) */
  decoratorWidth: number;
  /** Whether any field in the group has a privateMarker */
  hasPrivate: boolean;
}

/**
 * Split fields into groups at blank-line boundaries.
 * Each group is an array of { field, index } where index is the position in the original array.
 */
function splitIntoGroups(fields: AlignedField[]): { field: AlignedField; index: number }[][] {
  const groups: { field: AlignedField; index: number }[][] = [];
  let current: { field: AlignedField; index: number }[] = [];

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    current.push({ field, index: i });

    if (field.hasBlankLineAfter && i < fields.length - 1) {
      groups.push(current);
      current = [];
    }
  }

  if (current.length) {
    groups.push(current);
  }

  return groups;
}

/**
 * Calculate the max name, type, and decorator widths for a set of fields.
 */
function maxWidths(fields: AlignedField[]): ColumnWidths {
  let nameWidth = 0;
  let typeWidth = 0;
  let decoratorWidth = 0;
  let hasPrivate = false;

  for (const field of fields) {
    if (field.name.length > nameWidth) nameWidth = field.name.length;
    if (field.typeWithModifiers.length > typeWidth) typeWidth = field.typeWithModifiers.length;
    if (field.decoratorString.length > decoratorWidth) decoratorWidth = field.decoratorString.length;
    if (field.privateMarker) hasPrivate = true;
  }

  return { nameWidth, typeWidth, decoratorWidth, hasPrivate };
}

/**
 * Calculate per-field column widths based on alignment scope.
 *
 * - `alignmentScope === 'group'`: fields are split at `hasBlankLineAfter` boundaries,
 *   widths calculated per group independently.
 * - `alignmentScope === 'block'`: single group — widths calculated across ALL fields.
 *
 * @param fields - Array of pre-processed fields
 * @param config - Resolved format config
 * @returns Array of per-field widths (same length and order as input)
 */
export function calculateColumnWidths(fields: AlignedField[], config: Required<FormatConfig>): ColumnWidths[] {
  if (!fields.length) return [];

  if (config.alignmentScope === 'block') {
    const widths = maxWidths(fields);

    return fields.map(() => ({ ...widths }));
  }

  // Group scope: split at blank-line boundaries
  const groups = splitIntoGroups(fields);
  const result: ColumnWidths[] = new Array(fields.length);

  for (const group of groups) {
    const groupFields = group.map((g) => g.field);
    const widths = maxWidths(groupFields);

    for (const { index } of group) {
      result[index] = { ...widths };
    }
  }

  return result;
}

/**
 * Format fields into aligned lines.
 *
 * - `decoratorAlignment === 'aligned'`: 3 columns —
 *   `{indent}{name.padEnd(nameWidth)} {type.padEnd(typeWidth)} {decorators}`
 * - `decoratorAlignment === 'compact'`: 2 columns —
 *   `{indent}{name.padEnd(nameWidth)} {type} {decorators}`
 *
 * Trailing whitespace is trimmed when decoratorString is empty.
 * Trailing comments are appended after decorators with 1 space.
 *
 * @param fields - Array of pre-processed fields
 * @param config - Resolved format config
 * @param indent - Indentation string (e.g., '  ', '    ', '\t')
 * @returns Array of formatted field lines (same length and order as input)
 */
export function alignFields(fields: AlignedField[], config: Required<FormatConfig>, indent: string): string[] {
  if (!fields.length) return [];

  const widths = calculateColumnWidths(fields, config);

  return fields.map((field, i) => {
    const { nameWidth, typeWidth, decoratorWidth, hasPrivate } = widths[i]!;
    const paddedName = field.name.padEnd(nameWidth);

    let line: string;

    if (config.decoratorAlignment === 'aligned') {
      // 3 columns: name type decorators
      if (field.decoratorString) {
        line = `${indent}${paddedName} ${field.typeWithModifiers.padEnd(typeWidth)} ${field.decoratorString}`;
      } else {
        line = `${indent}${paddedName} ${field.typeWithModifiers}`;
      }
    } else {
      // compact: name type decorators (type not padded)
      if (field.decoratorString) {
        line = `${indent}${paddedName} ${field.typeWithModifiers} ${field.decoratorString}`;
      } else {
        line = `${indent}${paddedName} ${field.typeWithModifiers}`;
      }
    }

    // 4th column: !!private alignment
    if (hasPrivate && field.privateMarker) {
      if (config.decoratorAlignment === 'aligned') {
        // Pad decorator column to decoratorWidth, then append !!private
        if (field.decoratorString) {
          const currentDecLen = field.decoratorString.length;
          const padding = decoratorWidth - currentDecLen;
          if (padding > 0) line += ' '.repeat(padding);
        } else {
          // No decorator — pad type to typeWidth, then add gap + decorator padding
          const typePad = typeWidth - field.typeWithModifiers.length;
          if (typePad > 0) line += ' '.repeat(typePad);
          line += ' ';
          if (decoratorWidth > 0) line += ' '.repeat(decoratorWidth);
        }
      }
      line += ` ${field.privateMarker}`;
    }

    if (field.trailingComment) {
      line = `${line} ${field.trailingComment}`;
    }

    return line;
  });
}
