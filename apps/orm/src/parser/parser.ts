/**
 * Main schema parser
 * Parses schema files into AST
 */

import type {
  ASTCompositeDirective,
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  ExtendsFilter,
  ParseError,
  ParseResult,
} from '../types';
import { removeComments } from '../utils/string-utils';
import { lex } from './lexer';
import { IDENTIFIER_PATTERN, tokenize } from './tokenizer';
import {
  createEnum,
  createLiteral,
  createModel,
  createObject,
  createPosition,
  createRange,
  createSchemaAST,
  createTuple,
  createTupleElement,
  withParseFile,
  extractLiteralName,
  extractObjectName,
  extractTupleName,
  parseFieldDeclaration,
  parseFieldType,
} from './types';
import { DECORATOR_REGISTRY, matchDecoratorToken } from './registry';
import type { DecoratorEntry } from './registry';
import { isMixedPickOmit, parseExtendsBracket } from './types/model/model-declaration-parser';
import { isTypeName, toleratesUnresolvedTypes, withUnresolvedTypes } from './unresolved-types';

/** Parser state */
interface ParserState {
  lines: string[];
  currentLine: number;
  models: ASTModel[];
  objects: ASTObject[];
  tuples: ASTTuple[];
  literals: ASTLiteral[];
  enums: ASTEnum[];
  errors: ParseError[];
  /** Known object names for type resolution (populated in two-pass parsing) */
  objectNames: Set<string>;
  /** Known tuple names for type resolution (populated in two-pass parsing) */
  tupleNames: Set<string>;
  /** Known literal names for type resolution (populated in two-pass parsing, includes enum names) */
  literalNames: Set<string>;
  /** Known enum names for block parsing (populated in two-pass parsing) */
  enumNames: Set<string>;
}

/** Create initial parser state */
function createState(
  source: string,
  objectNames?: Set<string>,
  tupleNames?: Set<string>,
  literalNames?: Set<string>,
  enumNames?: Set<string>,
): ParserState {
  return {
    lines: source.split('\n'),
    currentLine: 0,
    models: [],
    objects: [],
    tuples: [],
    literals: [],
    enums: [],
    errors: [],
    objectNames: objectNames ?? new Set(),
    tupleNames: tupleNames ?? new Set(),
    literalNames: literalNames ?? new Set(),
    enumNames: enumNames ?? new Set(),
  };
}

/** Get current line */
function currentLine(state: ParserState): string | undefined {
  return state.lines[state.currentLine];
}

/** Advance to next line */
function advance(state: ParserState): void {
  state.currentLine++;
}

/** Check if at end */
function isEnd(state: ParserState): boolean {
  return state.currentLine >= state.lines.length;
}

/** Add error */
function addError(state: ParserState, message: string): void {
  state.errors.push({
    message,
    position: createPosition(state.currentLine + 1, 0, 0),
  });
}

/** Check if line is a model declaration */
function isModelLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('model ') || trimmed.startsWith('abstract model ');
}

/** Check if line is an object declaration */
function isObjectLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('object ');
}

/** Check if line is a tuple declaration */
function isTupleLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('tuple ');
}

/** Extract object name from line */
function extractObjectNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^object\s+(\w+)(?:\s+extends\s+\w+(?:\[[^\]]*\])?)?\s*\{?/);

  return match ? match[1]! : null;
}

/** Extract tuple name from line */
function extractTupleNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^tuple\s+(\w+)(?:\s+extends\s+\w+(?:\[[^\]]*\])?)?\s*\{?/);

  return match ? match[1]! : null;
}

/** Check if line is a literal declaration */
function isLiteralLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('literal ');
}

/** Extract literal name from line */
function extractLiteralNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^literal\s+(\w+)(?:\s+extends\s+\w+(?:\[[^\]]*\])?)?\s*\{?/);

  return match ? match[1]! : null;
}

/** Check if line is an enum declaration */
function isEnumLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('enum ');
}

/** Extract enum name from line */
function extractEnumNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^enum\s+(\w+)(?:\s+extends\s+\w+(?:\[[^\]]*\])?)?\s*\{?/);

  return match ? match[1]! : null;
}

/** Check if line is block start */
function isBlockStart(line: string): boolean {
  return removeComments(line).trim().endsWith('{') || removeComments(line).trim() === '{';
}

/** Check if line is block end */
function isBlockEnd(line: string): boolean {
  return removeComments(line).trim() === '}';
}

/** Check if line is empty or comment only */
function isEmptyOrComment(line: string): boolean {
  const trimmed = removeComments(line).trim();
  return trimmed === '';
}

