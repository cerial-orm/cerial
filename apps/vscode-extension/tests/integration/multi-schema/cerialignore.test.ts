/**
 * Cerialignore workspace integration tests.
 *
 * Workspace: workspace-cerialignore/
 * Discovery: Convention with .cerialignore at root
 * .cerialignore: "legacy/*.cerial"
 * Files: db/schema.cerial, db/post.cerial (included), db/legacy/old-model.cerial (ignored)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  openDocument,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

suite('Multi-Schema: Cerialignore Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'db/schema.cerial');
    await waitForServerReady(20000, 'db/schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with cerialignore workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('db/schema.cerial has no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('db/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in db/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('db/post.cerial has no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('db/post.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in db/post.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('cerialignore-excluded types not in completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('db/schema.cerial');

    // Line 3: "  username String" — col 11 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(3, 11),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('OldModel'), 'OldModel (cerialignore-excluded) should not appear in completions');
  });
});
