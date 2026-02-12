/**
 * Parser-specific type definitions for tokenization, lexing, and AST
 */

import type { SchemaDecorator, SchemaFieldType, SourcePosition, SourceRange } from './common.types';

/** AST node for a model-level composite directive (@@index or @@unique) */
export interface ASTCompositeDirective {
  /** Whether this is an 'index' or 'unique' composite */
  kind: 'index' | 'unique';
  /** User-defined name for the composite (must be globally unique across all models) */
  name: string;
  /** Field references (supports dot notation for object subfields, e.g. "address.city") */
  fields: string[];
  /** Source range for error reporting */
  range: SourceRange;
}

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
  | 'decorator_createdAt'
  | 'decorator_updatedAt'
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
  isArray?: boolean; // true for Record[] or Object[] type
  decorators: ASTDecorator[];
  range: SourceRange;
  /** For object-typed fields: the name of the referenced object definition */
  objectName?: string;
}

/** AST node for a model */
export interface ASTModel {
  name: string;
  fields: ASTField[];
  /** Model-level composite directives (@@index, @@unique) */
  directives?: ASTCompositeDirective[];
  range: SourceRange;
}

/** AST node for an object definition (embedded data structure) */
export interface ASTObject {
  name: string;
  fields: ASTField[];
  range: SourceRange;
}

/** Top-level AST containing all models and objects */
export interface SchemaAST {
  models: ASTModel[];
  objects: ASTObject[];
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
