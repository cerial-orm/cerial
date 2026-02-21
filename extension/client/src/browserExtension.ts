/**
 * Cerial Language Client — Browser (Web Worker) entry point.
 *
 * Activates on `.cerial` files in vscode.dev / github.dev
 * and connects to the browser server via a Web Worker.
 */

import { type ExtensionContext, Uri } from 'vscode';
import type { LanguageClientOptions } from 'vscode-languageclient';
import { LanguageClient } from 'vscode-languageclient/browser';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  // Resolve the bundled browser server worker script.
  const serverMain = Uri.joinPath(context.extensionUri, 'dist', 'browserServer.js');
  const worker = new Worker(serverMain.toString(true));

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ language: 'cerial' }],
  };

  client = new LanguageClient('cerialLanguageServer', 'Cerial Language Server', clientOptions, worker);

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
