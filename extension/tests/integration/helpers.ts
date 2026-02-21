/**
 * Shared test utilities for Cerial VS Code integration tests.
 *
 * These tests run inside a real VS Code instance via @vscode/test-electron.
 * The `vscode` module is provided at runtime by VS Code's Node.js host.
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Extension ID: <publisher>.<name> from package.json */
const CERIAL_EXTENSION_ID = 'cerial.cerial';

// ---------------------------------------------------------------------------
// Basic helpers
// ---------------------------------------------------------------------------

/**
 * Simple delay. Prefer retry loops over fixed sleeps.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the root URI of the first workspace folder.
 * Throws if no workspace folder is open (misconfigured .vscode-test.mjs).
 */
export function getWorkspaceUri(): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder open — check .vscode-test.mjs workspaceFolder');
  }

  return folders[0]!.uri;
}

/**
 * Resolve a workspace-relative path to a full document URI.
 */
export function getDocumentUri(relativePath: string): vscode.Uri {
  return vscode.Uri.joinPath(getWorkspaceUri(), relativePath);
}

// ---------------------------------------------------------------------------
// Document helpers
// ---------------------------------------------------------------------------

/**
 * Open a .cerial file from the workspace and show it in the active editor.
 */
export async function openDocument(relativePath: string): Promise<vscode.TextDocument> {
  const uri = getDocumentUri(relativePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);

  return doc;
}

/**
 * Close all open editors to reset state between test suites.
 */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

// ---------------------------------------------------------------------------
// Extension activation
// ---------------------------------------------------------------------------

/**
 * Wait for the Cerial extension to activate.
 * Opens a .cerial file to trigger the `onLanguage:cerial` activation event.
 * Uses a polling loop — not a fixed sleep.
 */
export async function waitForExtensionActivation(timeout = 15000): Promise<vscode.Extension<unknown>> {
  const ext = vscode.extensions.getExtension(CERIAL_EXTENSION_ID);
  if (!ext) {
    throw new Error(`Extension ${CERIAL_EXTENSION_ID} not found. Is the extension installed?`);
  }

  if (ext.isActive) {
    return ext;
  }

  // Opening a .cerial file triggers the onLanguage:cerial activation event
  const uri = getDocumentUri('simple-model.cerial');
  await vscode.workspace.openTextDocument(uri);

  const start = Date.now();
  while (!ext.isActive && Date.now() - start < timeout) {
    await sleep(100);
  }

  if (!ext.isActive) {
    throw new Error(`Extension ${CERIAL_EXTENSION_ID} did not activate within ${timeout}ms`);
  }

  return ext;
}

// ---------------------------------------------------------------------------
// Language server readiness
// ---------------------------------------------------------------------------

/**
 * Wait for the language server to be ready by polling for completion results.
 *
 * The server needs time to:
 * 1. Start the IPC child process
 * 2. Index all .cerial files in the workspace
 * 3. Register all providers
 *
 * We detect readiness by requesting completions at a top-level position
 * (empty line) — when the server returns keyword completions, it's ready.
 */
export async function waitForServerReady(timeout = 20000): Promise<void> {
  const doc = await openDocument('simple-model.cerial');

  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(1, 0), // Line 1 = empty line → top-level completions
      );

      if (completions && completions.items.length > 0) {
        return;
      }
    } catch {
      // Server not ready yet — retry
    }
    await sleep(500);
  }

  throw new Error(`Language server did not become ready within ${timeout}ms`);
}

// ---------------------------------------------------------------------------
// Diagnostic helpers
// ---------------------------------------------------------------------------

/**
 * Wait for diagnostics to appear on a document URI.
 * Polls `vscode.languages.getDiagnostics()` in a retry loop.
 * Returns diagnostics once at least one appears, or empty array on timeout.
 */
export async function waitForDiagnostics(uri: vscode.Uri, timeout = 10000): Promise<readonly vscode.Diagnostic[]> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    await sleep(200);
  }

  // Return whatever we have (possibly empty)
  return vscode.languages.getDiagnostics(uri);
}

/**
 * Wait until a document has zero diagnostics for a stable period.
 *
 * The server may emit transient diagnostics during indexing. This helper
 * waits until diagnostics stay empty for `stableMs` milliseconds.
 */
export async function waitForNoDiagnostics(
  uri: vscode.Uri,
  stableMs = 2000,
  timeout = 10000,
): Promise<readonly vscode.Diagnostic[]> {
  const start = Date.now();
  let lastSeenEmpty = 0;

  while (Date.now() - start < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length === 0) {
      if (lastSeenEmpty === 0) {
        lastSeenEmpty = Date.now();
      }
      if (Date.now() - lastSeenEmpty >= stableMs) {
        return diagnostics;
      }
    } else {
      lastSeenEmpty = 0;
    }
    await sleep(200);
  }

  return vscode.languages.getDiagnostics(uri);
}

// ---------------------------------------------------------------------------
// Result type helpers
// ---------------------------------------------------------------------------

/**
 * Extract the target URI from a definition result.
 * Handles both Location and LocationLink shapes.
 */
export function getDefinitionUri(result: vscode.Location | vscode.LocationLink): vscode.Uri {
  if ('targetUri' in result) {
    return result.targetUri;
  }

  return result.uri;
}

/**
 * Extract a display label from a CompletionItem (handles string and CompletionItemLabel).
 */
export function getCompletionLabel(item: vscode.CompletionItem): string {
  if (typeof item.label === 'string') {
    return item.label;
  }

  return item.label.label;
}
