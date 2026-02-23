/**
 * Folder config workspace integration tests.
 *
 * Workspace: workspace-folder-config/
 * Discovery: Folder-level cerial.config.json in each subdirectory
 * Groups: orders (schema.cerial, order-item.cerial), inventory (schema.cerial, stock.cerial)
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

suite('Multi-Schema: Folder Config Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'orders/schema.cerial');
    await waitForServerReady(20000, 'orders/schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with folder-config workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('orders schemas have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('orders/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in orders/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('inventory schemas have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('inventory/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in inventory/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('groups are isolated — inventory types not in orders completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('orders/schema.cerial');

    // Line 4: "  total Float" — col 8 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(4, 8),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('Product'), 'Product should not appear in orders group completions');
    assert.ok(!labels.includes('Stock'), 'Stock should not appear in orders group completions');
  });
});
