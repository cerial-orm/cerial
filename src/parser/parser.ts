/**
 * Main schema parser
 * Parses schema files into AST
 */

import type {
  SchemaAST,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  ASTLiteral,
  ASTLiteralVariant,
  ASTField,
  ASTDecorator,
  ASTCompositeDirective,
  ParseResult,
  ParseError,
  SchemaFieldType,
} from '../types';
import { tokenize } from './tokenizer';
import { lex, type LexerResult } from './lexer';
import {
  createSchemaAST,
  createModel,
  createCompositeDirective,
  createDecorator,
  createObject,
  createTuple,
  createTupleElement,
  createLiteral,
  createRange,
  createPosition,
  parseFieldDeclaration,
  parseFieldType,
  modelNameToTableName,
  extractObjectName,
  extractTupleName,
  extractLiteralName,
  extractDefaultValue,
} from './types';
import { extractDefaultAlwaysValue } from './types/field-decorators';
import { removeComments } from '../utils/string-utils';

/** Parser state */
interface ParserState {
  lines: string[];
  currentLine: number;
  models: ASTModel[];
  objects: ASTObject[];
  tuples: ASTTuple[];
  literals: ASTLiteral[];
  errors: ParseError[];
  /** Known object names for type resolution (populated in two-pass parsing) */
  objectNames: Set<string>;
  /** Known tuple names for type resolution (populated in two-pass parsing) */
  tupleNames: Set<string>;
  /** Known literal names for type resolution (populated in two-pass parsing) */
  literalNames: Set<string>;
}

/** Create initial parser state */
function createState(
  source: string,
  objectNames?: Set<string>,
  tupleNames?: Set<string>,
  literalNames?: Set<string>,
): ParserState {
  return {
    lines: source.split('\n'),
    currentLine: 0,
    models: [],
    objects: [],
    tuples: [],
    literals: [],
    errors: [],
    objectNames: objectNames ?? new Set(),
    tupleNames: tupleNames ?? new Set(),
    literalNames: literalNames ?? new Set(),
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
  return trimmed.startsWith('model ');
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
  const match = trimmed.match(/^object\s+(\w+)/);

  return match ? match[1]! : null;
}

/** Extract tuple name from line */
function extractTupleNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^tuple\s+(\w+)/);

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
  const match = trimmed.match(/^literal\s+(\w+)/);

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

/** Check if line is a composite directive (@@index or @@unique) */
function isCompositeDirectiveLine(line: string): boolean {
  const trimmed = removeComments(line).trim();

  return trimmed.startsWith('@@index') || trimmed.startsWith('@@unique');
}

/**
 * Parse a composite directive line.
 * Syntax: @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])
 * Fields support dot notation: address.city
 */
function parseCompositeDirective(
  line: string,
  lineNumber: number,
): { directive: ASTCompositeDirective | null; error: string | null } {
  const trimmed = removeComments(line).trim();

  // Match: @@index(name, [field1, field2]) or @@unique(name, [field1, field2])
  const match = trimmed.match(/^@@(index|unique)\(\s*(\w+)\s*,\s*\[([^\]]+)\]\s*\)$/);
  if (!match) {
    return {
      directive: null,
      error: `Invalid composite directive syntax: ${trimmed}. Expected @@index(name, [field1, field2, ...]) or @@unique(name, [field1, field2, ...])`,
    };
  }

  const kind = match[1] as 'index' | 'unique';
  const name = match[2]!;
  const fieldsStr = match[3]!;

  // Parse field list (comma-separated, supports dot notation like address.city)
  const fields = fieldsStr
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);

  if (!fields.length) {
    return { directive: null, error: `Composite directive @@${kind}("${name}") must specify at least one field` };
  }

  const range = createRange(createPosition(lineNumber, 0, 0), createPosition(lineNumber, trimmed.length, 0));

  return { directive: createCompositeDirective(kind, name, fields, range), error: null };
}

