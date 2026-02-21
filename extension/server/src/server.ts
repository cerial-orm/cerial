/**
 * Cerial Language Server — Desktop (Node.js) entry point.
 *
 * Uses IPC transport when launched by VS Code.
 * Provides pull-based diagnostics (skeleton — no real validation yet).
 */

import {
  createConnection,
  type DocumentDiagnosticReport,
  DocumentDiagnosticReportKind,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  validateFieldNames,
  validateModelNames,
  validateSchema as validateSchemaFields,
} from '../../../src/cli/validators';
import { formatCerialSource } from '../../../src/formatter';
// --- Cerial core imports (bundled by esbuild, no Bun dependency) ---
// IMPORTANT: Import parse from parser.ts directly, NOT the barrel (src/parser/index.ts),
// because the barrel re-exports file-reader.ts which imports Bun.file() and Bun.Glob.
import { parse } from '../../../src/parser/parser';
import { resolveInheritance } from '../../../src/resolver';

/**
 * Cerial language API surface — parser, formatter, resolver, validators.
 * Exposed as a single object so esbuild retains the imports (no tree-shaking).
 * The language server features (diagnostics, formatting, etc.) will call into these.
 */
export const cerialApi = {
  parse,
  formatCerialSource,
  resolveInheritance,
  validateSchemaFields,
  validateFieldNames,
  validateModelNames,
};

// Create connection with all proposed protocol features.
// When launched by VS Code's LanguageClient with TransportKind.ipc,
// this automatically uses the IPC transport.
const connection = createConnection(ProposedFeatures.all);

// Text document manager — keeps documents in sync via incremental updates.
const documents = new TextDocuments(TextDocument);

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: false,
      },
    },
  };
});

connection.onInitialized(() => {
  connection.console.log('Cerial language server initialized');
});

// Pull diagnostics — VS Code requests diagnostics for a document, we respond.
// Skeleton: returns empty diagnostics. Real validation will be wired in later.
connection.languages.diagnostics.on(async (_params): Promise<DocumentDiagnosticReport> => {
  return {
    kind: DocumentDiagnosticReportKind.Full,
    items: [],
  };
});

// Wire up document manager to connection (syncs open/change/close events).
documents.listen(connection);

// Start listening for client messages.
connection.listen();
