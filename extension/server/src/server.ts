/**
 * Cerial Language Server — Desktop (Node.js) entry point.
 *
 * Uses IPC transport when launched by VS Code.
 * Provides workspace indexing with two-pass cross-file parsing,
 * file watcher integration, pull-based diagnostics, completion, and formatting.
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  createConnection,
  DidChangeWatchedFilesNotification,
  FileChangeType,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
// IMPORTANT: Import parse from parser.ts directly, NOT the barrel (src/parser/index.ts),
// because the barrel re-exports file-reader.ts which imports Bun.file() and Bun.Glob.
import { parse } from '../../../src/parser/parser';
import { WorkspaceIndexer } from './indexer';
import { registerCompletionProvider } from './providers/completion';
import { registerDefinitionProvider } from './providers/definition';
import { registerDiagnosticsProvider } from './providers/diagnostics';
import { registerFoldingProvider } from './providers/folding';
import { registerFormattingProvider } from './providers/formatting';
import { registerHoverProvider } from './providers/hover';
import { registerReferencesProvider } from './providers/references';
import { registerRenameProvider } from './providers/rename';
import { registerSemanticTokensProvider, TOKEN_MODIFIERS, TOKEN_TYPES } from './providers/semantic-tokens';
import { registerSymbolsProvider } from './providers/symbols';
import { registerWorkspaceSymbolsProvider } from './providers/workspace-symbols';

// Create connection with all proposed protocol features.
// When launched by VS Code's LanguageClient with TransportKind.ipc,
// this automatically uses the IPC transport.
const connection = createConnection(ProposedFeatures.all);

// Text document manager — keeps documents in sync via incremental updates.
const documents = new TextDocuments(TextDocument);

// Central AST cache — indexes all .cerial files with two-pass cross-file parsing.
const indexer = new WorkspaceIndexer();

// Workspace folder paths (resolved from URIs in onInitialize).
let workspaceFolders: string[] = [];

// Debounce timers for open document reindexing.
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

connection.onInitialize((params: InitializeParams): InitializeResult => {
  // Store workspace folder paths for scanning
  if (params.workspaceFolders?.length) {
    workspaceFolders = params.workspaceFolders.map((f) => fileURLToPath(f.uri));
  } else if (params.rootUri) {
    workspaceFolders = [fileURLToPath(params.rootUri)];
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: false,
      },
      completionProvider: {
        triggerCharacters: ['@', ' ', '(', ','],
        resolveProvider: false,
      },
      hoverProvider: true,
      definitionProvider: true,
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      foldingRangeProvider: true,
      documentSymbolProvider: true,
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
      workspaceSymbolProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: TOKEN_TYPES,
          tokenModifiers: TOKEN_MODIFIERS,
        },
        full: true,
      },
    },
  };
});

connection.onInitialized(async () => {
  connection.console.log('Cerial language server initialized');

  // Scan workspace for .cerial files and perform initial indexing
  if (workspaceFolders.length) {
    indexer.scanWorkspace(workspaceFolders);
    connection.console.log(`Indexed ${indexer.index.size} file(s) in ${indexer.schemaGroups.size} schema group(s)`);
  }

  // Register file watchers for .cerial and config files
  try {
    await connection.client.register(DidChangeWatchedFilesNotification.type, {
      watchers: [
        { globPattern: '**/*.cerial' },
        { globPattern: '**/cerial.config.json' },
        { globPattern: '**/cerial.config.ts' },
      ],
    });
  } catch {
    connection.console.warn('Could not register file watchers — dynamic registration not supported');
  }
});

// ── File Watcher (on-disk changes) ────────────────────────────────────────

