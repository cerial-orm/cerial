/**
 * Canonical decorator ordering and configuration resolution for schema formatting
 */

import type { ASTDecorator } from '../types/parser.types';
import type { FormatConfig } from './types';
import { FORMAT_DEFAULTS } from './types';

/**
 * Canonical sort order for all decorators.
 * Lower numbers = earlier in the decorator list.
 * Unknown decorators are sorted to the end (defensive).
 */
export const DECORATOR_ORDER: Record<string, number> = {
  // Identity
  id: 0,

  // Constraints
  unique: 1,
  index: 2,

  // Relations
  field: 3,
  model: 4,
  key: 5,
  onDelete: 6,

  // Value generation
  default: 7,
  defaultAlways: 8,
  createdAt: 9,
  updatedAt: 10,
  now: 11,

  // UUID generation
  uuid: 12,
  uuid4: 13,
  uuid7: 14,

  // Write behavior
  readonly: 15,

  // Object modifiers
  flexible: 16,

  // Array modifiers
  distinct: 17,
  sort: 18,
  set: 19,

  // Geometry subtypes
  point: 20,
  line: 21,
  polygon: 22,
  multipoint: 23,
  multiline: 24,
  multipolygon: 25,
  geoCollection: 26,

  // Nullability (ALWAYS last)
  nullable: 27,
};

/**
 * Sort decorators in canonical order.
 * Returns a new array with decorators sorted by DECORATOR_ORDER.
 * Preserves all decorator properties (value, range).
 * Unknown decorators are placed at the end (after all known decorators).
 *
 * @param decorators - Array of decorators to sort
 * @returns New array of sorted decorators
 */
export function sortDecorators(decorators: ASTDecorator[]): ASTDecorator[] {
  return [...decorators].sort((a, b) => {
    const orderA = DECORATOR_ORDER[a.type] ?? 1000;
    const orderB = DECORATOR_ORDER[b.type] ?? 1000;

    return orderA - orderB;
  });
}

/**
 * Resolve user config with defaults.
 * Merges user-provided config with FORMAT_DEFAULTS, filtering out undefined values.
 *
 * @param user - User-provided config (optional)
 * @returns Complete config with all required fields
 */
export function resolveConfig(user?: FormatConfig): Required<FormatConfig> {
  if (!user) {
    return FORMAT_DEFAULTS;
  }

  return {
    alignmentScope: user.alignmentScope ?? FORMAT_DEFAULTS.alignmentScope,
    fieldGroupBlankLines: user.fieldGroupBlankLines ?? FORMAT_DEFAULTS.fieldGroupBlankLines,
    blockSeparation: user.blockSeparation ?? FORMAT_DEFAULTS.blockSeparation,
    indentSize: user.indentSize ?? FORMAT_DEFAULTS.indentSize,
    inlineConstructStyle: user.inlineConstructStyle ?? FORMAT_DEFAULTS.inlineConstructStyle,
    decoratorAlignment: user.decoratorAlignment ?? FORMAT_DEFAULTS.decoratorAlignment,
    trailingComma: user.trailingComma ?? FORMAT_DEFAULTS.trailingComma,
    commentStyle: user.commentStyle ?? FORMAT_DEFAULTS.commentStyle,
    blankLineBeforeDirectives: user.blankLineBeforeDirectives ?? FORMAT_DEFAULTS.blankLineBeforeDirectives,
  };
}
