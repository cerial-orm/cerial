/**
 * Semantic Tokens provider for .cerial files.
 *
 * Provides AST-aware token classification for enhanced highlighting:
 * - Block keywords (model, object, enum, tuple, literal, abstract, extends)
 * - Type names at declaration vs reference sites
 * - Field properties with readonly modifier
 * - Decorators
 * - Enum member values
 *
 * Complements TextMate grammar with AST-aware precision for types, names,
 * and modifiers that regex-based grammars cannot resolve.
 */

import {
  type Connection,
  SemanticTokenModifiers,
  SemanticTokensBuilder,
  SemanticTokenTypes,
  type TextDocuments,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  SchemaAST,
} from '../../../../orm/src/types';
import type { WorkspaceIndexer } from '../indexer';
import { cerialToLsp } from '../utils/position';

// ── Token Legend ───────────────────────────────────────────────────────────

/** Token types array — index is the token type ID in the legend. */
export const TOKEN_TYPES = [
  SemanticTokenTypes.keyword, // 0 — model, object, enum, tuple, literal, abstract, extends
  SemanticTokenTypes.class, // 1 — model/object/tuple/literal names
  SemanticTokenTypes.enum, // 2 — enum names
  SemanticTokenTypes.enumMember, // 3 — enum values
  SemanticTokenTypes.property, // 4 — field names
  SemanticTokenTypes.type, // 5 — built-in field types (String, Int, Bool, etc.)
  SemanticTokenTypes.decorator, // 6 — @id, @default, @nullable, etc.
  SemanticTokenTypes.string, // 7 — string literals (deferred to TextMate)
  SemanticTokenTypes.number, // 8 — numeric literals (deferred to TextMate)
  SemanticTokenTypes.comment, // 9 — comments (deferred to TextMate)
];

/** Token modifiers array — index is the bit position in the legend. */
export const TOKEN_MODIFIERS = [
  SemanticTokenModifiers.declaration, // bit 0 — definition site
  SemanticTokenModifiers.readonly, // bit 1 — @readonly fields
  SemanticTokenModifiers.abstract, // bit 2 — abstract models
];

// ── Constants ─────────────────────────────────────────────────────────────

// Token type indices (match TOKEN_TYPES array order)
const T_KEYWORD = 0;
const T_CLASS = 1;
const T_ENUM = 2;
const T_ENUM_MEMBER = 3;
const T_PROPERTY = 4;
const T_TYPE = 5;
const T_DECORATOR = 6;

// Modifier bitmasks (match TOKEN_MODIFIERS bit positions)
const M_NONE = 0;
const M_DECLARATION = 1 << 0;
const M_READONLY = 1 << 1;
const M_ABSTRACT = 1 << 2;

// ── Types ─────────────────────────────────────────────────────────────────

interface SemanticToken {
  line: number; // 0-indexed (LSP)
  char: number; // 0-indexed (LSP)
  length: number;
  type: number;
  modifiers: number;
}

// ── Token Collection ──────────────────────────────────────────────────────

/**
 * Walk the AST and collect all semantic tokens.
 * Returns tokens sorted by document position (required by SemanticTokensBuilder).
 */
function collectTokens(ast: SchemaAST, source: string): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  const lines = source.split('\n');

  for (const model of ast.models) {
    collectBlockDeclaration(tokens, lines, model, 'model');
    for (const field of model.fields) {
      collectFieldTokens(tokens, lines, field, ast);
    }
  }

  for (const obj of ast.objects) {
    collectBlockDeclaration(tokens, lines, obj, 'object');
    for (const field of obj.fields) {
      collectFieldTokens(tokens, lines, field, ast);
    }
  }

  for (const tuple of ast.tuples) {
    collectBlockDeclaration(tokens, lines, tuple, 'tuple');
  }

  for (const enumDef of ast.enums) {
    collectBlockDeclaration(tokens, lines, enumDef, 'enum');
    collectEnumValues(tokens, lines, enumDef);
  }

  for (const literal of ast.literals) {
    collectBlockDeclaration(tokens, lines, literal, 'literal');
  }

  // SemanticTokensBuilder requires tokens in document order
  tokens.sort((a, b) => a.line - b.line || a.char - b.char);

  return tokens;
}

