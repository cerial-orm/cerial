/**
 * Cerial Language Client — Desktop (Node.js) entry point.
 *
 * Activates on `.cerial` files and connects to the language server via IPC.
 */

import * as path from 'path';
import type { ExtensionContext } from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // Resolve the bundled server module path.
  const serverModule = context.asAbsolutePath(path.join('dist', 'server.js'));

  // Server runs in a separate Node.js process, communicating via IPC.
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ['--nolazy', '--inspect=6009'] },
    },
  };

  // Activate for .cerial files from disk and untitled (in-memory) documents.
  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'cerial' },
      { scheme: 'untitled', language: 'cerial' },
    ],
  };

  client = new LanguageClient('cerialLanguageServer', 'Cerial Language Server', serverOptions, clientOptions);

  // Start the client — this also launches the server process.
  await client.start();

  context.subscriptions.push({
    dispose: () => {
      if (client) {
        client.stop();
      }
    },
  });
}

export async function deactivate(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}
