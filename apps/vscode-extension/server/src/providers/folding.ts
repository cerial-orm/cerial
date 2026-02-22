/**
 * Folding Range provider for .cerial files.
 *
 * Provides folding ranges for:
 * - Model/object/tuple/enum/literal block bodies (multi-line only)
 * - Multi-line comments
 * - Consecutive single-line comments
 */

import { type Connection, type FoldingRange, FoldingRangeKind, type TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { WorkspaceIndexer } from '../indexer';

/**
 * Extract folding ranges from source text for comments.
 * Handles both multi-line blocks and consecutive single-line comments.
 */
function extractCommentRanges(source: string): FoldingRange[] {
  const ranges: FoldingRange[] = [];
  const lines = source.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Multi-line comment block
    if (trimmed.startsWith('/*')) {
      const startLine = i;

      // Find closing
      let endLine = i;
      let found = false;

      for (let j = i; j < lines.length; j++) {
        if (lines[j]!.includes('*/')) {
          endLine = j;
          found = true;
          break;
        }
      }

      if (found && endLine > startLine) {
        ranges.push({
          startLine,
          endLine,
          kind: FoldingRangeKind.Comment,
        });
        i = endLine + 1;
        continue;
      }

      i++;
      continue;
    }

    // Single-line comment
    if (trimmed.startsWith('//')) {
      const startLine = i;
      let endLine = i;

      // Collect consecutive lines
      for (let j = i + 1; j < lines.length; j++) {
        const nextTrimmed = lines[j]!.trim();
        if (nextTrimmed.startsWith('//')) {
          endLine = j;
        } else {
          break;
        }
      }

      // Only fold if multiple consecutive lines
      if (endLine > startLine) {
        ranges.push({
          startLine,
          endLine,
          kind: FoldingRangeKind.Comment,
        });
      }

      i = endLine + 1;
      continue;
    }

    i++;
  }

  return ranges;
}

/**
 * Register the folding range provider on the LSP connection.
 *
 * Provides folding ranges for:
 * - Block bodies (model, object, tuple, enum, literal)
 * - Multi-line comments
 * - Consecutive single-line comments
 */
export function registerFoldingProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onFoldingRanges((params): FoldingRange[] => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const source = doc.getText();
    const ast = indexer.getAST(params.textDocument.uri);

    const ranges: FoldingRange[] = [];

    // Add block folding ranges from AST
    if (ast) {
      // Models
      for (const model of ast.models) {
        const startLine = model.range.start.line - 1; // Convert 1-indexed to 0-indexed
        const endLine = model.range.end.line - 1;

        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
      }

      // Objects
      for (const obj of ast.objects) {
        const startLine = obj.range.start.line - 1;
        const endLine = obj.range.end.line - 1;

        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
      }

      // Tuples
      for (const tuple of ast.tuples) {
        const startLine = tuple.range.start.line - 1;
        const endLine = tuple.range.end.line - 1;

        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
      }

      // Enums
      for (const enumDef of ast.enums) {
        const startLine = enumDef.range.start.line - 1;
        const endLine = enumDef.range.end.line - 1;

        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
      }

      // Literals
      for (const literal of ast.literals) {
        const startLine = literal.range.start.line - 1;
        const endLine = literal.range.end.line - 1;

        if (endLine > startLine) {
          ranges.push({
            startLine,
            endLine,
            kind: FoldingRangeKind.Region,
          });
        }
      }
    }

    // Add comment folding ranges
    const commentRanges = extractCommentRanges(source);
    ranges.push(...commentRanges);

    return ranges;
  });
}
