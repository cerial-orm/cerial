/**
 * Tokenizer for .schema files
 * Converts raw text into tokens
 */

import type { Token, TokenType, SourcePosition } from '../types';

/** Keywords in the schema language */
const KEYWORDS = new Set(['model']);

/** Punctuation characters */
const PUNCTUATION = new Set(['{', '}', ':', '?', '(', ')']);

/** Valid type names (UpperFirst) */
const TYPES = new Set(['String', 'Email', 'Int', 'Float', 'Bool', 'Date']);

/** Create a token */
function createToken(type: TokenType, value: string, position: SourcePosition): Token {
  return { type, value, position };
}

/** Tokenizer state */
interface TokenizerState {
  source: string;
  position: number;
  line: number;
  column: number;
}

/** Create initial tokenizer state */
function createState(source: string): TokenizerState {
  return { source, position: 0, line: 1, column: 0 };
}

/** Get current character */
function current(state: TokenizerState): string {
  return state.source[state.position] ?? '';
}

/** Peek ahead */
function peek(state: TokenizerState, offset: number = 1): string {
  return state.source[state.position + offset] ?? '';
}

/** Advance position */
function advance(state: TokenizerState): void {
  if (current(state) === '\n') {
    state.line++;
    state.column = 0;
  } else {
    state.column++;
  }
  state.position++;
}

/** Check if at end */
function isEnd(state: TokenizerState): boolean {
  return state.position >= state.source.length;
}

/** Get current position as SourcePosition */
function getPosition(state: TokenizerState): SourcePosition {
  return { line: state.line, column: state.column, offset: state.position };
}

/** Read whitespace */
function readWhitespace(state: TokenizerState): Token {
  const pos = getPosition(state);
  let value = '';

  while (!isEnd(state) && /[ \t]/.test(current(state))) {
    value += current(state);
    advance(state);
  }

  return createToken('whitespace', value, pos);
}

/** Read newline */
function readNewline(state: TokenizerState): Token {
  const pos = getPosition(state);
  const value = current(state);
  advance(state);
  return createToken('newline', value, pos);
}

/** Read single-line comment */
function readSingleLineComment(state: TokenizerState): Token {
  const pos = getPosition(state);
  let value = '';

  while (!isEnd(state) && current(state) !== '\n') {
    value += current(state);
    advance(state);
  }

  return createToken('comment', value, pos);
}

/** Read multi-line comment */
function readMultiLineComment(state: TokenizerState): Token {
  const pos = getPosition(state);
  let value = '/*';
  advance(state); // skip /
  advance(state); // skip *

  while (!isEnd(state)) {
    if (current(state) === '*' && peek(state) === '/') {
      value += '*/';
      advance(state);
      advance(state);
      break;
    }
    value += current(state);
    advance(state);
  }

  return createToken('comment', value, pos);
}

/** Read string literal */
function readString(state: TokenizerState): Token {
  const pos = getPosition(state);
  const quote = current(state);
  let value = quote;
  advance(state);

  while (!isEnd(state) && current(state) !== quote) {
    if (current(state) === '\\') {
      value += current(state);
      advance(state);
    }
    value += current(state);
    advance(state);
  }

  if (current(state) === quote) {
    value += quote;
    advance(state);
  }

  return createToken('string', value, pos);
}

/** Read number */
function readNumber(state: TokenizerState): Token {
  const pos = getPosition(state);
  let value = '';

  if (current(state) === '-') {
    value += current(state);
    advance(state);
  }

  while (!isEnd(state) && /[0-9]/.test(current(state))) {
    value += current(state);
    advance(state);
  }

  if (current(state) === '.' && /[0-9]/.test(peek(state))) {
    value += current(state);
    advance(state);
    while (!isEnd(state) && /[0-9]/.test(current(state))) {
      value += current(state);
      advance(state);
    }
  }

  return createToken('number', value, pos);
}

/** Read identifier or keyword */
function readIdentifier(state: TokenizerState): Token {
  const pos = getPosition(state);
  let value = '';

  while (!isEnd(state) && /[a-zA-Z0-9_]/.test(current(state))) {
    value += current(state);
    advance(state);
  }

  let type: TokenType = 'identifier';

  if (KEYWORDS.has(value.toLowerCase())) {
    type = 'keyword';
  } else if (TYPES.has(value)) {
    type = 'type';
  } else if (value === 'true' || value === 'false') {
    type = 'boolean';
  }

  return createToken(type, value, pos);
}

/** Read decorator (@name or @name(value)) */
function readDecorator(state: TokenizerState): Token {
  const pos = getPosition(state);
  let value = '@';
  advance(state); // skip @

  // Read decorator name
  while (!isEnd(state) && /[a-zA-Z0-9_]/.test(current(state))) {
    value += current(state);
    advance(state);
  }

  // Check for parentheses (e.g., @default(value))
  if (current(state) === '(') {
    value += current(state);
    advance(state);

    // Read until closing paren
    let depth = 1;
    while (!isEnd(state) && depth > 0) {
      if (current(state) === '(') depth++;
      if (current(state) === ')') depth--;
      value += current(state);
      advance(state);
    }
  }

  return createToken('decorator', value, pos);
}

/** Read punctuation */
function readPunctuation(state: TokenizerState): Token {
  const pos = getPosition(state);
  const value = current(state);
  advance(state);
  return createToken('punctuation', value, pos);
}

/** Tokenize a schema source string */
export function tokenize(source: string): Token[] {
  const state = createState(source);
  const tokens: Token[] = [];

  while (!isEnd(state)) {
    const char = current(state);

    // Whitespace (not newlines)
    if (/[ \t]/.test(char)) {
      tokens.push(readWhitespace(state));
      continue;
    }

    // Newlines
    if (char === '\n' || char === '\r') {
      tokens.push(readNewline(state));
      continue;
    }

    // Comments
    if (char === '/' && peek(state) === '/') {
      tokens.push(readSingleLineComment(state));
      continue;
    }
    if (char === '/' && peek(state) === '*') {
      tokens.push(readMultiLineComment(state));
      continue;
    }

    // Strings
    if (char === '"' || char === "'") {
      tokens.push(readString(state));
      continue;
    }

    // Numbers
    if (/[0-9]/.test(char) || (char === '-' && /[0-9]/.test(peek(state)))) {
      tokens.push(readNumber(state));
      continue;
    }

    // Decorators
    if (char === '@') {
      tokens.push(readDecorator(state));
      continue;
    }

    // Identifiers/keywords
    if (/[a-zA-Z_]/.test(char)) {
      tokens.push(readIdentifier(state));
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(char)) {
      tokens.push(readPunctuation(state));
      continue;
    }

    // Unknown character - skip it
    advance(state);
  }

  // Add EOF token
  tokens.push(createToken('eof', '', getPosition(state)));

  return tokens;
}

/** Filter out whitespace and comment tokens */
export function filterTokens(tokens: Token[]): Token[] {
  return tokens.filter(
    (t) => t.type !== 'whitespace' && t.type !== 'comment' && t.type !== 'newline',
  );
}
