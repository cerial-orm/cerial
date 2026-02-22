/**
 * Document Links provider for .cerial files.
 *
 * Creates clickable hyperlinks for cross-file type references.
 * Clicking a link navigates to the file containing the definition.
 * Same-file references are excluded (go-to-definition handles those).
 *
 * Supported reference types:
 * - Field types (objectRef, tupleRef, literalRef, enumRef)
 * - `extends ParentName` on any block
 * - `@model(ModelName)` decorator arguments
 * - `Record(TypeName)` typed ID arguments
 * - Tuple element type refs (objectName, tupleName, literalName)
 * - Literal variant refs (objectRef, tupleRef, literalRef)
 */

import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Connection, DocumentLink, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ASTField, ASTLiteral, ASTTuple } from '../../../../orm/src/types';
import type { WorkspaceIndexer } from '../indexer';
import { findTypeDefinition } from '../utils/ast-location';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primitive type names that have no navigable definition */
const PRIMITIVE_TYPES = new Set([
  'String',
  'Int',
  'Float',
  'Bool',
  'Date',
  'Email',
  'Record',
  'Relation',
  'Uuid',
  'Duration',
  'Decimal',
  'Bytes',
  'Geometry',
  'Any',
  'Number',
  // Lowercase variants (as stored in AST field.type)
  'string',
  'int',
  'float',
  'bool',
  'date',
  'email',
  'record',
  'relation',
  'uuid',
  'duration',
  'decimal',
  'bytes',
  'geometry',
  'any',
  'number',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a file path for comparison (mirrors indexer's normalization).
 */
function normalizePath(filePath: string): string {
  const normalized = path.normalize(filePath);
  if (/^[A-Z]:/.test(normalized)) {
    return normalized[0]!.toLowerCase() + normalized.slice(1);
  }

  return normalized;
}

/**
 * Find the first whole-word occurrence of `typeName` on the given 0-indexed line,
 * starting search at column `startCol`. Returns the LSP range or null.
 */
function findWordOnLine(
  sourceLines: string[],
  lineIdx: number,
  typeName: string,
  startCol = 0,
): { start: { line: number; character: number }; end: { line: number; character: number } } | null {
  if (lineIdx < 0 || lineIdx >= sourceLines.length) return null;

  const line = sourceLines[lineIdx]!;
  let from = startCol;

  while (from <= line.length - typeName.length) {
    const idx = line.indexOf(typeName, from);
    if (idx === -1) return null;

    const before = idx > 0 ? line[idx - 1]! : ' ';
    const after = idx + typeName.length < line.length ? line[idx + typeName.length]! : ' ';

    if (!/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
      return {
        start: { line: lineIdx, character: idx },
        end: { line: lineIdx, character: idx + typeName.length },
      };
    }

    from = idx + 1;
  }

  return null;
}

/**
 * Search for a type definition across all files in a schema group.
 * Only returns results from files OTHER than `currentFilePath`.
 */
function findCrossFileDefinition(
  indexer: WorkspaceIndexer,
  uri: string,
  typeName: string,
  currentFilePath: string,
): { filePath: string; targetUri: string } | null {
  const group = indexer.getSchemaGroup(uri);
  if (!group) return null;

  const allASTs = indexer.getAllASTsInGroup(group.name);

  for (const [filePath, fileAST] of allASTs) {
    // Skip same file — go-to-definition handles those
    if (filePath === currentFilePath) continue;

    const result = findTypeDefinition(fileAST, typeName);
    if (result) {
      return {
        filePath,
        targetUri: pathToFileURL(filePath).toString(),
      };
    }
  }

  return null;
}

/**
 * Create a DocumentLink for a cross-file type reference.
 */
function makeLink(
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
  targetUri: string,
  typeName: string,
  filePath: string,
): DocumentLink {
  return {
    range,
    target: targetUri,
    tooltip: `Go to ${typeName} in ${path.basename(filePath)}`,
  };
}

// ---------------------------------------------------------------------------
// AST walkers
// ---------------------------------------------------------------------------

/**
 * Collect cross-file DocumentLinks from a model or object's fields.
 *
 * Checks: objectName, tupleName, literalName (covers enum refs too),
 * @model(Name) decorator values, and Record(TypeName) arguments.
 */
function collectFieldLinks(
  fields: readonly ASTField[],
  sourceLines: string[],
  indexer: WorkspaceIndexer,
  uri: string,
  currentFilePath: string,
  links: DocumentLink[],
): void {
  for (const field of fields) {
    const fieldLine = field.range.start.line - 1; // Convert to 0-indexed
    const afterFieldName = field.range.start.column + field.name.length;

    // 1. Field type refs: objectName, tupleName, literalName (covers enums too)
    const typeRefName = field.objectName ?? field.tupleName ?? field.literalName;
    if (typeRefName && !PRIMITIVE_TYPES.has(typeRefName)) {
      const def = findCrossFileDefinition(indexer, uri, typeRefName, currentFilePath);
      if (def) {
        const range = findWordOnLine(sourceLines, fieldLine, typeRefName, afterFieldName);
        if (range) {
          links.push(makeLink(range, def.targetUri, typeRefName, def.filePath));
        }
      }
    }

    // 2. @model(Name) decorator
    const modelDec = field.decorators.find((d) => d.type === 'model');
    if (modelDec?.value && typeof modelDec.value === 'string') {
      const modelName = modelDec.value;
      if (!PRIMITIVE_TYPES.has(modelName)) {
        const def = findCrossFileDefinition(indexer, uri, modelName, currentFilePath);
        if (def) {
          const decLine = modelDec.range.start.line - 1;
          const range = findWordOnLine(sourceLines, decLine, modelName, modelDec.range.start.column);
          if (range) {
            links.push(makeLink(range, def.targetUri, modelName, def.filePath));
          }
        }
      }
    }

    // 3. Record(TypeName) arguments
    if (field.recordIdTypes?.length) {
      for (const idType of field.recordIdTypes) {
        if (PRIMITIVE_TYPES.has(idType)) continue;

        const def = findCrossFileDefinition(indexer, uri, idType, currentFilePath);
        if (def) {
          const range = findWordOnLine(sourceLines, fieldLine, idType, afterFieldName);
          if (range) {
            links.push(makeLink(range, def.targetUri, idType, def.filePath));
          }
        }
      }
    }
  }
}

/**
 * Collect a cross-file DocumentLink from an `extends ParentName` reference.
 */
function collectExtendsLink(
  block: { name: string; extends?: string; range: { start: { line: number; column: number; offset: number } } },
  sourceLines: string[],
  indexer: WorkspaceIndexer,
  uri: string,
  currentFilePath: string,
  links: DocumentLink[],
): void {
  if (!block.extends) return;

  const parentName = block.extends;
  if (PRIMITIVE_TYPES.has(parentName)) return;

  const def = findCrossFileDefinition(indexer, uri, parentName, currentFilePath);
  if (!def) return;

  // extends is on the declaration line, after the block name
  const declLine = block.range.start.line - 1;
  const range = findWordOnLine(sourceLines, declLine, parentName, block.range.start.column);
  if (range) {
    links.push(makeLink(range, def.targetUri, parentName, def.filePath));
  }
}

/**
 * Collect cross-file DocumentLinks from tuple element type refs.
 *
 * Tuple elements lack individual source ranges, so we search within
 * the tuple block body for the first occurrence of each type name.
 */
function collectTupleElementLinks(
  tuple: ASTTuple,
  sourceLines: string[],
  indexer: WorkspaceIndexer,
  uri: string,
  currentFilePath: string,
  links: DocumentLink[],
): void {
  // Body is between the opening { and closing } lines
  const bodyStartLine = tuple.range.start.line; // 0-indexed: start.line - 1 + 1 (skip { line)
  const bodyEndLine = tuple.range.end.line - 2; // 0-indexed: end.line - 1 - 1 (skip } line)

  if (bodyStartLine > bodyEndLine) return;

  // Track already-linked positions to avoid duplicates when the same type
  // appears multiple times
  const linkedPositions = new Set<string>();

  for (const elem of tuple.elements) {
    const typeRefName = elem.objectName ?? elem.tupleName ?? elem.literalName;
    if (!typeRefName || PRIMITIVE_TYPES.has(typeRefName)) continue;

    const def = findCrossFileDefinition(indexer, uri, typeRefName, currentFilePath);
    if (!def) continue;

    // Search within the tuple body for the type name
    for (let lineIdx = bodyStartLine; lineIdx <= bodyEndLine && lineIdx < sourceLines.length; lineIdx++) {
      const range = findWordOnLine(sourceLines, lineIdx, typeRefName);
      if (!range) continue;

      const posKey = `${range.start.line}:${range.start.character}`;
      if (linkedPositions.has(posKey)) continue;

      linkedPositions.add(posKey);
      links.push(makeLink(range, def.targetUri, typeRefName, def.filePath));
      break;
    }
  }
}

/**
 * Collect cross-file DocumentLinks from literal variant refs
 * (objectRef, tupleRef, literalRef).
 */
function collectLiteralVariantLinks(
  literal: ASTLiteral,
  sourceLines: string[],
  indexer: WorkspaceIndexer,
  uri: string,
  currentFilePath: string,
  links: DocumentLink[],
): void {
  const bodyStartLine = literal.range.start.line; // 0-indexed body start
  const bodyEndLine = literal.range.end.line - 2; // 0-indexed body end

  if (bodyStartLine > bodyEndLine) return;

  const linkedPositions = new Set<string>();

  for (const variant of literal.variants) {
    let refName: string | null = null;

    if (variant.kind === 'objectRef') {
      refName = variant.objectName;
    } else if (variant.kind === 'tupleRef') {
      refName = variant.tupleName;
    } else if (variant.kind === 'literalRef') {
      refName = variant.literalName;
    }

    if (!refName || PRIMITIVE_TYPES.has(refName)) continue;

    const def = findCrossFileDefinition(indexer, uri, refName, currentFilePath);
    if (!def) continue;

    for (let lineIdx = bodyStartLine; lineIdx <= bodyEndLine && lineIdx < sourceLines.length; lineIdx++) {
      const range = findWordOnLine(sourceLines, lineIdx, refName);
      if (!range) continue;

      const posKey = `${range.start.line}:${range.start.character}`;
      if (linkedPositions.has(posKey)) continue;

      linkedPositions.add(posKey);
      links.push(makeLink(range, def.targetUri, refName, def.filePath));
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the Document Links provider on the LSP connection.
 *
 * Creates clickable hyperlinks for cross-file type references.
 * Same-file references are excluded (go-to-definition handles those).
 */
export function registerLinksProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onDocumentLinks((params): DocumentLink[] => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return [];

    // Cross-file links only make sense in schema groups
    const group = indexer.getSchemaGroup(params.textDocument.uri);
    if (!group) return [];

    const source = doc.getText();
    const sourceLines = source.split('\n');
    const currentFilePath = normalizePath(fileURLToPath(params.textDocument.uri));
    const links: DocumentLink[] = [];

    // Walk models
    for (const model of ast.models) {
      collectExtendsLink(model, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
      collectFieldLinks(model.fields, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
    }

    // Walk objects
    for (const obj of ast.objects) {
      collectExtendsLink(obj, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
      collectFieldLinks(obj.fields, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
    }

    // Walk tuples
    for (const tuple of ast.tuples) {
      collectExtendsLink(tuple, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
      collectTupleElementLinks(tuple, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
    }

    // Walk enums
    for (const enumDef of ast.enums) {
      collectExtendsLink(enumDef, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
    }

    // Walk literals
    for (const literal of ast.literals) {
      collectExtendsLink(literal, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
      collectLiteralVariantLinks(literal, sourceLines, indexer, params.textDocument.uri, currentFilePath, links);
    }

    return links;
  });
}