connection.onDidChangeWatchedFiles((params) => {
  let configChanged = false;

  for (const change of params.changes) {
    const uri = change.uri;

    // Config file changed — rescan entire workspace
    if (uri.endsWith('cerial.config.json') || uri.endsWith('cerial.config.ts')) {
      configChanged = true;
      continue;
    }

    if (!uri.endsWith('.cerial')) continue;

    if (change.type === FileChangeType.Deleted) {
      indexer.removeFile(uri);
    } else {
      // Created or Changed — read from disk and reindex.
      // Skip files that are open (their content is managed by onDidChangeContent).
      if (documents.get(uri)) continue;

      try {
        const filePath = fileURLToPath(uri);
        const content = fs.readFileSync(filePath, 'utf-8');
        indexer.indexFile(uri, content, 0);
      } catch {
        // File may have been deleted between event and read
      }
    }
  }

  if (configChanged && workspaceFolders.length) {
    indexer.scanWorkspace(workspaceFolders);

    // Re-apply content from open documents (they may have unsaved changes)
    const groupsToReindex = new Set<string>();
    for (const doc of documents.all()) {
      if (doc.uri.endsWith('.cerial')) {
        indexer.updateContent(doc.uri, doc.getText(), doc.version);
        const group = indexer.getSchemaGroup(doc.uri);
        if (group) groupsToReindex.add(group.name);
      }
    }
    for (const groupName of groupsToReindex) {
      indexer.reindexSchemaGroup(groupName);
    }

    connection.console.log(
      `Re-scanned workspace: ${indexer.index.size} file(s) in ${indexer.schemaGroups.size} group(s)`,
    );
  }

  // Trigger diagnostics refresh for all open documents
  connection.languages.diagnostics.refresh();
});

// ── Open Document Changes (debounced reindexing) ──────────────────────────

documents.onDidChangeContent((change) => {
  const uri = change.document.uri;
  if (!uri.endsWith('.cerial')) return;

  // Debounce: wait 300ms after last keystroke before reindexing
  const existing = debounceTimers.get(uri);
  if (existing) clearTimeout(existing);

  debounceTimers.set(
    uri,
    setTimeout(() => {
      debounceTimers.delete(uri);
      const doc = documents.get(uri);
      if (doc) {
        indexer.indexFile(uri, doc.getText(), doc.version);
        connection.languages.diagnostics.refresh();
      }
    }, 300),
  );
});

// ── Providers ─────────────────────────────────────────────────────────────

// Register pull diagnostics (parse errors + validation errors).
registerDiagnosticsProvider(connection, documents, indexer);

// Register completion (keywords, field types, extends, Record() ID types, cross-file types).
// Prefers indexed AST (cross-file names resolved) with on-demand fallback.
// Passes the indexer for cross-file type completions (same schema group).
registerCompletionProvider(
  connection,
  documents,
  (uri) => {
    // Use indexed AST if available (has cross-file type resolution)
    const indexed = indexer.getAST(uri);
    if (indexed) return indexed;

    // Fallback: parse on demand (for files not yet indexed by debounce timer)
    const doc = documents.get(uri);
    if (!doc) return null;

    const { ast } = parse(doc.getText());

    return ast;
  },
  indexer,
);

// Register hover (rich Markdown tooltips for types, decorators, models, fields).
registerHoverProvider(connection, documents, indexer);

// Register go-to-definition (Ctrl+Click / F12 — navigate to type/model/field definitions).
registerDefinitionProvider(connection, documents, indexer);

// Register folding ranges (model/object/tuple/enum/literal blocks, comments).
registerFoldingProvider(connection, documents, indexer);

// Register formatting (Format Document / Format Selection).
registerFormattingProvider(connection, documents);

// Register find references (Shift+F12 — Find All References).
registerReferencesProvider(connection, documents, indexer);

// Register rename symbol (F2 — Rename Symbol across schema group).
registerRenameProvider(connection, documents, indexer);

// Register document symbols (Outline panel, breadcrumbs).
registerSymbolsProvider(connection, documents, indexer);

// Register workspace symbols (Ctrl+T — Go to Symbol in Workspace).
registerWorkspaceSymbolsProvider(connection, indexer);

// Register semantic tokens (AST-aware highlighting — declarations, modifiers, references).
registerSemanticTokensProvider(connection, documents, indexer);

// ── Start ─────────────────────────────────────────────────────────────────

// Wire up document manager to connection (syncs open/change/close events).
documents.listen(connection);

// Start listening for client messages.
connection.listen();
