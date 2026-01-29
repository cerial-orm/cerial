/**
 * Parser-specific type definitions for tokenization, lexing, and AST
 */

import type { SchemaDecorator, SchemaFieldType, SourcePosition, SourceRange } from './common.types';

/** Token types produced by the tokenizer */
export type TokenType =
  | 'keyword' // model, etc.
  | 'identifier' // field names, model names
  | 'decorator' // @unique, @now, @default
  | 'type' // string, email, int, date, bool, float
  | 'punctuation' // { } : ? ( )
  | 'string' // "quoted string"
  | 'number' // numeric literals
  | 'boolean' // true, false
  | 'newline' // line breaks
  | 'whitespace' // spaces, tabs
  | 'comment' // // or /* */
  | 'eof'; // end of file

/** Single token from tokenizer */
export interface Token {
  type: TokenType;
  value: string;
  position: SourcePosition;
}

/** Lexeme types produced by the lexer */
export type LexemeType =
  | 'model_keyword'
  | 'model_name'
  | 'block_start'
  | 'block_end'
  | 'field_name'
  | 'field_type'
  | 'colon'
  | 'optional_marker'
  | 'decorator_unique'
  | 'decorator_now'
  | 'decorator_default'
  | 'default_value'
  | 'paren_open'
  | 'paren_close';

/** Lexeme produced by lexer */
export interface Lexeme {
  type: LexemeType;
  value: string;
  position: SourcePosition;
}

/** AST node for a decorator */
export interface ASTDecorator {
  type: SchemaDecorator;
  value?: unknown;
  range: SourceRange;
}

/** AST node for a field */
export interface ASTField {
  name: string;
  type: SchemaFieldType;
  isOptional: boolean;
  isArray?: boolean; // true for Record[] type
  decorators: ASTDecorator[];
  range: SourceRange;
}

/** AST node for a model */
export interface ASTModel {
  name: string;
  fields: ASTField[];
  range: SourceRange;
}

/** Top-level AST containing all models */
export interface SchemaAST {
  models: ASTModel[];
  source: string;
}

/** Result of parsing a schema file */
export interface ParseResult {
  ast: SchemaAST;
  errors: ParseError[];
}

/** Parse error with location information */
export interface ParseError {
  message: string;
  position: SourcePosition;
  range?: SourceRange;
}

/** Schema file with path and content */
export interface SchemaFile {
  path: string;
  content: string;
}
