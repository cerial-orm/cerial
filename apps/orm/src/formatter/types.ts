/**
 * Type definitions for schema formatting configuration and results
 */

/**
 * Configuration options for schema formatting
 */
export interface FormatConfig {
  /** Alignment scope for field decorators: group (within model/object), block (entire file), or undefined (no alignment) */
  alignmentScope?: 'group' | 'block';
  /** Blank line handling between field groups: single (one blank line), honor (preserve), collapse (remove) */
  fieldGroupBlankLines?: 'single' | 'honor' | 'collapse';
  /** Blank lines between top-level blocks (models, objects, etc.): 1, 2, or honor (preserve) */
  blockSeparation?: 1 | 2 | 'honor';
  /** Indentation size: 2, 4, or tab */
  indentSize?: 2 | 4 | 'tab';
  /** Inline construct style: single (one-liner), multi (expanded), honor (preserve) */
  inlineConstructStyle?: 'single' | 'multi' | 'honor';
  /** Decorator alignment: aligned (column-aligned), compact (no alignment) */
  decoratorAlignment?: 'aligned' | 'compact';
  /** Trailing comma in multi-line constructs */
  trailingComma?: boolean;
  /** Comment style: honor (preserve), hash (double-slash style), slash (block style) */
  commentStyle?: 'honor' | 'hash' | 'slash';
  /** Blank line before directives (@@index, @@unique): always or honor (preserve) */
  blankLineBeforeDirectives?: 'always' | 'honor';
}

/**
 * Runtime formatting options (extends FormatConfig with potential future runtime-only options)
 */
export interface FormatOptions extends FormatConfig {
  // CLI may pass additional runtime options in future
}

/**
 * Result of formatting a schema file
 */
export type FormatResult =
  | { formatted: string; changed: boolean; error?: undefined }
  | { formatted?: undefined; changed?: undefined; error: { message: string; line: number; column: number } };

/**
 * Default formatting configuration
 */
export const FORMAT_DEFAULTS: Required<FormatConfig> = {
  alignmentScope: 'group',
  fieldGroupBlankLines: 'collapse',
  blockSeparation: 2,
  indentSize: 2,
  inlineConstructStyle: 'multi',
  decoratorAlignment: 'aligned',
  trailingComma: false,
  commentStyle: 'honor',
  blankLineBeforeDirectives: 'always',
};
