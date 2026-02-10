/**
 * Main schema parser
 * Parses schema files into AST
 */

import type { SchemaAST, ASTModel, ASTObject, ASTField, ParseResult, ParseError } from '../types';
import { tokenize } from './tokenizer';
import { lex, type LexerResult } from './lexer';
import {
  createSchemaAST,
  createModel,
  createObject,
  createRange,
  createPosition,
  parseFieldDeclaration,
  modelNameToTableName,
} from './types';
import { removeComments } from '../utils/string-utils';

/** Parser state */
interface ParserState {
  lines: string[];
  currentLine: number;
  models: ASTModel[];
  objects: ASTObject[];
  errors: ParseError[];
  /** Known object names for type resolution (populated in two-pass parsing) */
  objectNames: Set<string>;
}

/** Create initial parser state */
function createState(source: string, objectNames?: Set<string>): ParserState {
  return {
    lines: source.split('\n'),
    currentLine: 0,
    models: [],
    objects: [],
    errors: [],
    objectNames: objectNames ?? new Set(),
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

/** Extract object name from line */
function extractObjectNameFromLine(line: string): string | null {
  const trimmed = removeComments(line).trim();
  const match = trimmed.match(/^object\s+(\w+)/);
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

    // Check for end of model
    if (isBlockEnd(fieldLine)) {
      advance(state);
      break;
    }

    // Parse field (pass objectNames for type resolution)
    const result = parseFieldDeclaration(fieldLine, state.currentLine + 1, state.objectNames);
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create model
  const range = createRange(createPosition(startLine + 1, 0, 0), createPosition(state.currentLine, 0, 0));

  return createModel(modelName, fields, range);
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

    // Parse field (pass objectNames for type resolution)
    const result = parseFieldDeclaration(fieldLine, state.currentLine + 1, state.objectNames);
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
 * First pass: collect all object and model names without parsing fields.
 * This enables forward references (objects/models defined after usage).
 */
function collectNames(source: string): { objectNames: Set<string>; modelNames: Set<string> } {
  const objectNames = new Set<string>();
  const modelNames = new Set<string>();
  const lines = source.split('\n');

  for (const line of lines) {
    const trimmed = removeComments(line).trim();
    if (trimmed.startsWith('object ')) {
      const match = trimmed.match(/^object\s+(\w+)/);
      if (match) objectNames.add(match[1]!);
    } else if (trimmed.startsWith('model ')) {
      const match = trimmed.match(/^model\s+(\w+)/);
      if (match) modelNames.add(match[1]!);
    }
  }

  return { objectNames, modelNames };
}

/** Parse schema source (supports object {} blocks with two-pass name resolution) */
export function parse(source: string, externalObjectNames?: Set<string>): ParseResult {
  // First pass: collect all object names for forward reference resolution
  const { objectNames: localObjectNames } = collectNames(source);

  // Merge with any external object names (from other schema files)
  const allObjectNames = new Set<string>([...localObjectNames, ...(externalObjectNames ?? [])]);

  // Second pass: full parse with object names context
  const state = createState(source, allObjectNames);

  while (!isEnd(state)) {
    const line = currentLine(state);
    if (line === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(line)) {
      advance(state);
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
    ast: createSchemaAST(state.models, source, state.objects),
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

/** Validate parsed schema */
export function validateSchema(ast: SchemaAST): ParseError[] {
  const errors: ParseError[] = [];

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
    }
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

      // Objects cannot have @id decorator
      if (field.decorators.some((d) => d.type === 'id')) {
        errors.push({
          message: `Objects cannot use @id decorator`,
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

      // Objects cannot have any decorators
      if (field.decorators.length) {
        errors.push({
          message: `Object fields cannot have decorators`,
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

  return errors;
}

/** Collect all object names from a source (first-pass only, for external use) */
export function collectObjectNames(source: string): Set<string> {
  return collectNames(source).objectNames;
}