/** Extract model name from line */
function extractModelName(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^model\s+(\w+)/);
  return match ? match[1]! : null;
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
    if (isCompositeDirectiveLine(fieldLine)) {
      const result = parseCompositeDirective(fieldLine, state.currentLine + 1);
      if (result.error) {
        addError(state, result.error);
      } else if (result.directive) {
        directives.push(result.directive);
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
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create model
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createModel(modelName, fields, range, directives);
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
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create object
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createObject(objectName, fields, range);
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

  // Extract decorators from the element token
  const decoratorMatches = [...trimmed.matchAll(/@\w+(?:\([^)]*\))?/g)];
  const decorators: ASTDecorator[] = [];

  for (const match of decoratorMatches) {
    const dToken = match[0];
    const range = createRange(createPosition(0, 0, 0), createPosition(0, dToken.length, 0));

    if (dToken === '@nullable') {
      decorators.push(createDecorator('nullable', range));
    } else if (dToken === '@createdAt') {
      decorators.push(createDecorator('createdAt', range));
    } else if (dToken === '@updatedAt') {
      decorators.push(createDecorator('updatedAt', range));
    } else if (dToken.startsWith('@default(')) {
      const value = extractDefaultValue(dToken);
      decorators.push(createDecorator('default', range, value));
    } else if (dToken.startsWith('@defaultAlways(')) {
      const value = extractDefaultAlwaysValue(dToken);
      decorators.push(createDecorator('defaultAlways', range, value));
    }
  }

  // Remove decorators from the token for type parsing
  const withoutDecorators = trimmed.replace(/@\w+(?:\([^)]*\))?/g, '').trim();
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
  const fieldType = parseFieldType(typeStr, objectNames, tupleNames, literalNames);
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
      const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

      return createTuple(tupleName, elements, range);
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

  return createTuple(tupleName, elements, range);
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
      const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

      return createLiteral(litName, variants, range);
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

  return createLiteral(litName, variants, range);
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
} {
  const objectNames = new Set<string>();
  const modelNames = new Set<string>();
  const tupleNames = new Set<string>();
  const literalNames = new Set<string>();
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = removeComments(line).trim();
    if (trimmed.startsWith('object ')) {
      const match = trimmed.match(/^object\s+(\w+)/);
      if (match) objectNames.add(match[1]!);
    } else if (trimmed.startsWith('model ')) {
      const match = trimmed.match(/^model\s+(\w+)/);
      if (match) modelNames.add(match[1]!);
    } else if (trimmed.startsWith('tuple ')) {
      const match = trimmed.match(/^tuple\s+(\w+)/);
      if (match) tupleNames.add(match[1]!);
    } else if (trimmed.startsWith('literal ')) {
      const match = trimmed.match(/^literal\s+(\w+)/);
      if (match) literalNames.add(match[1]!);
    }
  }

  return { objectNames, modelNames, tupleNames, literalNames };
}