/** The model-level directive entry (@@index or @@unique) a line starts with, if any */
function findDirectiveEntry(line: string): DecoratorEntry | undefined {
  const trimmed = removeComments(line).trim();

  return [...DECORATOR_REGISTRY.values()].find((e) => e.targets.includes('model') && trimmed.startsWith(e.name));
}

/** Extract model name from line */
function extractModelName(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^(?:abstract\s+)?model\s+(\w+)/);

  return match ? match[1]! : null;
}

/** Extract extends info from a declaration line (works for any type kind) */
function extractExtendsInfo(line: string): { extends_?: string; extendsFilter?: ExtendsFilter; bracketError?: string } {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/\bextends\s+(\w+)(?:\[([^\]]*)\])?/);
  if (!match) return {};

  const result: { extends_?: string; extendsFilter?: ExtendsFilter; bracketError?: string } = { extends_: match[1]! };

  if (match[2] !== undefined) {
    const filter = parseExtendsBracket(match[2]);
    if (filter) result.extendsFilter = filter;
  }

  // Detect unmatched brackets in the extends clause.
  // Check the part after "extends" up to the block opening brace (or end of line).
  const extendsIdx = trimmed.indexOf('extends');
  if (extendsIdx >= 0) {
    const afterExtends = trimmed.slice(extendsIdx);
    const braceIdx = afterExtends.indexOf('{');
    const relevantPart = braceIdx >= 0 ? afterExtends.slice(0, braceIdx) : afterExtends;

    const hasOpen = relevantPart.includes('[');
    const hasClose = relevantPart.includes(']');

    if (hasOpen && !hasClose) {
      result.bracketError = 'Unclosed bracket in extends clause \u2014 missing closing ]';
    } else if (!hasOpen && hasClose) {
      result.bracketError = 'Unexpected ] in extends clause \u2014 missing opening [';
    }
  }

  return result;
}

/** Parse a model block */
function parseModel(state: ParserState): ASTModel | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract model name
  const modelName = extractModelName(line);
  if (!modelName) {
    addError(state, `Invalid model declaration: ${line}`);
    advance(state);
    return null;
  }

  // Extract abstract and extends info
  const trimmedLine = removeComments(line).trim();
  const isAbstract = trimmedLine.startsWith('abstract ');
  const extendsInfo = extractExtendsInfo(line);
  if (extendsInfo.bracketError) addError(state, extendsInfo.bracketError);
  // Check for mixed pick/omit in extends bracket
  const extendsMatch = trimmedLine.match(/\bextends\s+\w+\[([^\]]*)\]/);
  if (
    extendsMatch &&
    extendsMatch[1] !== undefined &&
    extendsInfo.extendsFilter === undefined &&
    isMixedPickOmit(extendsMatch[1])
  ) {
    addError(
      state,
      'Cannot mix pick and omit in extends bracket — use either [field1, field2] or [!field1, !field2], not both',
    );
  }

  const startLine = state.currentLine;
  advance(state);

  // Find the opening brace (might be on same line or next line)
  if (!isBlockStart(line)) {
    // Look for { on next line
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for model ${modelName}`);
      return null;
    }
  }

  // Parse fields and composite directives until closing brace
  const fields: ASTField[] = [];
  const directives: ASTCompositeDirective[] = [];

  while (!isEnd(state)) {
    const fieldLine = currentLine(state);
    if (fieldLine === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(fieldLine)) {
      advance(state);
      continue;
    }

    // Check for end of model
    if (isBlockEnd(fieldLine)) {
      advance(state);
      break;
    }

    // Check for composite directive (@@index or @@unique)
    const directiveEntry = findDirectiveEntry(fieldLine);
    if (directiveEntry) {
      const line = state.currentLine + 1;
      const range = createRange(createPosition(line, 0, 0), createPosition(line, fieldLine.length, 0));
      try {
        directives.push(directiveEntry.parse(fieldLine, range) as ASTCompositeDirective);
      } catch (err) {
        addError(state, (err as Error).message);
      }
      advance(state);
      continue;
    }

    // Parse field (pass objectNames and tupleNames for type resolution)
    const result = parseFieldDeclaration(
      fieldLine,
      state.currentLine + 1,
      state.objectNames,
      state.tupleNames,
      state.literalNames,
    );
    if (result.decoratorErrors?.length) {
      for (const err of result.decoratorErrors) addError(state, err);
    }
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create model
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createModel(
    modelName,
    fields,
    range,
    directives,
    isAbstract || undefined,
    extendsInfo.extends_,
    extendsInfo.extendsFilter,
  );
}

/** Parse an object block */
function parseObject(state: ParserState): ASTObject | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract object name
  const objectName = extractObjectNameFromLine(line);
  if (!objectName) {
    addError(state, `Invalid object declaration: ${line}`);
    advance(state);
    return null;
  }

  // Extract extends info
  const trimmedLine = removeComments(line).trim();
  const extendsInfo = extractExtendsInfo(line);
  if (extendsInfo.bracketError) addError(state, extendsInfo.bracketError);
  // Check for mixed pick/omit in extends bracket
  const extendsMatch = trimmedLine.match(/\bextends\s+\w+\[([^\]]*)\]/);
  if (
    extendsMatch &&
    extendsMatch[1] !== undefined &&
    extendsInfo.extendsFilter === undefined &&
    isMixedPickOmit(extendsMatch[1])
  ) {
    addError(
      state,
      'Cannot mix pick and omit in extends bracket — use either [field1, field2] or [!field1, !field2], not both',
    );
  }

  const startLine = state.currentLine;
  advance(state);

  // Find the opening brace (might be on same line or next line)
  if (!isBlockStart(line)) {
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for object ${objectName}`);
      return null;
    }
  }

  // Parse fields until closing brace
  const fields: ASTField[] = [];

  while (!isEnd(state)) {
    const fieldLine = currentLine(state);
    if (fieldLine === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(fieldLine)) {
      advance(state);
      continue;
    }

    // Check for end of object
    if (isBlockEnd(fieldLine)) {
      advance(state);
      break;
    }

    // Parse field (pass objectNames and tupleNames for type resolution)
    const result = parseFieldDeclaration(
      fieldLine,
      state.currentLine + 1,
      state.objectNames,
      state.tupleNames,
      state.literalNames,
    );
    if (result.decoratorErrors?.length) {
      for (const err of result.decoratorErrors) addError(state, err);
    }
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create object
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createObject(objectName, fields, range, extendsInfo.extends_, extendsInfo.extendsFilter);
}

