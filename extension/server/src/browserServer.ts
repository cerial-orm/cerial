/**
 * Cerial Language Server — Browser (Web Worker) entry point.
 *
 * Uses BrowserMessageReader/BrowserMessageWriter for communication
 * when running in vscode.dev or github.dev.
 */

import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createConnection,
  type DocumentDiagnosticReport,
  DocumentDiagnosticReportKind,
  type InitializeParams,
  type InitializeResult,
  TextDocumentSyncKind,
  TextDocuments,
} from 'vscode-languageserver/browser';

import { TextDocument } from 'vscode-languageserver-textdocument';

// `self` refers to the DedicatedWorkerGlobalScope in Web Workers.
// The ESNext lib doesn't include WebWorker types, so we declare the
// minimal shape that BrowserMessageReader/BrowserMessageWriter need.
declare const self: {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(data: unknown): void;
  addEventListener(type: string, listener: (ev: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (ev: MessageEvent) => void): void;
};

/* Browser-specific transport setup */
const messageReader = new BrowserMessageReader(self);
const messageWriter = new BrowserMessageWriter(self);

const connection = createConnection(messageReader, messageWriter);

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
  connection.console.log('Cerial language server initialized (browser)');
});

// Pull diagnostics skeleton — same as desktop server.
connection.languages.diagnostics.on(async (_params): Promise<DocumentDiagnosticReport> => {
  return {
    kind: DocumentDiagnosticReportKind.Full,
    items: [],
  };
});

documents.listen(connection);
connection.listen();
