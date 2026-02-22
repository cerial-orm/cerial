/**
 * Document Symbols provider for .cerial files (Outline panel).
 *
 * Provides a hierarchical symbol tree for the VS Code Outline view:
 * - Models/Objects → fields → decorators
 * - Tuples → elements
 * - Enums → values
 * - Literals → variants
 */

import {
  type Connection,
  type DocumentSymbol,
  type Range,
  SymbolKind,
  type TextDocuments,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  SourceRange,
} from '../../../../orm/src/types';
import type { WorkspaceIndexer } from '../indexer';
import { cerialRangeToLsp } from '../utils/position';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a selection range covering just the `name` on the header line of a block.
 * Falls back to the block start column + name length if the name isn't found.
 */
function nameSelectionRange(lines: string[], blockRange: SourceRange, name: string): Range {
  const line0 = blockRange.start.line - 1;
  const lineText = lines[line0] ?? '';
  const col = lineText.indexOf(name);

  if (col >= 0) {
    return {
      start: { line: line0, character: col },
      end: { line: line0, character: col + name.length },
    };
  }

  // Fallback: use block start position
  return {
    start: { line: line0, character: blockRange.start.column },
    end: { line: line0, character: blockRange.start.column + name.length },
  };
}

/**
 * Find the position of `text` within the source lines bounded by `blockRange`.
 * Returns a Range covering the text, or a zero-width fallback at block start.
 */
function findInBlock(lines: string[], blockRange: SourceRange, text: string): Range {
  const startLine = blockRange.start.line - 1;
  const endLine = blockRange.end.line - 1;

  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const lineText = lines[i]!;
    const searchFrom = i === startLine ? blockRange.start.column : 0;
    const col = lineText.indexOf(text, searchFrom);

    if (col >= 0) {
      return {
        start: { line: i, character: col },
        end: { line: i, character: col + text.length },
      };
    }
  }

  // Fallback
  return {
    start: { line: startLine, character: blockRange.start.column },
    end: { line: startLine, character: blockRange.start.column },
  };
}

/** Capitalize the first letter of a type name. */
function capitalize(s: string): string {
  if (!s.length) return s;

  return s[0]!.toUpperCase() + s.slice(1);
}

/** Build a concise type detail string for a field. */
function fieldDetail(field: ASTField): string {
  let detail: string;

  if (field.objectName) detail = field.objectName;
  else if (field.tupleName) detail = field.tupleName;
  else if (field.literalName) detail = field.literalName;
  else if (field.type === 'record' && field.recordIdTypes?.length) {
    detail = `Record(${field.recordIdTypes.join(', ')})`;
  } else {
    detail = capitalize(field.type);
  }

  if (field.isArray) detail += '[]';
  if (field.isOptional) detail += '?';

  return detail;
}

/** Build a concise type detail string for a tuple element. */
function elementDetail(el: ASTTupleElement): string {
  let detail = el.objectName ?? el.tupleName ?? el.literalName ?? capitalize(el.type);
  if (el.isOptional) detail += '?';

  return detail;
}

// ---------------------------------------------------------------------------
// Symbol builders
// ---------------------------------------------------------------------------

function buildModelSymbol(model: ASTModel, lines: string[]): DocumentSymbol {
  const range = cerialRangeToLsp(model.range);
  const selectionRange = nameSelectionRange(lines, model.range, model.name);
  const detail = model.abstract ? 'abstract model' : 'model';

  const children: DocumentSymbol[] = [];
  for (const field of model.fields) {
    children.push(buildFieldSymbol(field, lines));
  }

  return {
    name: model.name,
    detail,
    kind: SymbolKind.Class,
    range,
    selectionRange,
    children,
  };
}

function buildObjectSymbol(obj: ASTObject, lines: string[]): DocumentSymbol {
  const range = cerialRangeToLsp(obj.range);
  const selectionRange = nameSelectionRange(lines, obj.range, obj.name);

  const children: DocumentSymbol[] = [];
  for (const field of obj.fields) {
    children.push(buildFieldSymbol(field, lines));
  }

  return {
    name: obj.name,
    detail: 'object',
    kind: SymbolKind.Struct,
    range,
    selectionRange,
    children,
  };
}

function buildFieldSymbol(field: ASTField, lines: string[]): DocumentSymbol {
  const range = cerialRangeToLsp(field.range);

  // Selection range: field name at the start of the field range
  const line0 = field.range.start.line - 1;
  const lineText = lines[line0] ?? '';
  const nameCol = lineText.indexOf(field.name, field.range.start.column);
  const startChar = nameCol >= 0 ? nameCol : field.range.start.column;

  const selectionRange: Range = {
    start: { line: line0, character: startChar },
    end: { line: line0, character: startChar + field.name.length },
  };

  const children: DocumentSymbol[] = [];
  for (const deco of field.decorators) {
    children.push(buildDecoratorSymbol(deco));
  }

  return {
    name: field.name,
    detail: fieldDetail(field),
    kind: SymbolKind.Field,
    range,
    selectionRange,
    ...(children.length ? { children } : {}),
  };
}