/**
 * Parse a tuple element declaration.
 * Format: [name] Type[?] [@decorator...]
 * Examples:
 *   Float              → unnamed, required
 *   lat Float          → named "lat", required
 *   Float?             → unnamed, optional
 *   lat Float?         → named "lat", optional
 *   Address            → unnamed, object type
 *   Point              → unnamed, tuple type (if Point is a known tuple)
 *   Float @nullable    → unnamed, nullable (can hold null)
 *   lat Float? @nullable → named "lat", optional and nullable
 *   ts Date @createdAt → named "ts", with createdAt decorator
 */
function parseTupleElement(
  token: string,
  objectNames: Set<string>,
  tupleNames: Set<string>,
  literalNames: Set<string>,
): ASTTupleElement | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Detect and strip !!private marker
  const isPrivate = trimmed.includes('!!private');
  const withoutPrivate = isPrivate ? trimmed.replace(/\s*!!private\s*/g, '').trim() : trimmed;

  // Extract decorators from the element token
  const decoratorMatches = [...withoutPrivate.matchAll(/@\w+(?:\([^)]*\))?/g)];
  const decorators: ASTDecorator[] = [];

  for (const match of decoratorMatches) {
    const dToken = match[0];
    const range = createRange(createPosition(0, 0, 0), createPosition(0, dToken.length, 0));

    const entry = matchDecoratorToken(dToken, 'tupleElement');
    // Field entries return a decorator; only the '@@' directive entries return a composite node.
    if (entry) decorators.push(entry.parse(dToken, range) as ASTDecorator);
  }

  // Remove decorators from the token for type parsing
  const withoutDecorators = withoutPrivate.replace(/@\w+(?:\([^)]*\))?/g, '').trim();
  const parts = withoutDecorators.split(/\s+/);
  if (!parts.length) return null;

  let name: string | undefined;
  let typeStr: string;

  if (parts.length === 1) {
    // Unnamed element: just a type like "Float" or "Float?" or "Address"
    typeStr = parts[0]!;
  } else {
    // Named element: "lat Float" or "lat Float?"
    name = parts[0]!;
    typeStr = parts[1]!;
  }

  // Check optional marker
  const isOptional = typeStr.endsWith('?');
  if (isOptional) {
    typeStr = typeStr.slice(0, -1);
  }

  // Resolve type
  const fieldType =
    parseFieldType(typeStr, objectNames, tupleNames, literalNames) ??
    (toleratesUnresolvedTypes() && isTypeName(typeStr) ? 'any' : null);
  if (!fieldType) return null;

  // Extract object/tuple/literal name if applicable
  const objectName = fieldType === 'object' ? extractObjectName(typeStr) : undefined;
  const tupleName = fieldType === 'tuple' ? extractTupleName(typeStr) : undefined;
  const literalName = fieldType === 'literal' ? extractLiteralName(typeStr) : undefined;

  return createTupleElement(
    fieldType,
    isOptional,
    name,
    objectName,
    tupleName,
    decorators.length ? decorators : undefined,
    literalName,
    isPrivate || undefined,
  );
}