// ── Block Declarations ────────────────────────────────────────────────────

/**
 * Collect tokens from a block declaration line.
 *
 * Handles: [abstract] <keyword> <Name> [extends <Parent>] {
 */
function collectBlockDeclaration(
  tokens: SemanticToken[],
  lines: string[],
  block: ASTModel | ASTObject | ASTTuple | ASTEnum | ASTLiteral,
  kind: 'model' | 'object' | 'tuple' | 'enum' | 'literal',
): void {
  const lsp = cerialToLsp(block.range.start);
  const lineText = lines[lsp.line];
  if (!lineText) return;

  const isAbstract = 'abstract' in block && block.abstract === true;
  let searchFrom = lsp.character;

  // "abstract" keyword (models only)
  if (isAbstract) {
    const col = findWord(lineText, 'abstract', searchFrom);
    if (col >= 0) {
      tokens.push({ line: lsp.line, char: col, length: 8, type: T_KEYWORD, modifiers: M_ABSTRACT });
      searchFrom = col + 8;
    }
  }

  // Block keyword (model, object, tuple, enum, literal)
  const kwCol = findWord(lineText, kind, searchFrom);
  if (kwCol >= 0) {
    tokens.push({
      line: lsp.line,
      char: kwCol,
      length: kind.length,
      type: T_KEYWORD,
      modifiers: isAbstract ? M_ABSTRACT : M_NONE,
    });
    searchFrom = kwCol + kind.length;
  }

  // Type name at declaration site
  const nameCol = findWord(lineText, block.name, searchFrom);
  if (nameCol >= 0) {
    const tokenType = kind === 'enum' ? T_ENUM : T_CLASS;
    const modifiers = isAbstract ? M_DECLARATION | M_ABSTRACT : M_DECLARATION;
    tokens.push({ line: lsp.line, char: nameCol, length: block.name.length, type: tokenType, modifiers });
    searchFrom = nameCol + block.name.length;
  }

  // "extends" keyword + parent type name
  if ('extends' in block && block.extends) {
    const extCol = findWord(lineText, 'extends', searchFrom);
    if (extCol >= 0) {
      tokens.push({ line: lsp.line, char: extCol, length: 7, type: T_KEYWORD, modifiers: M_NONE });
      const parentCol = findWord(lineText, block.extends, extCol + 7);
      if (parentCol >= 0) {
        const parentType = kind === 'enum' ? T_ENUM : T_CLASS;
        tokens.push({
          line: lsp.line,
          char: parentCol,
          length: block.extends.length,
          type: parentType,
          modifiers: M_NONE,
        });
      }
    }
  }
}

// ── Field Tokens ──────────────────────────────────────────────────────────

/**
 * Collect tokens from a field declaration:
 * - Field name (property, with optional readonly modifier)
 * - Field type (built-in type or class/enum reference)
 * - Decorators
 */
