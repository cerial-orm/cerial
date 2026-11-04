/**
 * Block printer for model and object AST nodes.
 * Formats model/object blocks with column alignment, blank line rules,
 * comment preservation, and canonical decorator ordering.
 */

import { getDecoratorEntry } from '../parser/registry';
import type { ASTCompositeDirective, ASTDecorator, ASTField, ASTModel, ASTObject, ExtendsFilter } from '../types';
import type { AlignedField } from './aligner';
import { alignFields } from './aligner';
import type { CommentMap } from './comment-attacher';
import { sortDecorators } from './rules';
import type { SourceLayout } from './layout';
import { blankLinesBetweenNodes } from './layout';
import type { FormatConfig } from './types';

/** Build indent string from config */
function buildIndent(indentSize: 2 | 4 | 'tab'): string {
  if (indentSize === 'tab') return '\t';

  return ' '.repeat(indentSize);
}

/** Capitalize first letter of a schema type name */
function capitalize(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

/**
 * Build the type-with-modifiers string from an AST field.
 *
 * - Named types (object/tuple/literal) use their definition name
 * - Record with typed IDs: `Record(int)`, `Record(string, int)`
 * - Optional: `Type?`
 * - Array: `Type[]`
 */
export function buildTypeWithModifiers(field: ASTField): string {
  let typeName: string;

  if (field.objectName) {
    typeName = field.objectName;
  } else if (field.tupleName) {
    typeName = field.tupleName;
  } else if (field.literalName) {
    typeName = field.literalName;
  } else if (field.type === 'record' && field.recordIdTypes?.length) {
    typeName = `Record(${field.recordIdTypes.join(', ')})`;
  } else {
    typeName = capitalize(field.type);
  }

  if (field.isOptional) typeName += '?';
  if (field.isArray) typeName += '[]';

  return typeName;
}

/** A duration such as `1h30m`: the one string `@default` prints bare, because quoting it changes the migration. */
const DURATION_PATTERN = /^(\d+(ns|us|µs|ms|[smhdwy]))+$/;

/** A string that would parse back as a boolean, null or number if printed bare. */
const AMBIGUOUS_BARE_PATTERN = /^(true|false|null|-?\d+(\.\d+)?)$/;

/** Print a `@default` / `@defaultAlways` value in the canonical form: single quotes, bare numbers, booleans, null and durations. */
function formatLiteral(value: unknown): string {
  if (typeof value !== 'string') return String(value);
  if (DURATION_PATTERN.test(value) && !AMBIGUOUS_BARE_PATTERN.test(value)) return value;

  // An unterminated quote survives in the value (the parser strips only a matching pair), so it prints back as written.
  // A lone quote character is not that case: bare, it would re-parse as an empty string, so it gets wrapped below.
  if (value.length > 1 && /^['"]/.test(value) && !value.endsWith(value[0]!)) return value;

  // The parser strips the outer quotes and never unescapes, so a value holding a single quote needs double quotes
  return value.includes("'") ? `"${value}"` : `'${value}'`;
}

/**
 * Print a decorator from its AST node alone, driven by the registry entry's argument shape, so a new
 * decorator needs no change here. The AST keeps the value, not its spelling, so the output is the
 * canonical form: `@sort` stores a boolean and prints `asc` / `desc`, quotes are single, `1.0` prints `1`.
 */
export function formatDecorator(decorator: ASTDecorator): string {
  const entry = getDecoratorEntry(`@${decorator.type}`);
  if (!entry) throw new Error(`No registry entry for decorator '@${decorator.type}'`);

  const { value } = decorator;
  const { args } = entry;
  switch (args.kind) {
    case 'none':
      return entry.name;
    case 'choice': {
      if (value === undefined) return entry.name;
      // A boolean stands for the first two choices in order (`@sort`: true is asc, false is desc)
      if (typeof value === 'boolean') return `${entry.name}(${args.choices[value ? 0 : 1]})`;

      return `${entry.name}(${String(value)})`;
    }
    case 'name':
      return `${entry.name}(${String(value)})`;
    case 'literal':
      return `${entry.name}(${value === undefined ? '' : formatLiteral(value)})`;
    case 'nameAndFields':
      throw new Error(`'${entry.name}' is a model directive; print it with formatDirective`);
  }
}

/** Format a composite directive from AST */
export function formatDirective(directive: ASTCompositeDirective): string {
  return `@@${directive.kind}(${directive.name}, [${directive.fields.join(', ')}]${directive.nullsNotDistinct ? ', nullsNotDistinct' : ''})`;
}

/**
 * Compute how many blank lines to emit after a field.
 *
 * - `'single'`: at most 1 blank line — preserves group boundaries from source but collapses multiples to 1
 * - `'collapse'`: 0 — removes all blank lines between fields
 * - `'honor'`: preserves the exact number of blank lines from the original source
 *
 * Without source lines to measure (no layout, or a `ts` origin) `'single'` and `'honor'` print 0.
 */
function computeBlankLinesAfter(
  mode: 'single' | 'honor' | 'collapse',
  fieldIdx: number,
  fields: ASTField[],
  layout: SourceLayout | undefined,
): number {
  // Last field never has blank lines after
  if (fieldIdx >= fields.length - 1 || mode === 'collapse') return 0;

  const count = blankLinesBetweenNodes(layout, fields[fieldIdx]!, fields[fieldIdx + 1]!, 'start') ?? 0;

  return mode === 'single' ? Math.min(count, 1) : count;
}

/** Build the extends clause string for a block header */
function buildExtendsClause(extendsTarget?: string, extendsFilter?: ExtendsFilter): string {
  if (!extendsTarget) return '';

  let clause = ` extends ${extendsTarget}`;
  if (extendsFilter) {
    const items = extendsFilter.mode === 'omit' ? extendsFilter.fields.map((f) => `!${f}`) : extendsFilter.fields;
    clause += `[${items.join(', ')}]`;
  }

  return clause;
}

/**
 * Shared block printer for model and object blocks.
 *
 * 1. Leading comments → before opening line
 * 2. Opening line: `[abstract ]{keyword} {name}[ extends {parent}[{filter}]] {` with optional trailing comment
 * 3. Fields: aligned with aligner, interleaved with blank lines and leading comments
 * 4. blankLineBeforeDirectives handling
 * 5. Composite directives with comments
 * 6. Closing `}`
 */
function printBlock(
  keyword: 'model' | 'object',
  name: string,
  fields: ASTField[],
  directives: ASTCompositeDirective[] | undefined,
  comments: CommentMap,
  config: Required<FormatConfig>,
  layout: SourceLayout | undefined,
  blockAbstract?: boolean,
  blockExtends?: string,
  blockExtendsFilter?: ExtendsFilter,
): string {
  const lines: string[] = [];
  const indent = buildIndent(config.indentSize);
  const blockKey = `${keyword}:${name}`;

  // 1. Leading comments
  const blockComments = comments.get(blockKey);
  if (blockComments?.leading.length) {
    for (const c of blockComments.leading) {
      lines.push(c.value);
    }
  }

  // 2. Opening line with optional trailing comment
  let openLine = '';
  if (blockAbstract) openLine += 'abstract ';
  openLine += `${keyword} ${name}`;
  openLine += buildExtendsClause(blockExtends, blockExtendsFilter);
  openLine += ' {';
  if (blockComments?.trailing.length) {
    openLine += ` ${blockComments.trailing[0]!.value}`;
  }
  lines.push(openLine);

  // 3. Build AlignedField[] from AST fields
  const alignedFields: AlignedField[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const typeStr = buildTypeWithModifiers(field);
    const sorted = sortDecorators(field.decorators);
    const decoratorStr = sorted.map(formatDecorator).join(' ');

    const blankLinesAfter = computeBlankLinesAfter(config.fieldGroupBlankLines, i, fields, layout);

    const fieldKey = `field:${name}.${field.name}`;
    const trailingComment = comments.get(fieldKey)?.trailing[0]?.value;

    alignedFields.push({
      name: field.name,
      typeWithModifiers: typeStr,
      decoratorString: decoratorStr,
      blankLinesAfter,
      trailingComment,
      privateMarker: field.isPrivate ? '!!private' : undefined,
    });
  }

  // 4. Call aligner to produce formatted field lines
  const fieldLines = alignFields(alignedFields, config, indent);

  // 5. Interleave field lines with leading comments and blank lines
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const fieldKey = `field:${name}.${field.name}`;

    // Leading comments for this field
    const fieldComments = comments.get(fieldKey);
    if (fieldComments?.leading.length) {
      for (const c of fieldComments.leading) {
        lines.push(`${indent}${c.value}`);
      }
    }

    // The aligned field line
    lines.push(fieldLines[i]!);

    // Blank lines after if needed (not after last field)
    if (alignedFields[i]!.blankLinesAfter > 0 && i < fields.length - 1) {
      for (let b = 0; b < alignedFields[i]!.blankLinesAfter; b++) {
        lines.push('');
      }
    }
  }

  // 6. Composite directives (@@index, @@unique)
  if (directives?.length) {
    // Blank line before directives
    let needBlank = false;
    if (fields.length) {
      if (config.blankLineBeforeDirectives === 'always') {
        needBlank = true;
      } else {
        // 'honor' mode: check source; without source lines print the 'always' form
        const gap = blankLinesBetweenNodes(layout, fields[fields.length - 1]!, directives[0]!, 'start');
        needBlank = gap === undefined || gap > 0;
      }
    }
    if (needBlank) lines.push('');

    for (const directive of directives) {
      const dirKey = `directive:${name}.@@${directive.name}`;

      // Leading comments for this directive
      const dirComments = comments.get(dirKey);
      if (dirComments?.leading.length) {
        for (const c of dirComments.leading) {
          lines.push(`${indent}${c.value}`);
        }
      }

      // Directive line with optional trailing comment
      let dirLine = `${indent}${formatDirective(directive)}`;
      if (dirComments?.trailing.length) {
        dirLine += ` ${dirComments.trailing[0]!.value}`;
      }
      lines.push(dirLine);
    }
  }

  // 7. Closing brace
  lines.push('}');

  return lines.join('\n');
}

/**
 * Print a model block with aligned fields, sorted decorators, and preserved comments.
 */
export function printModel(
  model: ASTModel,
  comments: CommentMap,
  config: Required<FormatConfig>,
  layout?: SourceLayout,
): string {
  return printBlock(
    'model',
    model.name,
    model.fields,
    model.directives,
    comments,
    config,
    layout,
    model.abstract,
    model.extends,
    model.extendsFilter,
  );
}

/**
 * Print an object block with aligned fields, sorted decorators, and preserved comments.
 */
export function printObject(
  object: ASTObject,
  comments: CommentMap,
  config: Required<FormatConfig>,
  layout?: SourceLayout,
): string {
  return printBlock(
    'object',
    object.name,
    object.fields,
    undefined,
    comments,
    config,
    layout,
    undefined,
    object.extends,
    object.extendsFilter,
  );
}
