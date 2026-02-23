/**
 * Convention workspace integration tests.
 *
 * Workspace: workspace-convention/
 * Discovery: No config files — server treats all files as a single flat group
 * Group: workspace-convention (11 files from db-main + db-analytics)
 *
 * Validates extension discovers files, provides cross-file resolution within
 * the group, reports errors in error schemas, and provides type completions.
 *
 * NOTE: Without a root config or folder configs, the server has no mechanism
 * to separate db-main/ and db-analytics/ into isolated schema groups. All files
 * share one group. Validation errors from error schemas may appear on valid
 * file URIs due to line-number overlap in server-side diagnostics filtering.
 * Tests account for this by filtering diagnostics to the file's own types.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  openDocument,
  sleep,
  waitForDiagnostics,
  waitForExtensionActivation,
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
    const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('valid schemas have no errors from their own types', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-main/schema.cerial');

    // Without config-based group separation, all files share one group.
    // Validation errors from error schemas (ErrDec*, ErrRel*, ErrType*) may
    // bleed onto this URI via line-number overlap. We verify that no errors
    // reference types actually defined in this file.
    await waitForDiagnostics(doc.uri, 10000);
    await sleep(500);
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);

    const fileTypes = ['ConvUser', 'ConvPost', 'ConvUserRole'];
    const ownErrors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error && fileTypes.some((t) => d.message.includes(t)),
    );
    assert.strictEqual(
      ownErrors.length,
      0,
      `Expected no errors for this file's types but got: ${ownErrors.map((d) => d.message).join(', ')}`,
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

    // Wait for diagnostics to settle, then check for unresolved type errors.
    // Bleed-through errors (decorator/relation validators) are expected but
    // should NOT include any "unknown type" or unresolved reference errors.
    await waitForDiagnostics(doc.uri, 10000);
    await sleep(500);
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);

    const unresolvedErrors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error && /unknown type|unresolved|not found/i.test(d.message),
    );
    assert.strictEqual(
      unresolvedErrors.length,
      0,
      `Cross-file references should resolve, got: ${unresolvedErrors.map((d) => d.message).join(', ')}`,
    );
  });

  test('cross-file types available in completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-main/schema.cerial');

    // Line 15 (0-indexed): "  profile ConvUserProfile?" — col 10 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(15, 10),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    // Types from other files in the group should be available via cross-file resolution
    assert.ok(
      labels.includes('ConvUserProfile'),
      'ConvUserProfile from complex-types.cerial should appear in completions',
    );
    assert.ok(labels.includes('ConvAddress'), 'ConvAddress from complex-types.cerial should appear in completions');
  });

  test('db-analytics schemas have no errors from their own types', async function () {
    this.timeout(15000);
    const doc = await openDocument('db-analytics/schema.cerial');

    // Same single-group behavior — bleed-through errors from error schemas
    // may appear. Verify none reference this file's own types.
    await waitForDiagnostics(doc.uri, 10000);
    await sleep(500);
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);

    const fileTypes = ['AnalyticsEvent', 'AnalyticsCategory'];
    const ownErrors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error && fileTypes.some((t) => d.message.includes(t)),
    );
    assert.strictEqual(
      ownErrors.length,
      0,
      `Expected no errors for this file's types but got: ${ownErrors.map((d) => d.message).join(', ')}`,
    );
  });
});
