/**
 * E2E test helpers.
 *
 * Re-exports integration helpers and adds E2E-specific utilities for
 * performance measurement, temporary documents, and isolated workspace paths.
 */

import * as vscode from 'vscode';

// Re-export all integration helpers
export {
  closeAllEditors,
  getCompletionLabel,
  getDefinitionUri,
  getDocumentUri,
  getWorkspaceUri,
  openDocument,
  sleep,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../integration/helpers';

// ---------------------------------------------------------------------------
// Performance measurement
// ---------------------------------------------------------------------------

/** Result of a timed function execution. */
export interface TimedResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Measure the execution time of an async function.
 * Returns both the result and the elapsed time in milliseconds.
 */
export async function measureTime<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;

  return { result, durationMs };
}

// ---------------------------------------------------------------------------
// Temporary document helpers
// ---------------------------------------------------------------------------

/**
 * Create a temporary .cerial document in the workspace and open it.
 *
 * Uses VS Code's untitled document API with the cerial language ID.
 * The document lives only in memory — no disk file is created.
 *
 * @param content - The .cerial source to populate the document with.
 * @param filename - Optional filename hint (unused for untitled docs, included for clarity).
 * @returns The opened TextDocument.
 */
export async function createTempDocument(content: string, _filename?: string): Promise<vscode.TextDocument> {
  const doc = await vscode.workspace.openTextDocument({
    language: 'cerial',
    content,
  });
  await vscode.window.showTextDocument(doc);

  return doc;
}

// ---------------------------------------------------------------------------
// Isolated workspace path helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a path within the isolated workspace fixture directories.
 *
 * The isolated workspace lives at `tests/fixtures/workspace-isolated/`
 * relative to the extension root. Each group (group-a, group-b) is a
 * subdirectory with its own .cerial files.
 *
 * @param group - Schema group directory name (e.g., 'group-a', 'group-b').
 * @param relativePath - Path relative to the group directory.
 * @returns Full VS Code URI for the file.
 */
export function getWorkspaceIsolatedUri(group: string, relativePath: string): vscode.Uri {
  // The workspace folder is tests/fixtures/workspace — we navigate to the
  // sibling workspace-isolated directory
  const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceUri) {
    throw new Error('No workspace folder open — check .vscode-test.mjs workspaceFolder');
  }

  // Go up from workspace/ to fixtures/, then into workspace-isolated/group/file
  const fixturesDir = vscode.Uri.joinPath(workspaceUri, '..');
  const isolatedPath = vscode.Uri.joinPath(fixturesDir, 'workspace-isolated', group, relativePath);

  return isolatedPath;
}

/**
 * Open a document from the isolated workspace fixture.
 *
 * @param group - Schema group directory name (e.g., 'group-a', 'group-b').
 * @param relativePath - Path relative to the group directory.
 * @returns The opened TextDocument.
 */
export async function openIsolatedDocument(group: string, relativePath: string): Promise<vscode.TextDocument> {
  const uri = getWorkspaceIsolatedUri(group, relativePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);

  return doc;
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

/**
 * Poll a condition until it returns a truthy value or timeout is reached.
 * Prefer this over fixed sleeps for timing-sensitive checks.
 *
 * @param fn - Async function to poll. Should return a value when ready, or falsy to keep polling.
 * @param timeout - Maximum time to wait in milliseconds.
 * @param interval - Polling interval in milliseconds.
 * @returns The first truthy result, or null on timeout.
 */
export async function pollUntil<T>(
  fn: () => Promise<T | null | undefined>,
  timeout = 10000,
  interval = 200,
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return null;
}