/** Parse a tuple block */
function parseTuple(state: ParserState): ASTTuple | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract tuple name
  const tupleName = extractTupleNameFromLine(line);
  if (!tupleName) {
    addError(state, `Invalid tuple declaration: ${line}`);
    advance(state);

    return null;
  }

  // Extract extends info
  const trimmedLine = removeComments(line).trim();
  const extendsInfo = extractExtendsInfo(line);
  if (extendsInfo.bracketError) addError(state, extendsInfo.bracketError);
  // Check for mixed pick/omit in extends bracket
  const extendsMatch = trimmedLine.match(/\bextends\s+\w+\[([^\]]*)\]/);
  if (
    extendsMatch &&
    extendsMatch[1] !== undefined &&
    extendsInfo.extendsFilter === undefined &&
    isMixedPickOmit(extendsMatch[1])
  ) {
    addError(
      state,
      'Cannot mix pick and omit in extends bracket — use either [field1, field2] or [!field1, !field2], not both',
    );
  }

  const startLine = state.currentLine;
  advance(state);

  // Check for single-line tuple: "tuple Name { elements }" — both { and } on same line
  const cleanedLine = removeComments(line);
  const singleLineBraceIdx = cleanedLine.indexOf('{');
  if (singleLineBraceIdx !== -1) {
    const afterBrace = cleanedLine.substring(singleLineBraceIdx + 1).trim();
    if (afterBrace.endsWith('}')) {
      const content = afterBrace.slice(0, -1).trim();
      const elements = parseTupleElements(content, tupleName, state);
      const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(startLine + 1, line.length, 0));

      return createTuple(tupleName, elements, range, extendsInfo.extends_, extendsInfo.extendsFilter);
    }
  }

  // Find the opening brace (might be on same line as "tuple Name {" or on next line)
  if (!isBlockStart(line)) {
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for tuple ${tupleName}`);

      return null;
    }
  }

  // Parse elements until closing brace
  // Elements are comma-separated across potentially multiple lines
  // Collect all content between { and }
  let content = '';

  // If the opening brace was on the same line as "tuple Name {", grab content after it
  const braceIdx = removeComments(line).indexOf('{');
  if (braceIdx !== -1) {
    const afterBrace = removeComments(line)
      .substring(braceIdx + 1)
      .trim();
    if (afterBrace && afterBrace !== '}') {
      content += afterBrace;
    }
  }

  while (!isEnd(state)) {
    const elementLine = currentLine(state);
    if (elementLine === undefined) break;

    const trimmedLine = removeComments(elementLine).trim();

    // Check for end of tuple
    if (trimmedLine === '}') {
      advance(state);
      break;
    }

    // Check if line ends with }
    if (trimmedLine.endsWith('}')) {
      content += (content ? ' ' : '') + trimmedLine.slice(0, -1).trim();
      advance(state);
      break;
    }

    // Skip empty lines
    if (!trimmedLine) {
      advance(state);
      continue;
    }

    content += (content ? ' ' : '') + trimmedLine;
    advance(state);
  }

  const elements = parseTupleElements(content, tupleName, state);
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createTuple(tupleName, elements, range, extendsInfo.extends_, extendsInfo.extendsFilter);
}

/**
 * Parse comma-separated tuple elements from collected content.
 * Handles: "Float, Float", "lat Float, lng Float", "String, Int?, Address"
 */
function parseTupleElements(content: string, tupleName: string, state: ParserState): ASTTupleElement[] {
  const elements: ASTTupleElement[] = [];
  if (!content.trim()) return elements;

  const parts = content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const part of parts) {
    const element = parseTupleElement(part, state.objectNames, state.tupleNames, state.literalNames);
    if (element) {
      elements.push(element);
    } else {
      addError(state, `Invalid tuple element '${part}' in tuple ${tupleName}`);
    }
  }

  return elements;
}

/** Broad type names recognized in literal blocks */
const BROAD_TYPE_NAMES: Record<string, string> = {
  String: 'String',
  Int: 'Int',
  Float: 'Float',
  Bool: 'Bool',
  Date: 'Date',
};

/**
 * Parse a single literal variant token.
 * Supports: 'string', 42, 1.5, -1, true/false, String/Int/Float/Bool/Date (broad types),
 *           and references to other literals, tuples, or objects by name.
 */
function parseLiteralVariant(token: string, state: ParserState, literalName: string): ASTLiteralVariant | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // String literal: 'value' or "value"
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    const value = trimmed.slice(1, -1);

    return { kind: 'string', value };
  }

  // Boolean literal: true / false
  if (trimmed === 'true') return { kind: 'bool', value: true };
  if (trimmed === 'false') return { kind: 'bool', value: false };

  // null is not allowed in literal blocks
  if (trimmed === 'null') {
    addError(state, `null is not allowed in literal ${literalName}. Use @nullable on the field instead.`);

    return null;
  }

  // Numeric literal: int or float (supports negative)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (trimmed.includes('.')) return { kind: 'float', value: num };

    return { kind: 'int', value: num };
  }

  // Broad type name: String, Int, Float, Bool, Date
  if (BROAD_TYPE_NAMES[trimmed]) return { kind: 'broadType', typeName: trimmed };

  // Reference to another literal (must come before tuple/object check for priority)
  if (state.literalNames.has(trimmed)) {
    if (trimmed === literalName) {
      addError(state, `Literal ${literalName} cannot reference itself`);

      return null;
    }

    return { kind: 'literalRef', literalName: trimmed };
  }

  // Reference to a tuple
  if (state.tupleNames.has(trimmed)) return { kind: 'tupleRef', tupleName: trimmed };

  // Reference to an object
  if (state.objectNames.has(trimmed)) return { kind: 'objectRef', objectName: trimmed };

  // A name TypeScript declares, in a pass that only needs the variant's identity
  if (toleratesUnresolvedTypes() && isTypeName(trimmed) && !trimmed.endsWith('[]')) {
    return { kind: 'literalRef', literalName: trimmed };
  }

  addError(state, `Unknown variant '${trimmed}' in literal ${literalName}`);

  return null;
}

/**
 * Parse comma-separated literal variants from collected content.
 */
function parseLiteralVariants(content: string, literalName: string, state: ParserState): ASTLiteralVariant[] {
  const variants: ASTLiteralVariant[] = [];
  if (!content.trim()) return variants;

  const parts = content
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  for (const part of parts) {
    const variant = parseLiteralVariant(part, state, literalName);
    if (variant) {
      variants.push(variant);
    }
  }

  return variants;
}

/** Parse a literal block */
function parseLiteral(state: ParserState): ASTLiteral | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract literal name
  const litName = extractLiteralNameFromLine(line);
  if (!litName) {
    addError(state, `Invalid literal declaration: ${line}`);
    advance(state);

    return null;
  }

  // Extract extends info
  const trimmedLine = removeComments(line).trim();
  const extendsInfo = extractExtendsInfo(line);
  if (extendsInfo.bracketError) addError(state, extendsInfo.bracketError);
  // Check for mixed pick/omit in extends bracket
  const extendsMatch = trimmedLine.match(/\bextends\s+\w+\[([^\]]*)\]/);
  if (
    extendsMatch &&
    extendsMatch[1] !== undefined &&
    extendsInfo.extendsFilter === undefined &&
    isMixedPickOmit(extendsMatch[1])
  ) {
    addError(
      state,
      'Cannot mix pick and omit in extends bracket — use either [field1, field2] or [!field1, !field2], not both',
    );
  }

  const startLine = state.currentLine;
  advance(state);

  // Check for single-line literal: "literal Name { variants }" — both { and } on same line
  const cleanedLine = removeComments(line);
  const singleLineBraceIdx = cleanedLine.indexOf('{');
  if (singleLineBraceIdx !== -1) {
    const afterBrace = cleanedLine.substring(singleLineBraceIdx + 1).trim();
    if (afterBrace.endsWith('}')) {
      const content = afterBrace.slice(0, -1).trim();
      const variants = parseLiteralVariants(content, litName, state);
      const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(startLine + 1, line.length, 0));

      return createLiteral(litName, variants, range, extendsInfo.extends_, extendsInfo.extendsFilter);
    }
  }

  // Find the opening brace
  if (!isBlockStart(line)) {
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for literal ${litName}`);

      return null;
    }
  }

  // Collect all content between { and }
  let content = '';

  const braceIdx = removeComments(line).indexOf('{');
  if (braceIdx !== -1) {
    const afterBrace = removeComments(line)
      .substring(braceIdx + 1)
      .trim();
    if (afterBrace && afterBrace !== '}') {
      content += afterBrace;
    }
  }

  while (!isEnd(state)) {
    const elementLine = currentLine(state);
    if (elementLine === undefined) break;

    const trimmedLine = removeComments(elementLine).trim();

    if (trimmedLine === '}') {
      advance(state);
      break;
    }

    if (trimmedLine.endsWith('}')) {
      content += (content ? ' ' : '') + trimmedLine.slice(0, -1).trim();
      advance(state);
      break;
    }

    if (!trimmedLine) {
      advance(state);
      continue;
    }

    content += (content ? ' ' : '') + trimmedLine;
    advance(state);
  }

  const variants = parseLiteralVariants(content, litName, state);
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createLiteral(litName, variants, range, extendsInfo.extends_, extendsInfo.extendsFilter);
}