/** Parse schema source (supports object/tuple/literal {} blocks with two-pass name resolution) */
export function parse(
  source: string,
  externalObjectNames?: Set<string>,
  externalTupleNames?: Set<string>,
  externalLiteralNames?: Set<string>,
): ParseResult {
  // First pass: collect all object, tuple, and literal names for forward reference resolution
  const {
    objectNames: localObjectNames,
    tupleNames: localTupleNames,
    literalNames: localLiteralNames,
  } = collectNames(source);

  // Merge with any external names (from other schema files)
  const allObjectNames = new Set<string>([...localObjectNames, ...(externalObjectNames ?? [])]);
  const allTupleNames = new Set<string>([...localTupleNames, ...(externalTupleNames ?? [])]);
  const allLiteralNames = new Set<string>([...localLiteralNames, ...(externalLiteralNames ?? [])]);

  // Second pass: full parse with object, tuple, and literal names context
  const state = createState(source, allObjectNames, allTupleNames, allLiteralNames);

  while (!isEnd(state)) {
    const line = currentLine(state);
    if (line === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(line)) {
      advance(state);
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
    ast: createSchemaAST(state.models, source, state.objects, state.tuples, state.literals),
    errors: state.errors,
  };
}

/** Parse using tokenizer and lexer (alternative method) */
export function parseWithLexer(source: string): ParseResult {
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

/**
 * Resolve a dot-notation field reference against a model and its object definitions.
 * Returns the field type if valid, or null if invalid.
 * Examples: "email" → resolves to email field; "address.city" → resolves to city subfield of Address object
 */
function resolveCompositeField(
  fieldRef: string,
  model: ASTModel,
  ast: SchemaAST,
): {
  valid: boolean;
  isOptional: boolean;
  isRelation: boolean;
  isArray: boolean;
  isId: boolean;
  parentOverlap?: string;
} {
  const parts = fieldRef.split('.');

  // Top-level field lookup
  const topField = model.fields.find((f) => f.name === parts[0]);
  if (!topField) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

  // Single-part reference (e.g., "email", "authorId")
  if (parts.length === 1) {
    return {
      valid: true,
      isOptional: topField.isOptional,
      isRelation: topField.type === 'relation',
      isArray: !!topField.isArray,
      isId: topField.decorators.some((d) => d.type === 'id'),
    };
  }

  // Dot-notation: must be an object type field
  if (topField.type !== 'object' || !topField.objectName) {
    return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
  }

  // Walk the dot-notation path through nested objects
  let currentObjectName = topField.objectName;
  for (let i = 1; i < parts.length; i++) {
    const objectDef = ast.objects.find((o) => o.name === currentObjectName);
    if (!objectDef) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

    const subField = objectDef.fields.find((f) => f.name === parts[i]);
    if (!subField) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

    // If there are more parts, this must also be an object type
    if (i < parts.length - 1) {
      if (subField.type !== 'object' || !subField.objectName) {
        return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
      }
      currentObjectName = subField.objectName;
    } else {
      // Final field in the dot path
      return {
        valid: true,
        isOptional: topField.isOptional || subField.isOptional,
        isRelation: false,
        isArray: !!subField.isArray,
        isId: false,
      };
    }
  }

  return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
}

/** Validate composite directives on a model */
function validateCompositeDirectives(
  model: ASTModel,
  ast: SchemaAST,
  errors: ParseError[],
  globalNames: Map<string, string>,
): void {
  for (const directive of model.directives ?? []) {
    // 1. Global name uniqueness
    const existingModel = globalNames.get(directive.name);
    if (existingModel) {
      errors.push({
        message: `Composite directive name '${directive.name}' is already used in model ${existingModel}. Names must be unique across all models.`,
        position: directive.range.start,
      });
    } else {
      globalNames.set(directive.name, model.name);
    }

    // 2. Minimum 2 fields
    if (directive.fields.length < 2) {
      errors.push({
        message: `Composite @@${directive.kind}("${directive.name}") must have at least 2 fields. Use field-level @${directive.kind} for single fields.`,
        position: directive.range.start,
      });
    }

    // 3. Check for duplicate fields within directive
    const seenFields = new Set<string>();
    for (const fieldRef of directive.fields) {
      if (seenFields.has(fieldRef)) {
        errors.push({
          message: `Duplicate field '${fieldRef}' in composite @@${directive.kind}("${directive.name}")`,
          position: directive.range.start,
        });
      }
      seenFields.add(fieldRef);
    }

    // 4. Validate each field reference
    const topLevelObjectFields = new Set<string>(); // track whole-object fields for overlap check
    const dotNotationRoots = new Set<string>(); // track dot-notation root fields for overlap check

    for (const fieldRef of directive.fields) {
      const resolved = resolveCompositeField(fieldRef, model, ast);

      if (!resolved.valid) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") does not exist in model ${model.name}`,
          position: directive.range.start,
        });
        continue;
      }

      // Check: @id fields disallowed
      if (resolved.isId) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") has @id and cannot be part of a composite. @id fields are already unique.`,
          position: directive.range.start,
        });
      }

      // Check: relation fields disallowed
      if (resolved.isRelation) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") is a Relation (virtual field) and cannot be indexed. Use the Record field instead.`,
          position: directive.range.start,
        });
      }

      // Check: array fields disallowed
      if (resolved.isArray) {
        errors.push({
          message: `Field '${fieldRef}' in composite @@${directive.kind}("${directive.name}") is an array field and cannot be part of a composite index.`,
          position: directive.range.start,
        });
      }

      // Track for overlap check
      const parts = fieldRef.split('.');
      if (parts.length === 1) {
        // Check if it's an object-type field (whole object reference)
        const topField = model.fields.find((f) => f.name === fieldRef);
        if (topField?.type === 'object') {
          topLevelObjectFields.add(fieldRef);
        }
      } else {
        dotNotationRoots.add(parts[0]!);
      }
    }

    // 5. Check for object + own subfield overlap (redundant)
    for (const objField of topLevelObjectFields) {
      if (dotNotationRoots.has(objField)) {
        errors.push({
          message: `Composite @@${directive.kind}("${directive.name}") references both '${objField}' (whole object) and its subfield(s). This is redundant — use either the whole object or specific subfields.`,
          position: directive.range.start,
        });
      }
    }

    // 6. Warn about optional fields in @@unique composites
    if (directive.kind === 'unique') {
      const optionalFields: string[] = [];
      for (const fieldRef of directive.fields) {
        const resolved = resolveCompositeField(fieldRef, model, ast);
        if (resolved.valid && resolved.isOptional) {
          optionalFields.push(fieldRef);
        }
      }

      if (optionalFields.length) {
        // This is a warning, not an error — we still allow it
        // The warning is logged during generation, not added to parse errors
        // Store the info on the directive for later use (via the AST)
      }
    }
  }
}

