/**
 * Mixed discovery workspace integration tests.
 *
 * Workspace: workspace-mixed/
 * Discovery: Root config (api-schemas), folder config (events), convention (logs)
 * Groups: api-schemas (schema.cerial, routes.cerial), events (schema.cerial, handler.cerial),
 *         logs (schema.cerial, log-entry.cerial)
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

suite('Multi-Schema: Mixed Discovery Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'api-schemas/schema.cerial');
    await waitForServerReady(20000, 'api-schemas/schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with mixed workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('api-schemas files have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('api-schemas/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in api-schemas/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('events files have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('events/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in events/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('logs files have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('logs/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in logs/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('groups are isolated — events types not in api-schemas completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('api-schemas/schema.cerial');

    // Line 4: "  endpoint String" — col 11 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(4, 11),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('EventRecord'), 'EventRecord should not appear in api-schemas completions');
    assert.ok(!labels.includes('EventHandler'), 'EventHandler should not appear in api-schemas completions');
    assert.ok(!labels.includes('LogEntry'), 'LogEntry should not appear in api-schemas completions');
    assert.ok(!labels.includes('LogDetail'), 'LogDetail should not appear in api-schemas completions');
  });
});