/**
 * Parse enum values from content string.
 * Values are bare identifiers (no quotes). Supports comma-separated or newline-separated
 * (but only one style per block — detected automatically).
 */
function parseEnumValues(content: string, enumName: string, state: ParserState): string[] {
  if (!content.trim()) return [];

  // Detect separator style: if content contains commas, use comma mode
  const hasCommas = content.includes(',');

  let rawValues: string[];
  if (hasCommas) {
    rawValues = content
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  } else {
    // Newline/space separated — split by whitespace
    rawValues = content
      .split(/\s+/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  const values: string[] = [];
  for (const raw of rawValues) {
    // Remove inline comments
    const cleaned = removeComments(raw).trim();
    if (!cleaned) continue;

    // Reject quoted strings
    if (cleaned.startsWith("'") || cleaned.startsWith('"')) {
      addError(state, `Enum ${enumName}: values must be bare identifiers, not quoted strings: ${cleaned}`);
      continue;
    }

    // Reject numeric values
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
      addError(state, `Enum ${enumName}: values must be bare identifiers, not numbers: ${cleaned}`);
      continue;
    }

    // Reject boolean values
    if (cleaned === 'true' || cleaned === 'false') {
      addError(state, `Enum ${enumName}: values must be bare identifiers, not booleans: ${cleaned}`);
      continue;
    }

    // Must be a valid identifier
    if (!IDENTIFIER_PATTERN.test(cleaned)) {
      addError(state, `Enum ${enumName}: invalid value '${cleaned}'. Values must be valid identifiers`);
      continue;
    }

    values.push(cleaned);
  }

  return values;
}

/** Parse an enum block */
function parseEnum(state: ParserState): ASTEnum | null {
  const line = currentLine(state);
  if (line === undefined) return null;

  // Extract enum name
  const enumName = extractEnumNameFromLine(line);
  if (!enumName) {
    addError(state, `Invalid enum declaration: ${line}`);
    advance(state);

    return null;
  }

  // Extract extends info
  const trimmedLine = removeComments(line).trim();
  const extendsInfo = extractExtendsInfo(line);
  if (extendsInfo.bracketError) addError(state, extendsInfo.bracketError);
  // Check for mixed pick/omit in extends bracket
  const extendsMatch = trimmedLine.match(/\bextends\s+\w+\[([^\]]*)\]/);
  if (
    extendsMatch &&
    extendsMatch[1] !== undefined &&
    extendsInfo.extendsFilter === undefined &&
    isMixedPickOmit(extendsMatch[1])
  ) {
    addError(
      state,
      'Cannot mix pick and omit in extends bracket — use either [field1, field2] or [!field1, !field2], not both',
    );
  }

  const startLine = state.currentLine;
  advance(state);

  // Check for single-line enum: "enum Name { VALUE1, VALUE2 }"
  const cleanedLine = removeComments(line);
  const singleLineBraceIdx = cleanedLine.indexOf('{');
  if (singleLineBraceIdx !== -1) {
    const afterBrace = cleanedLine.substring(singleLineBraceIdx + 1).trim();
    if (afterBrace.endsWith('}')) {
      const content = afterBrace.slice(0, -1).trim();
      const values = parseEnumValues(content, enumName, state);
      const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(startLine + 1, line.length, 0));

      return createEnum(enumName, values, range, extendsInfo.extends_, extendsInfo.extendsFilter);
    }
  }

  // Find the opening brace
  if (!isBlockStart(line)) {
    while (!isEnd(state)) {
      const nextLine = currentLine(state);
      if (nextLine === undefined) break;
      if (isEmptyOrComment(nextLine)) {
        advance(state);
        continue;
      }
      if (isBlockStart(nextLine)) {
        advance(state);
        break;
      }
      addError(state, `Expected '{' for enum ${enumName}`);

      return null;
    }
  }

  // Collect all content between { and }
  let content = '';

  const braceIdx = removeComments(line).indexOf('{');
  if (braceIdx !== -1) {
    const afterBrace = removeComments(line)
      .substring(braceIdx + 1)
      .trim();
    if (afterBrace && afterBrace !== '}') {
      content += afterBrace;
    }
  }

  while (!isEnd(state)) {
    const elementLine = currentLine(state);
    if (elementLine === undefined) break;

    const trimmedLine = removeComments(elementLine).trim();

    if (trimmedLine === '}') {
      advance(state);
      break;
    }

    if (trimmedLine.endsWith('}')) {
      content += (content ? ' ' : '') + trimmedLine.slice(0, -1).trim();
      advance(state);
      break;
    }

    if (!trimmedLine) {
      advance(state);
      continue;
    }

    content += (content ? ' ' : '') + trimmedLine;
    advance(state);
  }

  const values = parseEnumValues(content, enumName, state);
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createEnum(enumName, values, range, extendsInfo.extends_, extendsInfo.extendsFilter);
}

