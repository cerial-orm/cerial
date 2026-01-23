/**
 * Main schema parser
 * Parses schema files into AST
 */

import type { SchemaAST, ASTModel, ASTField, ParseResult, ParseError } from '../types';
import { tokenize } from './tokenizer';
import { lex, type LexerResult } from './lexer';
import {
  createSchemaAST,
  createModel,
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
  errors: ParseError[];
}

/** Create initial parser state */
function createState(source: string): ParserState {
  return {
    lines: source.split('\n'),
    currentLine: 0,
    models: [],
    errors: [],
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

    // Parse field
    const result = parseFieldDeclaration(fieldLine, state.currentLine + 1);
    if (result.error) {
      addError(state, result.error);
    } else if (result.field) {
      fields.push(result.field);
    }
    advance(state);
  }

  // Create model
  const range = createRange(
    createPosition(startLine + 1, 0, 0),
    createPosition(state.currentLine, 0, 0),
  );

  return createModel(modelName, fields, range);
}

/** Parse schema source */
export function parse(source: string): ParseResult {
  const state = createState(source);

  while (!isEnd(state)) {
    const line = currentLine(state);
    if (line === undefined) break;

    // Skip empty lines and comments
    if (isEmptyOrComment(line)) {
      advance(state);
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
    ast: createSchemaAST(state.models, source),
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

  return errors;
}
