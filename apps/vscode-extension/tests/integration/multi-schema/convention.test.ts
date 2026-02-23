/**
 * Convention workspace integration tests.
 *
 * Workspace: workspace-convention/
 * Discovery: Convention markers (schema.cerial in each folder)
 * Groups: db-main (9 files), db-analytics (2 files)
 *
 * Validates extension discovers convention-based schema groups,
 * provides cross-file resolution within groups, reports errors
 * in error schemas, and isolates types between groups.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  openDocument,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

suite('Multi-Schema: Convention Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'db-main/schema.cerial');
    await waitForServerReady(20000, 'db-main/schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with convention workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('valid schemas have no error diagnostics', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-main/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in db-main/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('error schemas have diagnostics', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-main/errors-relations.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    assert.ok(diagnostics.length > 0, 'errors-relations.cerial should have at least one diagnostic');
  });

  test('cross-file references resolve without errors', async function () {
    this.timeout(15000);
    // schema.cerial references ConvUserProfile from complex-types.cerial
    const doc = await openDocument('db-main/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Cross-file references should resolve, got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('schema group isolation — analytics types not in db-main completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-main/schema.cerial');

    // Request completions at a field type position (line 9: "  birthDate Date?" → col 12)
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(9, 12),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('AnalyticsEvent'), 'AnalyticsEvent should not appear in db-main completions');
    assert.ok(!labels.includes('AnalyticsMetric'), 'AnalyticsMetric should not appear in db-main completions');
    assert.ok(!labels.includes('AnalyticsCategory'), 'AnalyticsCategory should not appear in db-main completions');
  });

  test('db-analytics schemas have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-analytics/schema.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in db-analytics/schema.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });
});