/**
 * First pass: collect all object, model, and tuple names without parsing fields.
 * This enables forward references (objects/models/tuples defined after usage).
 */
function collectNames(source: string): {
  objectNames: Set<string>;
  modelNames: Set<string>;
  tupleNames: Set<string>;
  literalNames: Set<string>;
  enumNames: Set<string>;
} {
  const objectNames = new Set<string>();
  const modelNames = new Set<string>();
  const tupleNames = new Set<string>();
  const literalNames = new Set<string>();
  const enumNames = new Set<string>();
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = removeComments(line).trim();
    if (trimmed.startsWith('object ')) {
      const match = trimmed.match(/^object\s+(\w+)/);
      if (match) objectNames.add(match[1]!);
    } else if (trimmed.startsWith('model ') || trimmed.startsWith('abstract model ')) {
      const match = trimmed.match(/^(?:abstract\s+)?model\s+(\w+)/);
      if (match) modelNames.add(match[1]!);
    } else if (trimmed.startsWith('tuple ')) {
      const match = trimmed.match(/^tuple\s+(\w+)/);
      if (match) tupleNames.add(match[1]!);
    } else if (trimmed.startsWith('literal ')) {
      const match = trimmed.match(/^literal\s+(\w+)/);
      if (match) literalNames.add(match[1]!);
    } else if (trimmed.startsWith('enum ')) {
      const match = trimmed.match(/^enum\s+(\w+)/);
      if (match) {
        enumNames.add(match[1]!);
        // Merge enum names into literal names so parseFieldType() and parseLiteralVariant()
        // resolve enum references automatically (enum fields use type: 'literal')
        literalNames.add(match[1]!);
      }
    }
  }

  return { objectNames, modelNames, tupleNames, literalNames, enumNames };
}

