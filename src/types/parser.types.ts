/**
 * Parser-specific type definitions for tokenization, lexing, and AST
 */

import type { SchemaDecorator, SchemaFieldType, SourcePosition, SourceRange } from './common.types';

/** Variant kind in a literal definition */
export type ASTLiteralVariantKind =
  | 'string'
  | 'int'
  | 'float'
  | 'bool'
  | 'broadType'
  | 'tupleRef'
  | 'objectRef'
  | 'literalRef';

/** AST node for a single variant in a literal definition */
export type ASTLiteralVariant =
  | { kind: 'string'; value: string }
  | { kind: 'int'; value: number }
  | { kind: 'float'; value: number }
  | { kind: 'bool'; value: boolean }
  | { kind: 'broadType'; typeName: string }
  | { kind: 'tupleRef'; tupleName: string }
  | { kind: 'objectRef'; objectName: string }
  | { kind: 'literalRef'; literalName: string };

/** AST node for a literal definition (union type) */
export interface ASTLiteral {
  name: string;
  variants: ASTLiteralVariant[];
  range: SourceRange;
}

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
  /** Whether the field has @nullable decorator (can hold null as a value) */
  isNullable?: boolean;
  isArray?: boolean; // true for Record[] or Object[] type
  decorators: ASTDecorator[];
  range: SourceRange;
  /** For object-typed fields: the name of the referenced object definition */
  objectName?: string;
  /** For tuple-typed fields: the name of the referenced tuple definition */
  tupleName?: string;
  /** For literal-typed fields: the name of the referenced literal definition */
  literalName?: string;
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

/** AST node for a single element in a tuple definition */
export interface ASTTupleElement {
  /** Optional element name (for named tuples); undefined for positional-only elements */
  name?: string;
  /** Element type (e.g., 'string', 'int', 'float', 'object', 'tuple') */
  type: SchemaFieldType;
  /** Whether this element is optional (e.g., Float?) */
  isOptional: boolean;
  /** Whether the element has @nullable decorator (can hold null as a value) */
  isNullable?: boolean;
  /** Decorators on the tuple element (e.g., @nullable, @default, @createdAt, @updatedAt) */
  decorators?: ASTDecorator[];
  /** For object-typed elements: the name of the referenced object definition */
  objectName?: string;
  /** For tuple-typed elements: the name of the referenced tuple definition */
  tupleName?: string;
  /** For literal-typed elements: the name of the referenced literal definition */
  literalName?: string;
}

/** AST node for a tuple definition (positional typed array) */
export interface ASTTuple {
  name: string;
  elements: ASTTupleElement[];
  range: SourceRange;
}

/** AST node for an enum definition (named string constants) */
export interface ASTEnum {
  name: string;
  values: string[];
  range: SourceRange;
}

/** Top-level AST containing all models, objects, tuples, literals, and enums */
export interface SchemaAST {
  models: ASTModel[];
  objects: ASTObject[];
  tuples: ASTTuple[];
  literals: ASTLiteral[];
  enums: ASTEnum[];
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