/** Validate parsed schema */
export function validateSchema(ast: SchemaAST): ParseError[] {
  const errors: ParseError[] = [];

  // Global composite directive name uniqueness
  const globalCompositeNames = new Map<string, string>(); // name -> modelName

  // Check for duplicate model names
  const modelNames = new Set<string>();
  for (const model of ast.models) {
    if (modelNames.has(model.name)) {
      errors.push({
        message: `Duplicate model name: ${model.name}`,
        position: model.range.start,
      });
    }
    modelNames.add(model.name);

    // Check for duplicate field names within model
    const fieldNames = new Set<string>();
    let idFieldCount = 0;

    for (const field of model.fields) {
      if (fieldNames.has(field.name)) {
        errors.push({
          message: `Duplicate field name '${field.name}' in model ${model.name}`,
          position: field.range.start,
        });
      }
      fieldNames.add(field.name);

      // Check for @id decorator (only one allowed per model)
      const hasIdDecorator = field.decorators.some((d) => d.type === 'id');
      if (hasIdDecorator) {
        idFieldCount++;
        if (idFieldCount > 1) {
          errors.push({
            message: `Multiple @id decorators in model ${model.name}. Only one @id field is allowed per model.`,
            position: field.range.start,
          });
        }
      }

      // Check @index and @unique mutual exclusivity
      const hasIndex = field.decorators.some((d) => d.type === 'index');
      const hasUnique = field.decorators.some((d) => d.type === 'unique');
      if (hasIndex && hasUnique) {
        errors.push({
          message: `Field '${field.name}' in model ${model.name} cannot have both @index and @unique. Use one or the other.`,
          position: field.range.start,
        });
      }

      // Check @unique on array fields — SurrealDB indexes array elements individually,
      // so UNIQUE means "no two records can share any element", not whole-array uniqueness.
      if (hasUnique && field.isArray) {
        errors.push({
          message: `Field '${field.name}' in model ${model.name} is an array field and cannot have @unique. SurrealDB enforces uniqueness per element, not per array — use @index for per-element lookups instead.`,
          position: field.range.start,
        });
      }
    }

    // Validate composite directives
    validateCompositeDirectives(model, ast, errors, globalCompositeNames);
  }

  // Check for duplicate object names
  const objectNames = new Set<string>();
  for (const object of ast.objects) {
    if (objectNames.has(object.name)) {
      errors.push({
        message: `Duplicate object name: ${object.name}`,
        position: object.range.start,
      });
    }
    // Check for name collision with model names
    if (modelNames.has(object.name)) {
      errors.push({
        message: `Object name '${object.name}' conflicts with model name`,
        position: object.range.start,
      });
    }
    objectNames.add(object.name);

    // Check for duplicate field names within object
    const fieldNames = new Set<string>();
    for (const field of object.fields) {
      if (fieldNames.has(field.name)) {
        errors.push({
          message: `Duplicate field name '${field.name}' in object ${object.name}`,
          position: field.range.start,
        });
      }
      fieldNames.add(field.name);

      // Objects cannot have 'id' field
      if (field.name === 'id') {
        errors.push({
          message: `Objects cannot have an 'id' field`,
          position: field.range.start,
        });
      }

      // Objects cannot have Relation fields
      if (field.type === 'relation') {
        errors.push({
          message: `Objects cannot have Relation fields`,
          position: field.range.start,
        });
      }

      // Validate decorators on object fields — only specific decorators are allowed
      const ALLOWED_OBJECT_DECORATORS = new Set([
        'default',
        'defaultAlways',
        'createdAt',
        'updatedAt',
        'index',
        'unique',
        'distinct',
        'sort',
        'flexible',
        'readonly',
        'nullable',
      ]);
      for (const dec of field.decorators) {
        if (!ALLOWED_OBJECT_DECORATORS.has(dec.type)) {
          if (dec.type === 'now') {
            errors.push({
              message: `@now is not allowed on object fields. SurrealDB requires COMPUTED fields to be top-level. Use @createdAt or @updatedAt instead.`,
              position: field.range.start,
            });
          } else {
            errors.push({
              message: `Decorator @${dec.type} is not allowed on object fields. Allowed: @default, @defaultAlways, @createdAt, @updatedAt, @index, @unique, @distinct, @sort, @flexible, @readonly, @nullable.`,
              position: field.range.start,
            });
          }
        }
      }

      // Validate @index and @unique mutual exclusivity on object fields
      const hasObjIndex = field.decorators.some((d) => d.type === 'index');
      const hasObjUnique = field.decorators.some((d) => d.type === 'unique');
      if (hasObjIndex && hasObjUnique) {
        errors.push({
          message: `Field '${field.name}' in object ${object.name} cannot have both @index and @unique. Use one or the other.`,
          position: field.range.start,
        });
      }

      // Validate @unique on array object fields — per-element semantics are surprising
      if (hasObjUnique && field.isArray) {
        errors.push({
          message: `Field '${field.name}' in object ${object.name} is an array field and cannot have @unique. SurrealDB enforces uniqueness per element, not per array — use @index for per-element lookups instead.`,
          position: field.range.start,
        });
      }

      // Validate @distinct and @sort are only on array fields within objects
      const hasDistinct = field.decorators.some((d) => d.type === 'distinct');
      const hasSort = field.decorators.some((d) => d.type === 'sort');
      if ((hasDistinct || hasSort) && !field.isArray) {
        errors.push({
          message: `Decorator @${hasDistinct ? 'distinct' : 'sort'} on field '${field.name}' in object ${object.name} is only allowed on array fields.`,
          position: field.range.start,
        });
      }

      // Self-referencing object fields must be optional or array
      if (field.type === 'object' && field.objectName === object.name) {
        if (!field.isOptional && !field.isArray) {
          errors.push({
            message: `Self-referencing object fields must be optional or array`,
            position: field.range.start,
          });
        }
      }
    }
  }

  // Check for duplicate tuple names and validate tuple definitions
  const tupleNames = new Set<string>();
  for (const tuple of ast.tuples) {
    if (tupleNames.has(tuple.name)) {
      errors.push({
        message: `Duplicate tuple name: ${tuple.name}`,
        position: tuple.range.start,
      });
    }
    // Check for name collision with model names
    if (modelNames.has(tuple.name)) {
      errors.push({
        message: `Tuple name '${tuple.name}' conflicts with model name`,
        position: tuple.range.start,
      });
    }
    // Check for name collision with object names
    if (objectNames.has(tuple.name)) {
      errors.push({
        message: `Tuple name '${tuple.name}' conflicts with object name`,
        position: tuple.range.start,
      });
    }
    tupleNames.add(tuple.name);

    // Tuple must have at least one element
    if (!tuple.elements.length) {
      errors.push({
        message: `Tuple ${tuple.name} must have at least one element`,
        position: tuple.range.start,
      });
    }

    // Validate individual elements
    const elementNames = new Set<string>();
    for (let i = 0; i < tuple.elements.length; i++) {
      const element = tuple.elements[i]!;

      // Check for duplicate named elements
      if (element.name) {
        if (elementNames.has(element.name)) {
          errors.push({
            message: `Duplicate element name '${element.name}' in tuple ${tuple.name}`,
            position: tuple.range.start,
          });
        }
        elementNames.add(element.name);
      }

      // Tuples cannot contain Relation elements
      if (element.type === 'relation') {
        errors.push({
          message: `Tuple elements cannot be Relation type in tuple ${tuple.name}`,
          position: tuple.range.start,
        });
      }

      // Tuples cannot contain Record elements
      if (element.type === 'record') {
        errors.push({
          message: `Tuple elements cannot be Record type in tuple ${tuple.name}`,
          position: tuple.range.start,
        });
      }

      // Self-referencing tuple elements must be optional
      if (element.type === 'tuple' && element.tupleName === tuple.name) {
        if (!element.isOptional) {
          errors.push({
            message: `Self-referencing tuple element in tuple ${tuple.name} must be optional to avoid infinite recursion`,
            position: tuple.range.start,
          });
        }
      }

      // Object-type elements must reference a valid object
      if (element.type === 'object' && element.objectName) {
        const objExists = ast.objects.some((o) => o.name === element.objectName);
        if (!objExists) {
          errors.push({
            message: `Tuple element references unknown object '${element.objectName}' in tuple ${tuple.name}`,
            position: tuple.range.start,
          });
        }
      }

      // Tuple-type elements must reference a valid tuple (other than self, already handled)
      if (element.type === 'tuple' && element.tupleName && element.tupleName !== tuple.name) {
        const tupExists = ast.tuples.some((t) => t.name === element.tupleName);
        if (!tupExists) {
          errors.push({
            message: `Tuple element references unknown tuple '${element.tupleName}' in tuple ${tuple.name}`,
            position: tuple.range.start,
          });
        }
      }
    }
  }

  // Check for duplicate literal names and validate literal definitions
  const literalNames = new Set<string>();
  for (const literal of ast.literals) {
    if (literalNames.has(literal.name)) {
      errors.push({
        message: `Duplicate literal name: ${literal.name}`,
        position: literal.range.start,
      });
    }
    // Check for name collision with model names
    if (modelNames.has(literal.name)) {
      errors.push({
        message: `Literal name '${literal.name}' conflicts with model name`,
        position: literal.range.start,
      });
    }
    // Check for name collision with object names
    if (objectNames.has(literal.name)) {
      errors.push({
        message: `Literal name '${literal.name}' conflicts with object name`,
        position: literal.range.start,
      });
    }
    // Check for name collision with tuple names
    if (tupleNames.has(literal.name)) {
      errors.push({
        message: `Literal name '${literal.name}' conflicts with tuple name`,
        position: literal.range.start,
      });
    }
    literalNames.add(literal.name);

    // Literal must have at least one variant
    if (!literal.variants.length) {
      errors.push({
        message: `Literal ${literal.name} must have at least one variant`,
        position: literal.range.start,
      });
    }

    // Check for duplicate variants
    const seenVariants = new Set<string>();
    for (const variant of literal.variants) {
      let key: string;
      switch (variant.kind) {
        case 'string':
          key = `string:${variant.value}`;
          break;
        case 'int':
          key = `int:${variant.value}`;
          break;
        case 'float':
          key = `float:${variant.value}`;
          break;
        case 'bool':
          key = `bool:${variant.value}`;
          break;
        case 'broadType':
          key = `broadType:${variant.typeName}`;
          break;
        case 'tupleRef':
          key = `tupleRef:${variant.tupleName}`;
          break;
        case 'objectRef':
          key = `objectRef:${variant.objectName}`;
          break;
        case 'literalRef':
          key = `literalRef:${variant.literalName}`;
          break;
      }
      if (seenVariants.has(key)) {
        errors.push({
          message: `Duplicate variant in literal ${literal.name}`,
          position: literal.range.start,
        });
      }
      seenVariants.add(key);
    }

    // Validate references
    for (const variant of literal.variants) {
      if (variant.kind === 'tupleRef') {
        const tup = ast.tuples.find((t) => t.name === variant.tupleName);
        if (!tup) {
          errors.push({
            message: `Literal ${literal.name} references unknown tuple '${variant.tupleName}'`,
            position: literal.range.start,
          });
        } else {
          // Validate tuple has no nested object/tuple/complex-literal elements
          for (const el of tup.elements) {
            const elemName = el.name ?? `element[${tup.elements.indexOf(el)}]`;
            if (el.type === 'object') {
              errors.push({
                message: `Tuple '${variant.tupleName}' referenced in literal '${literal.name}' contains object element '${elemName}'. Only primitive and simple literal-typed elements are allowed in literal-referenced tuples`,
                position: literal.range.start,
              });
            }
            if (el.type === 'tuple') {
              errors.push({
                message: `Tuple '${variant.tupleName}' referenced in literal '${literal.name}' contains nested tuple element '${elemName}'. Only primitive and simple literal-typed elements are allowed in literal-referenced tuples`,
                position: literal.range.start,
              });
            }
            if (el.type === 'literal' && el.literalName) {
              const referencedLit = ast.literals.find((l) => l.name === el.literalName);
              if (referencedLit) {
                const hasComplexVariant = referencedLit.variants.some(
                  (v) => v.kind === 'tupleRef' || v.kind === 'objectRef' || v.kind === 'literalRef',
                );
                if (hasComplexVariant) {
                  errors.push({
                    message: `Tuple '${variant.tupleName}' referenced in literal '${literal.name}' contains literal element '${elemName}' referencing '${el.literalName}' which has non-primitive variants. Nested literals must only contain primitive variants`,
                    position: literal.range.start,
                  });
                }
              }
            }
          }
        }
      }
      if (variant.kind === 'objectRef') {
        const obj = ast.objects.find((o) => o.name === variant.objectName);
        if (!obj) {
          errors.push({
            message: `Literal ${literal.name} references unknown object '${variant.objectName}'`,
            position: literal.range.start,
          });
        } else {
          // Validate object has no nested object/tuple/complex-literal fields
          for (const field of obj.fields) {
            if (field.type === 'object') {
              errors.push({
                message: `Object '${variant.objectName}' referenced in literal '${literal.name}' contains object field '${field.name}'. Only primitive and simple literal-typed fields are allowed in literal-referenced objects`,
                position: literal.range.start,
              });
            }
            if (field.type === 'tuple') {
              errors.push({
                message: `Object '${variant.objectName}' referenced in literal '${literal.name}' contains tuple field '${field.name}'. Only primitive and simple literal-typed fields are allowed in literal-referenced objects`,
                position: literal.range.start,
              });
            }
            if (field.type === 'literal' && field.literalName) {
              const referencedLit = ast.literals.find((l) => l.name === field.literalName);
              if (referencedLit) {
                const hasComplexVariant = referencedLit.variants.some(
                  (v) => v.kind === 'tupleRef' || v.kind === 'objectRef' || v.kind === 'literalRef',
                );
                if (hasComplexVariant) {
                  errors.push({
                    message: `Object '${variant.objectName}' referenced in literal '${literal.name}' contains literal field '${field.name}' referencing '${field.literalName}' which has non-primitive variants. Nested literals must only contain primitive variants`,
                    position: literal.range.start,
                  });
                }
              }
            }
          }
        }
      }
      if (variant.kind === 'literalRef') {
        const litExists = ast.literals.some((l) => l.name === variant.literalName);
        if (!litExists) {
          errors.push({
            message: `Literal ${literal.name} references unknown literal '${variant.literalName}'`,
            position: literal.range.start,
          });
        }
      }
    }
  }

  // Detect circular literal references
  function hasCircularLiteralRef(name: string, visited: Set<string>): boolean {
    if (visited.has(name)) return true;
    visited.add(name);
    const lit = ast.literals.find((l) => l.name === name);
    if (!lit) return false;
    for (const v of lit.variants) {
      if (v.kind === 'literalRef') {
        if (hasCircularLiteralRef(v.literalName, new Set(visited))) return true;
      }
    }

    return false;
  }

  for (const literal of ast.literals) {
    const refs = literal.variants.filter((v) => v.kind === 'literalRef');
    for (const ref of refs) {
      if (ref.kind === 'literalRef') {
        if (hasCircularLiteralRef(ref.literalName, new Set([literal.name]))) {
          errors.push({
            message: `Circular literal reference detected: ${literal.name} -> ${ref.literalName}`,
            position: literal.range.start,
          });
        }
      }
    }
  }

  // Validate literal-typed fields reference valid literals
  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type === 'literal' && field.literalName) {
        const litExists = ast.literals.some((l) => l.name === field.literalName);
        if (!litExists) {
          errors.push({
            message: `Field '${field.name}' in model ${model.name} references unknown literal '${field.literalName}'`,
            position: field.range.start,
          });
        }
      }
    }
  }

  for (const object of ast.objects) {
    for (const field of object.fields) {
      if (field.type === 'literal' && field.literalName) {
        const litExists = ast.literals.some((l) => l.name === field.literalName);
        if (!litExists) {
          errors.push({
            message: `Field '${field.name}' in object ${object.name} references unknown literal '${field.literalName}'`,
            position: field.range.start,
          });
        }
      }
    }
  }

  for (const tuple of ast.tuples) {
    for (const element of tuple.elements) {
      if (element.type === 'literal' && element.literalName) {
        const litExists = ast.literals.some((l) => l.name === element.literalName);
        if (!litExists) {
          errors.push({
            message: `Tuple element references unknown literal '${element.literalName}' in tuple ${tuple.name}`,
            position: tuple.range.start,
          });
        }
      }
    }
  }

  return errors;
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