/** Parse schema source (supports object/tuple/literal/enum {} blocks with two-pass name resolution) */
export function parse(
  source: string,
  externalObjectNames?: Set<string>,
  externalTupleNames?: Set<string>,
  externalLiteralNames?: Set<string>,
  externalEnumNames?: Set<string>,
  filePath?: string,
): ParseResult {
  return withParseFile(filePath, () =>
    parseSource(source, externalObjectNames, externalTupleNames, externalLiteralNames, externalEnumNames),
  );
}

/**
 * Parse for the handles of a mixed entry: a type name no `.cerial` file declares is kept as a member of
 * unresolved type instead of an error, because a TypeScript module may declare it. Only the declarations'
 * shape is meant to be read from the result; the full parse of pass 3 reports an unknown name.
 */
export function parseForHandles(
  source: string,
  externalObjectNames?: Set<string>,
  externalTupleNames?: Set<string>,
  externalLiteralNames?: Set<string>,
  externalEnumNames?: Set<string>,
  filePath?: string,
): ParseResult {
  return withUnresolvedTypes(() =>
    parse(source, externalObjectNames, externalTupleNames, externalLiteralNames, externalEnumNames, filePath),
  );
}

function parseSource(
  source: string,
  externalObjectNames?: Set<string>,
  externalTupleNames?: Set<string>,
  externalLiteralNames?: Set<string>,
  externalEnumNames?: Set<string>,
): ParseResult {
  // First pass: collect all object, tuple, literal, and enum names for forward reference resolution
  const {
    objectNames: localObjectNames,
    tupleNames: localTupleNames,
    literalNames: localLiteralNames,
    enumNames: localEnumNames,
  } = collectNames(source);

  // Merge with any external names (from other schema files)
  const allObjectNames = new Set<string>([...localObjectNames, ...(externalObjectNames ?? [])]);
  const allTupleNames = new Set<string>([...localTupleNames, ...(externalTupleNames ?? [])]);
  // Enum names are already merged into literalNames by collectNames, also merge external enum names
  const allLiteralNames = new Set<string>([
    ...localLiteralNames,
    ...(externalLiteralNames ?? []),
    ...(externalEnumNames ?? []),
  ]);
  const allEnumNames = new Set<string>([...localEnumNames, ...(externalEnumNames ?? [])]);

  // Second pass: full parse with object, tuple, literal, and enum names context
  const state = createState(source, allObjectNames, allTupleNames, allLiteralNames, allEnumNames);

  while (!isEnd(state)) {
    const line = currentLine(state);
    if (line === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(line)) {
      advance(state);
      continue;
    }

    // Parse enum (before literal since both share similar structure but 'enum' prefix is distinct)
    if (isEnumLine(line)) {
      const enumNode = parseEnum(state);
      if (enumNode) {
        state.enums.push(enumNode);
      }
      continue;
    }

    // Parse literal (before tuple/object since they share similar structure)
    if (isLiteralLine(line)) {
      const literal = parseLiteral(state);
      if (literal) {
        state.literals.push(literal);
      }
      continue;
    }

    // Parse tuple (before object to avoid tuple being mistaken for other blocks)
    if (isTupleLine(line)) {
      const tuple = parseTuple(state);
      if (tuple) {
        state.tuples.push(tuple);
      }
      continue;
    }

    // Parse object
    if (isObjectLine(line)) {
      const object = parseObject(state);
      if (object) {
        state.objects.push(object);
      }
      continue;
    }

    // Parse model
    if (isModelLine(line)) {
      const model = parseModel(state);
      if (model) {
        state.models.push(model);
      }
      continue;
    }

    // Unknown line
    advance(state);
  }

  return {
    ast: createSchemaAST(state.models, source, state.objects, state.tuples, state.literals, state.enums),
    errors: state.errors,
  };
}

