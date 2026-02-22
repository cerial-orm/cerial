/**
 * Inline construct printer for enums, literals, and tuples.
 * Formats these constructs in single-line, multi-line, or honor mode
 * with trailing comma support.
 */

import type {
  ASTDecorator,
  ASTEnum,
  ASTLiteral,
  ASTLiteralVariant,
  ASTTuple,
  ASTTupleElement,
  ExtendsFilter,
} from '../types';
import type { CommentMap } from './comment-attacher';
import type { FormatConfig } from './types';

/** Display name mapping from SchemaFieldType to schema syntax */
const TYPE_DISPLAY: Record<string, string> = {
  string: 'String',
  email: 'Email',
  int: 'Int',
  date: 'Date',
  bool: 'Bool',
  float: 'Float',
  number: 'Number',
  record: 'Record',
  relation: 'Relation',
  uuid: 'Uuid',
  duration: 'Duration',
  decimal: 'Decimal',
  bytes: 'Bytes',
  geometry: 'Geometry',
  any: 'Any',
};

/** Build extends clause for inline construct headers */
function buildInlineExtendsClause(extendsTarget?: string, extendsFilter?: ExtendsFilter): string {
  if (!extendsTarget) return '';

  let clause = ` extends ${extendsTarget}`;
  if (extendsFilter) {
    const items = extendsFilter.mode === 'omit' ? extendsFilter.fields.map((f) => `!${f}`) : extendsFilter.fields;
    clause += `[${items.join(', ')}]`;
  }

  return clause;
}

/** Get the indent string for a given config */
function getIndent(config: Required<FormatConfig>): string {
  if (config.indentSize === 'tab') return '\t';

  return ' '.repeat(config.indentSize);
}

/**
 * Format leading comments for a construct.
 * Returns the comment lines with a trailing newline, or empty string if none.
 */
function formatLeadingComments(comments: CommentMap, key: string): string {
  const entry = comments.get(key);
  if (!entry?.leading.length) return '';

  return `${entry.leading.map((t) => t.value).join('\n')}\n`;
}

/**
 * Determine if the construct should be formatted as single-line.
 *
 * - `'single'`: always single-line
 * - `'multi'`: always multi-line
 * - `'honor'`: detect from source — check if the construct was originally on one line
 *   or if the first value is on the same line as `{` (user's preference)
 */
function shouldBeSingleLine(
  config: Required<FormatConfig>,
  source: string,
  startLine: number,
  endLine: number,
): boolean {
  if (config.inlineConstructStyle === 'single') return true;
  if (config.inlineConstructStyle === 'multi') return false;

  // Honor mode: detect from source
  if (startLine === endLine) return true;

  // Multi-line range — check if first value is on the same line as {
  const sourceLines = source.split('\n');
  const lineText = sourceLines[startLine - 1]; // 1-based to 0-based
  if (!lineText) return false;

  const braceIdx = lineText.indexOf('{');
  if (braceIdx === -1) return false;

  const afterBrace = lineText.substring(braceIdx + 1).trim();

  return afterBrace.length > 0 && afterBrace !== '}';
}

/** Format a decorator value back to source text */
function formatDecoratorValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // Duration patterns — keep unquoted
    if (/^\d+[smhdwy]/.test(value)) return value;

    // Quote string values
    return `'${value}'`;
  }

  return String(value);
}

/** Format a decorator back to source text */
function formatDecorator(decorator: ASTDecorator): string {
  const name = `@${decorator.type}`;

  // Check explicitly for undefined since 0, false, null are valid values
  if (decorator.value === undefined) return name;

  return `${name}(${formatDecoratorValue(decorator.value)})`;
}

/** Format a literal variant back to source text */
function formatVariant(variant: ASTLiteralVariant): string {
  switch (variant.kind) {
    case 'string':
      return `'${variant.value}'`;
    case 'int':
      return String(variant.value);
    case 'float':
      // Preserve decimal point for whole-number floats
      return variant.value % 1 === 0 ? variant.value.toFixed(1) : String(variant.value);
    case 'bool':
      return String(variant.value);
    case 'broadType':
      return variant.typeName;
    case 'tupleRef':
      return variant.tupleName;
    case 'objectRef':
      return variant.objectName;
    case 'literalRef':
      return variant.literalName;
  }
}

