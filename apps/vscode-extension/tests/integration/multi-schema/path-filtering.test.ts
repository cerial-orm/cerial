/**
 * Path filtering workspace integration tests.
 *
 * Workspace: workspace-path-filtering/
 * Discovery: Root config with ignore/exclude/include path filters
 * Config: ignore=["*.draft.cerial"], exclude=["experimental/*.cerial"],
 *         include=["experimental/keep.cerial"]
 * Files: model.cerial (included), feature.draft.cerial (ignored),
 *        experimental/new.cerial (excluded), experimental/keep.cerial (include overrides exclude)
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

suite('Multi-Schema: Path Filtering Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'schemas/model.cerial');
    await waitForServerReady(20000, 'schemas/model.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with path-filtering workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('included model has no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/model.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in model.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('ignored types not in completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/model.cerial');

    // Line 2: "  filterLabel String" — col 14 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(2, 14),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(
      !labels.includes('DraftModel'),
      'DraftModel (ignored via *.draft.cerial) should not appear in completions',
    );
  });

  test('excluded types not in completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/model.cerial');

    // Line 2: "  filterLabel String" — col 14 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(2, 14),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(
      !labels.includes('ExperimentalNew'),
      'ExperimentalNew (excluded via experimental/*.cerial) should not appear in completions',
    );
  });

  test('include overrides exclude — keep.cerial has no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/experimental/keep.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in keep.cerial (include overrides exclude) but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });
});