/** Parse using tokenizer and lexer (alternative method) */
export function parseWithLexer(source: string, filePath?: string): ParseResult {
  return withParseFile(filePath, () => lexSource(source));
}

function lexSource(source: string): ParseResult {
  const tokens = tokenize(source);
  const lexerResult = lex(tokens);

  if (lexerResult.errors.length > 0) {
    return {
      ast: createSchemaAST([], source),
      errors: lexerResult.errors,
    };
  }

  // Convert lexemes to AST
  const models: ASTModel[] = [];
  const errors: ParseError[] = [];

  let i = 0;
  while (i < lexerResult.lexemes.length) {
    const lexeme = lexerResult.lexemes[i];
    if (!lexeme) break;

    if (lexeme.type === 'model_keyword') {
      // Next lexeme should be model name
      const nameLexeme = lexerResult.lexemes[++i];
      if (!nameLexeme || nameLexeme.type !== 'model_name') {
        errors.push({ message: 'Expected model name', position: lexeme.position });
        i++;
        continue;
      }

      const modelName = nameLexeme.value;
      const fields: ASTField[] = [];

      // Skip to block start
      while (i < lexerResult.lexemes.length) {
        const l = lexerResult.lexemes[++i];
        if (!l) break;
        if (l.type === 'block_start') break;
      }

      // Parse fields until block end
      while (i < lexerResult.lexemes.length) {
        const l = lexerResult.lexemes[++i];
        if (!l) break;
        if (l.type === 'block_end') break;

        if (l.type === 'field_name') {
          // Parse field
          const fieldName = l.value;
          let isOptional = false;
          let fieldType: string | null = null;

          // Look for optional marker and type
          let j = i + 1;
          while (j < lexerResult.lexemes.length) {
            const fl = lexerResult.lexemes[j];
            if (!fl) break;

            if (fl.type === 'optional_marker') {
              isOptional = true;
            } else if (fl.type === 'field_type') {
              fieldType = fl.value;
              i = j;
              break;
            } else if (fl.type === 'field_name' || fl.type === 'block_end') {
              break;
            }
            j++;
          }

          if (fieldType) {
            const { parseFieldType } = require('./types/field-types');
            const schemaType = parseFieldType(fieldType);
            if (schemaType) {
              const { createField, createRange, createPosition } = require('./types/ast');
              fields.push(
                createField(
                  fieldName,
                  schemaType,
                  isOptional,
                  [],
                  createRange(
                    createPosition(l.position.line, l.position.column, l.position.offset),
                    createPosition(l.position.line, l.position.column + fieldName.length, l.position.offset),
                  ),
                ),
              );
            }
          }
        }
      }

      // Create model
      const range = createRange(
        createPosition(lexeme.position.line, lexeme.position.column, lexeme.position.offset),
        createPosition(lexeme.position.line, lexeme.position.column, lexeme.position.offset),
      );

      models.push(createModel(modelName, fields, range));
    }

    i++;
  }

  return {
    ast: createSchemaAST(models, source),
    errors,
  };
}

/** Collect all object names from a source (first-pass only, for external use) */
export function collectObjectNames(source: string): Set<string> {
  return collectNames(source).objectNames;
}

/** Collect all tuple names from a source (first-pass only, for external use) */
export function collectTupleNames(source: string): Set<string> {
  return collectNames(source).tupleNames;
}

/** Collect all literal names from a source (first-pass only, for external use) */
export function collectLiteralNames(source: string): Set<string> {
  return collectNames(source).literalNames;
}

/** Collect all enum names from a source (first-pass only, for external use) */
export function collectEnumNames(source: string): Set<string> {
  return collectNames(source).enumNames;
}
