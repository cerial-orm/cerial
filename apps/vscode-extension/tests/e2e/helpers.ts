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

// ---------------------------------------------------------------------------
// Document editing helpers
// ---------------------------------------------------------------------------

/**
 * Apply a workspace edit containing a single text edit to a document.
 * Uses vscode.workspace.applyEdit which fires onDidChangeTextDocument.
 */
export async function editDocument(doc: vscode.TextDocument, edit: vscode.TextEdit): Promise<boolean> {
  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.set(doc.uri, [edit]);

  return vscode.workspace.applyEdit(wsEdit);
}

/**
 * Insert text at a position in an open document.
 */
export async function insertText(doc: vscode.TextDocument, position: vscode.Position, text: string): Promise<boolean> {
  return editDocument(doc, vscode.TextEdit.insert(position, text));
}

/**
 * Delete a range of text from an open document.
 */
export async function deleteText(doc: vscode.TextDocument, range: vscode.Range): Promise<boolean> {
  return editDocument(doc, vscode.TextEdit.delete(range));
}

/**
 * Replace entire document content.
 */
export async function replaceDocument(doc: vscode.TextDocument, newContent: string): Promise<boolean> {
  const fullRange = new vscode.Range(doc.lineAt(0).range.start, doc.lineAt(doc.lineCount - 1).range.end);

  return editDocument(doc, vscode.TextEdit.replace(fullRange, newContent));
}

/**
 * Wait for diagnostics to change from a known previous state.
 * Returns when diagnostics differ from prevDiagnostics, or on timeout.
 */
export async function waitForDiagnosticsChange(
  uri: vscode.Uri,
  prevCount: number,
  timeout = 10000,
): Promise<readonly vscode.Diagnostic[]> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const current = vscode.languages.getDiagnostics(uri);
    if (current.length !== prevCount) {
      return current;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return vscode.languages.getDiagnostics(uri);
}

/**
 * Get code actions available for a given range in a document.
 */
export async function getCodeActions(doc: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
  const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
    'vscode.executeCodeActionProvider',
    doc.uri,
    range,
  );

  return actions ?? [];
}

/**
 * Apply a code action that has a workspace edit.
 * Returns true if the edit was applied successfully.
 */
export async function applyCodeAction(action: vscode.CodeAction): Promise<boolean> {
  if (action.edit) {
    return vscode.workspace.applyEdit(action.edit);
  }

  return false;
}
