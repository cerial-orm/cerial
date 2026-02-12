/**
 * Lexer for .cerial files
 * Validates tokens and converts to typed lexemes
 */

import type { Token, Lexeme, LexemeType, SourcePosition, ParseError } from '../types';
import { filterTokens } from './tokenizer';

/** Lexer result */
export interface LexerResult {
  lexemes: Lexeme[];
  errors: ParseError[];
}

/** Create a lexeme */
function createLexeme(type: LexemeType, value: string, position: SourcePosition): Lexeme {
  return { type, value, position };
}

/** Create a parse error */
function createError(message: string, position: SourcePosition): ParseError {
  return { message, position };
}

/** Lexer state */
interface LexerState {
  tokens: Token[];
  position: number;
  lexemes: Lexeme[];
  errors: ParseError[];
}

/** Create initial lexer state */
function createState(tokens: Token[]): LexerState {
  return {
    tokens: filterTokens(tokens),
    position: 0,
    lexemes: [],
    errors: [],
  };
}

/** Get current token */
function current(state: LexerState): Token | undefined {
  return state.tokens[state.position];
}

/** Peek ahead */
function peek(state: LexerState, offset: number = 1): Token | undefined {
  return state.tokens[state.position + offset];
}

/** Advance position */
function advance(state: LexerState): void {
  state.position++;
}

/** Check if at end */
function isEnd(state: LexerState): boolean {
  const token = current(state);
  return !token || token.type === 'eof';
}

/** Add lexeme */
function addLexeme(state: LexerState, lexeme: Lexeme): void {
  state.lexemes.push(lexeme);
}

/** Add error */
function addError(state: LexerState, error: ParseError): void {
  state.errors.push(error);
}

/** Expect a specific token type */
function expect(state: LexerState, type: string, value?: string): Token | null {
  const token = current(state);
  if (!token) {
    addError(state, createError(`Unexpected end of input, expected ${type}`, { line: 0, column: 0, offset: 0 }));
    return null;
  }

  if (token.type !== type) {
    addError(state, createError(`Expected ${type}, got ${token.type}`, token.position));
    return null;
  }

  if (value !== undefined && token.value !== value) {
    addError(state, createError(`Expected '${value}', got '${token.value}'`, token.position));
    return null;
  }

  return token;
}

/** Lex model declaration */
function lexModel(state: LexerState): void {
  // Expect 'model' keyword
  const modelKeyword = expect(state, 'keyword', 'model');
  if (!modelKeyword) return;
  addLexeme(state, createLexeme('model_keyword', modelKeyword.value, modelKeyword.position));
  advance(state);

  // Expect model name (identifier)
  const modelName = expect(state, 'identifier');
  if (!modelName) return;
  addLexeme(state, createLexeme('model_name', modelName.value, modelName.position));
  advance(state);

  // Expect opening brace
  const openBrace = expect(state, 'punctuation', '{');
  if (!openBrace) return;
  addLexeme(state, createLexeme('block_start', openBrace.value, openBrace.position));
  advance(state);

  // Lex fields until closing brace
  while (!isEnd(state)) {
    const startPos = state.position;
    const token = current(state);
    if (!token) break;

    // Check for closing brace
    if (token.type === 'punctuation' && token.value === '}') {
      addLexeme(state, createLexeme('block_end', token.value, token.position));
      advance(state);
      break;
    }

    // Lex field
    lexField(state);

    // Safety: if position didn't advance, skip this token to prevent infinite loop
    if (state.position === startPos) {
      advance(state);
    }
  }
}

/** Lex field declaration */
function lexField(state: LexerState): void {
  // Optional decorators
  while (!isEnd(state)) {
    const token = current(state);
    if (!token || token.type !== 'decorator') break;

    // Determine decorator type
    if (token.value === '@unique') {
      addLexeme(state, createLexeme('decorator_unique', token.value, token.position));
    } else if (token.value === '@now') {
      addLexeme(state, createLexeme('decorator_now', token.value, token.position));
    } else if (token.value === '@createdAt') {
      addLexeme(state, createLexeme('decorator_createdAt', token.value, token.position));
    } else if (token.value === '@updatedAt') {
      addLexeme(state, createLexeme('decorator_updatedAt', token.value, token.position));
    } else if (token.value.startsWith('@default')) {
      addLexeme(state, createLexeme('decorator_default', token.value, token.position));
    }
    advance(state);
  }

  // Expect field name
  const fieldName = current(state);
  if (!fieldName || fieldName.type !== 'identifier') {
    if (fieldName && fieldName.type === 'punctuation' && fieldName.value === '}') {
      return; // End of model
    }
    addError(state, createError('Expected field name', fieldName?.position ?? { line: 0, column: 0, offset: 0 }));
    return;
  }
  addLexeme(state, createLexeme('field_name', fieldName.value, fieldName.position));
  advance(state);

  // Optional '?' for optional fields (can appear after field name)
  const maybeOptional = current(state);
  if (maybeOptional?.type === 'punctuation' && maybeOptional.value === '?') {
    addLexeme(state, createLexeme('optional_marker', maybeOptional.value, maybeOptional.position));
    advance(state);
  }

  // Optional colon (schema format may or may not have colons)
  const maybeColon = current(state);
  if (maybeColon?.type === 'punctuation' && maybeColon.value === ':') {
    addLexeme(state, createLexeme('colon', maybeColon.value, maybeColon.position));
    advance(state);
  }

  // Expect type
  const fieldType = current(state);
  if (!fieldType || fieldType.type !== 'type') {
    // Not a valid field type - return to let caller handle
    return;
  }
  addLexeme(state, createLexeme('field_type', fieldType.value, fieldType.position));
  advance(state);
}

/** Lex all tokens */
export function lex(tokens: Token[]): LexerResult {
  const state = createState(tokens);

  while (!isEnd(state)) {
    const startPos = state.position;
    const token = current(state);
    if (!token) break;

    if (token.type === 'keyword' && token.value === 'model') {
      lexModel(state);
    } else {
      // Skip unknown tokens
      advance(state);
    }

    // Safety: ensure we always make progress
    if (state.position === startPos) {
      advance(state);
    }
  }

  return {
    lexemes: state.lexemes,
    errors: state.errors,
  };
}