function buildDecoratorSymbol(deco: ASTDecorator): DocumentSymbol {
  const range = cerialRangeToLsp(deco.range);
  const detail = deco.value !== undefined ? String(deco.value) : undefined;

  return {
    name: `@${deco.type}`,
    detail,
    kind: SymbolKind.Property,
    range,
    selectionRange: range,
  };
}

function buildTupleSymbol(tuple: ASTTuple, lines: string[]): DocumentSymbol {
  const range = cerialRangeToLsp(tuple.range);
  const selectionRange = nameSelectionRange(lines, tuple.range, tuple.name);
  const count = tuple.elements.length;

  const children: DocumentSymbol[] = [];
  for (let i = 0; i < count; i++) {
    children.push(buildTupleElementSymbol(tuple.elements[i]!, i, lines, tuple.range));
  }

  return {
    name: tuple.name,
    detail: `${count} element${count !== 1 ? 's' : ''}`,
    kind: SymbolKind.Array,
    range,
    selectionRange,
    children,
  };
}

function buildTupleElementSymbol(
  el: ASTTupleElement,
  index: number,
  lines: string[],
  parentRange: SourceRange,
): DocumentSymbol {
  const name = el.name ?? `[${index}]`;
  const detail = elementDetail(el);

  // Tuple elements have no range — find their text in the parent block
  const searchText = el.name ?? el.objectName ?? el.tupleName ?? el.literalName ?? capitalize(el.type);
  const elRange = findInBlock(lines, parentRange, searchText);

  return {
    name,
    detail,
    kind: SymbolKind.Field,
    range: elRange,
    selectionRange: elRange,
  };
}

function buildEnumSymbol(enumDef: ASTEnum, lines: string[]): DocumentSymbol {
  const range = cerialRangeToLsp(enumDef.range);
  const selectionRange = nameSelectionRange(lines, enumDef.range, enumDef.name);

  const children: DocumentSymbol[] = [];
  for (const value of enumDef.values) {
    const valueRange = findInBlock(lines, enumDef.range, value);
    children.push({
      name: value,
      kind: SymbolKind.EnumMember,
      range: valueRange,
      selectionRange: valueRange,
    });
  }

  return {
    name: enumDef.name,
    detail: 'enum',
    kind: SymbolKind.Enum,
    range,
    selectionRange,
    children,
  };
}

function buildLiteralSymbol(literal: ASTLiteral, lines: string[]): DocumentSymbol {
  const range = cerialRangeToLsp(literal.range);
  const selectionRange = nameSelectionRange(lines, literal.range, literal.name);

  const children: DocumentSymbol[] = [];
  for (const variant of literal.variants) {
    children.push(buildVariantSymbol(variant, lines, literal.range));
  }

  return {
    name: literal.name,
    detail: 'literal',
    kind: SymbolKind.TypeParameter,
    range,
    selectionRange,
    children,
  };
}

function buildVariantSymbol(variant: ASTLiteralVariant, lines: string[], parentRange: SourceRange): DocumentSymbol {
  let name: string;
  let detail: string;
  let searchText: string;

  switch (variant.kind) {
    case 'string':
      name = `"${variant.value}"`;
      detail = 'string';
      searchText = variant.value;
      break;
    case 'int':
      name = String(variant.value);
      detail = 'int';
      searchText = name;
      break;
    case 'float':
      name = String(variant.value);
      detail = 'float';
      searchText = name;
      break;
    case 'bool':
      name = String(variant.value);
      detail = 'bool';
      searchText = name;
      break;
    case 'broadType':
      name = variant.typeName;
      detail = 'type';
      searchText = name;
      break;
    case 'objectRef':
      name = variant.objectName;
      detail = 'object';
      searchText = name;
      break;
    case 'tupleRef':
      name = variant.tupleName;
      detail = 'tuple';
      searchText = name;
      break;
    case 'literalRef':
      name = variant.literalName;
      detail = 'literal';
      searchText = name;
      break;
  }

  const variantRange = findInBlock(lines, parentRange, searchText);

  return {
    name,
    detail,
    kind: SymbolKind.EnumMember,
    range: variantRange,
    selectionRange: variantRange,
  };
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the document symbols provider on the LSP connection.
 *
 * Builds a hierarchical symbol tree from the indexed AST,
 * used by VS Code's Outline panel and breadcrumb navigation.
 */
export function registerSymbolsProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onDocumentSymbol((params): DocumentSymbol[] => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return [];

    const source = doc.getText();
    const lines = source.split('\n');
    const symbols: DocumentSymbol[] = [];

    for (const model of ast.models) {
      symbols.push(buildModelSymbol(model, lines));
    }
    for (const obj of ast.objects) {
      symbols.push(buildObjectSymbol(obj, lines));
    }
    for (const tuple of ast.tuples) {
      symbols.push(buildTupleSymbol(tuple, lines));
    }
    for (const enumDef of ast.enums) {
      symbols.push(buildEnumSymbol(enumDef, lines));
    }
    for (const literal of ast.literals) {
      symbols.push(buildLiteralSymbol(literal, lines));
    }

    return symbols;
  });
}
