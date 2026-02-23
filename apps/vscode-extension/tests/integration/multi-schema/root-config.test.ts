/**
 * Root config workspace integration tests.
 *
 * Workspace: workspace-root-config/
 * Discovery: cerial.config.json with schemas.main and schemas.auth
 * Groups: main (user.cerial, post.cerial), auth (account.cerial, session.cerial)
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

suite('Multi-Schema: Root Config Workspace', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation(15000, 'schemas/main/user.cerial');
    await waitForServerReady(20000, 'schemas/main/user.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('extension activates with root-config workspace', async () => {
    const ext = vscode.extensions.getExtension('cerial.cerial');
    assert.ok(ext, 'Extension should be installed');
    assert.strictEqual(ext.isActive, true, 'Extension should be active');
  });

  test('main group schemas have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/main/user.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in user.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('auth group schemas have no errors', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/auth/account.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Expected no errors in account.cerial but got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('groups are isolated — auth types not in main completions', async function () {
    this.timeout(15000);
    const doc = await openDocument('schemas/main/user.cerial');

    // Line 4: "  name String" — col 7 is field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(4, 7),
    );

    const labels = (completions?.items ?? []).map((item) => getCompletionLabel(item));
    assert.ok(!labels.includes('Account'), 'Account should not appear in main group completions');
    assert.ok(!labels.includes('Session'), 'Session should not appear in main group completions');
  });
});
