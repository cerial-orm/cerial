/**
 * Root+folder override workspace integration tests.
 *
 * Workspace: workspace-root-folder-override/
 * Discovery: Root config exclude + folder config exclude
 * Files: model.cerial (included), draft-feature.cerial (root-excluded),
 *        internal-utils.cerial (folder-excluded)
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

suite('Multi-Schema: Root+Folder Override Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'schemas/main/model.cerial');
    await waitForServerReady(20000, 'schemas/main/model.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with root-folder-override workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('included model has no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/main/model.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in model.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('root-excluded types not in completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/main/model.cerial');

    // Line 2: "  label String" — col 8 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(2, 8),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('DraftFeature'), 'DraftFeature (root-excluded) should not appear in completions');
  });

  test('folder-excluded types not in completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/main/model.cerial');

    // Line 2: "  label String" — col 8 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(2, 8),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('InternalUtil'), 'InternalUtil (folder-excluded) should not appear in completions');
  });
});
