/**
 * Workspace Symbols provider for .cerial files.
 *
 * Supports Ctrl+T (Go to Symbol in Workspace) by searching across ALL
 * indexed .cerial files for model, object, tuple, enum, and literal names.
 *
 * Returns flat WorkspaceSymbol[] (not hierarchical DocumentSymbol[]).
 * Fields are excluded — too granular for workspace-level search.
 */

import { pathToFileURL } from 'node:url';

import { type Connection, SymbolKind, type WorkspaceSymbol } from 'vscode-languageserver';
import type { SchemaAST } from '../../../../src/types';
import type { WorkspaceIndexer } from '../indexer';
import { cerialRangeToLsp } from '../utils/position';

/** Maximum number of workspace symbols returned per query. */
const MAX_RESULTS = 100;

/** Symbol kind mapping for each AST block type. */
const SYMBOL_KINDS = {
  model: SymbolKind.Class,
  object: SymbolKind.Struct,
  tuple: SymbolKind.Array,
  enum: SymbolKind.Enum,
  literal: SymbolKind.TypeParameter,
} as const;

/** A named AST node with a source range. */
interface NamedNode {
  name: string;
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
}

/**
 * Collect workspace symbols from a single AST, filtering by query.
 * Appends results to the `out` array. Returns false if the limit is reached.
 */
function collectFromAST(ast: SchemaAST, fileUri: string, query: string, out: WorkspaceSymbol[]): boolean {
  const entries: Array<{ nodes: NamedNode[]; kind: SymbolKind }> = [
    { nodes: ast.models, kind: SYMBOL_KINDS.model },
    { nodes: ast.objects, kind: SYMBOL_KINDS.object },
    { nodes: ast.tuples, kind: SYMBOL_KINDS.tuple },
    { nodes: ast.enums, kind: SYMBOL_KINDS.enum },
    { nodes: ast.literals, kind: SYMBOL_KINDS.literal },
  ];

  for (const { nodes, kind } of entries) {
    for (const node of nodes) {
      if (query && !node.name.toLowerCase().includes(query)) continue;

      out.push({
        name: node.name,
        kind,
        location: {
          uri: fileUri,
          range: cerialRangeToLsp(node.range),
        },
      });

      if (out.length >= MAX_RESULTS) return false;
    }
  }

  return true;
}

/**
 * Register the workspace symbols provider on the LSP connection.
 *
 * Iterates all indexed files across all schema groups and returns
 * matching symbols for the given query string.
 */
export function registerWorkspaceSymbolsProvider(connection: Connection, indexer: WorkspaceIndexer): void {
  connection.onWorkspaceSymbol((params): WorkspaceSymbol[] => {
    const query = params.query.toLowerCase();
    const results: WorkspaceSymbol[] = [];

    for (const [filePath, entry] of indexer.index) {
      if (!entry.ast) continue;

      const fileUri = pathToFileURL(filePath).toString();
      const canContinue = collectFromAST(entry.ast, fileUri, query, results);
      if (!canContinue) break;
    }

    return results;
  });
}