/** Get display type name for a tuple element */
function getElementTypeName(element: ASTTupleElement): string {
  if (element.type === 'object' && element.objectName) return element.objectName;
  if (element.type === 'tuple' && element.tupleName) return element.tupleName;
  if (element.type === 'literal' && element.literalName) return element.literalName;

  return TYPE_DISPLAY[element.type] ?? element.type;
}

/** Format a single tuple element back to source text */
function formatTupleElement(element: ASTTupleElement): string {
  let text = '';

  if (element.name) {
    text += `${element.name} `;
  }

  text += getElementTypeName(element);

  if (element.isOptional) {
    text += '?';
  }

  if (element.decorators?.length) {
    for (const dec of element.decorators) {
      text += ` ${formatDecorator(dec)}`;
    }
  }

  if (element.isPrivate) {
    text += ' !!private';
  }

  return text;
}

/** Format items as single-line: `keyword Name [extends ...] { item1, item2, item3 }` */
function formatSingleLine(keyword: string, name: string, items: string[], extendsClause = ''): string {
  if (!items.length) return `${keyword} ${name}${extendsClause} {}`;

  return `${keyword} ${name}${extendsClause} { ${items.join(', ')} }`;
}

/** Format items as multi-line with indentation and optional trailing comma */
function formatMultiLine(
  keyword: string,
  name: string,
  items: string[],
  indent: string,
  trailingComma: boolean,
  extendsClause = '',
): string {
  const lines = [`${keyword} ${name}${extendsClause} {`];

  for (let i = 0; i < items.length; i++) {
    const isLast = i === items.length - 1;
    const comma = isLast ? (trailingComma ? ',' : '') : ',';
    lines.push(`${indent}${items[i]}${comma}`);
  }

  lines.push('}');

  return lines.join('\n');
}

/**
 * Format an enum AST node.
 *
 * Enum values are bare identifiers formatted as comma-separated items.
 * Supports single-line, multi-line, and honor mode with trailing comma.
 */
export function printEnum(node: ASTEnum, comments: CommentMap, config: Required<FormatConfig>, source: string): string {
  const leading = formatLeadingComments(comments, `enum:${node.name}`);
  const items = node.values;
  const singleLine = shouldBeSingleLine(config, source, node.range.start.line, node.range.end.line);
  const extendsClause = buildInlineExtendsClause(node.extends, node.extendsFilter);

  let body: string;
  if (singleLine) {
    body = formatSingleLine('enum', node.name, items, extendsClause);
  } else {
    body = formatMultiLine('enum', node.name, items, getIndent(config), config.trailingComma, extendsClause);
  }

  return leading + body;
}

/**
 * Format a literal AST node.
 *
 * Literal variants are reconstructed from AST data (strings re-quoted,
 * numbers/booleans as-is, refs by name). Supports single-line, multi-line,
 * and honor mode with trailing comma.
 */
export function printLiteral(
  node: ASTLiteral,
  comments: CommentMap,
  config: Required<FormatConfig>,
  source: string,
): string {
  const leading = formatLeadingComments(comments, `literal:${node.name}`);
  const items = node.variants.map(formatVariant);
  const singleLine = shouldBeSingleLine(config, source, node.range.start.line, node.range.end.line);
  const extendsClause = buildInlineExtendsClause(node.extends, node.extendsFilter);

  let body: string;
  if (singleLine) {
    body = formatSingleLine('literal', node.name, items, extendsClause);
  } else {
    body = formatMultiLine('literal', node.name, items, getIndent(config), config.trailingComma, extendsClause);
  }

  return leading + body;
}

/**
 * Format a tuple AST node.
 *
 * Tuple elements include optional name, type (with `?` modifier), and decorators.
 * Supports single-line, multi-line, and honor mode with trailing comma.
 */
export function printTuple(
  node: ASTTuple,
  comments: CommentMap,
  config: Required<FormatConfig>,
  source: string,
): string {
  const leading = formatLeadingComments(comments, `tuple:${node.name}`);
  const items = node.elements.map(formatTupleElement);
  const singleLine = shouldBeSingleLine(config, source, node.range.start.line, node.range.end.line);
  const extendsClause = buildInlineExtendsClause(node.extends, node.extendsFilter);

  let body: string;
  if (singleLine) {
    body = formatSingleLine('tuple', node.name, items, extendsClause);
  } else {
    body = formatMultiLine('tuple', node.name, items, getIndent(config), config.trailingComma, extendsClause);
  }

  return leading + body;
}