function collectFieldTokens(tokens: SemanticToken[], lines: string[], field: ASTField, ast: SchemaAST): void {
  const lsp = cerialToLsp(field.range.start);
  const lineText = lines[lsp.line];
  if (!lineText) return;

  const hasReadonly = field.decorators.some((d) => d.type === 'readonly');

  // Field name → property token
  tokens.push({
    line: lsp.line,
    char: lsp.character,
    length: field.name.length,
    type: T_PROPERTY,
    modifiers: hasReadonly ? M_READONLY : M_NONE,
  });

  // Field type
  const searchFrom = lsp.character + field.name.length;
  const refName = field.objectName ?? field.tupleName ?? field.literalName;

  if (refName) {
    // Reference to a defined type (object, tuple, literal, or enum via literalName)
    const refCol = findWord(lineText, refName, searchFrom);
    if (refCol >= 0) {
      const isEnum = ast.enums.some((e) => e.name === refName);
      tokens.push({
        line: lsp.line,
        char: refCol,
        length: refName.length,
        type: isEnum ? T_ENUM : T_CLASS,
        modifiers: M_NONE,
      });
    }
  } else {
    // Built-in type (String, Int, Record, Relation, etc.)
    const typeName = capitalize(field.type);
    const typeCol = findWord(lineText, typeName, searchFrom);
    if (typeCol >= 0) {
      tokens.push({
        line: lsp.line,
        char: typeCol,
        length: typeName.length,
        type: T_TYPE,
        modifiers: M_NONE,
      });
    }
  }

  // Decorators — use precise AST ranges
  for (const deco of field.decorators) {
    collectDecoratorToken(tokens, deco);
  }
}

// ── Decorator Tokens ──────────────────────────────────────────────────────

/**
 * Collect a decorator token. Only classifies the @name portion,
 * not the parenthesized arguments (which TextMate handles).
 */
function collectDecoratorToken(tokens: SemanticToken[], deco: ASTDecorator): void {
  const lsp = cerialToLsp(deco.range.start);
  // +1 for the '@' prefix
  const nameLength = deco.type.length + 1;
  tokens.push({ line: lsp.line, char: lsp.character, length: nameLength, type: T_DECORATOR, modifiers: M_NONE });
}

// ── Enum Values ───────────────────────────────────────────────────────────

/**
 * Collect enumMember tokens for each value in an enum definition.
 * Searches the source lines within the enum body since individual
 * values don't carry source ranges in the AST.
 */
function collectEnumValues(tokens: SemanticToken[], lines: string[], enumDef: ASTEnum): void {
  const startLine = cerialToLsp(enumDef.range.start).line;
  const endLine = cerialToLsp(enumDef.range.end).line;

  for (const value of enumDef.values) {
    // Search body lines (skip declaration line, stop before closing brace)
    for (let line = startLine + 1; line <= endLine; line++) {
      const lineText = lines[line];
      if (!lineText) continue;

      const col = findWord(lineText, value, 0);
      if (col >= 0) {
        tokens.push({ line, char: col, length: value.length, type: T_ENUM_MEMBER, modifiers: M_NONE });
        break;
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Find a whole word in a line starting from a column offset.
 * Checks word boundaries to avoid partial matches.
 * Returns the 0-indexed column or -1 if not found.
 */
function findWord(lineText: string, word: string, fromCol: number): number {
  if (!word.length) return -1;

  let pos = fromCol;
  while (pos <= lineText.length - word.length) {
    const idx = lineText.indexOf(word, pos);
    if (idx < 0) return -1;

    const before = idx > 0 ? lineText[idx - 1]! : ' ';
    const after = idx + word.length < lineText.length ? lineText[idx + word.length]! : ' ';

    if (!/\w/.test(before) && !/\w/.test(after)) {
      return idx;
    }

    pos = idx + 1;
  }

  return -1;
}

/** Capitalize the first letter of a string. */
function capitalize(s: string): string {
  if (!s.length) return s;

  return s[0]!.toUpperCase() + s.slice(1);
}

// ── Provider Registration ─────────────────────────────────────────────────

/**
 * Register the semantic tokens provider on the LSP connection.
 *
 * Walks the indexed AST to classify tokens with semantic precision
 * that TextMate grammars cannot achieve (declaration vs reference,
 * readonly fields, abstract models, enum vs class names).
 */
export function registerSemanticTokensProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.languages.semanticTokens.on((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return { data: [] };

    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return { data: [] };

    const source = doc.getText();
    const allTokens = collectTokens(ast, source);

    const builder = new SemanticTokensBuilder();
    for (const token of allTokens) {
      builder.push(token.line, token.char, token.length, token.type, token.modifiers);
    }

    return builder.build();
  });
}
