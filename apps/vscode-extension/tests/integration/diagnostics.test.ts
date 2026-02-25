/**
 * Diagnostic integration tests.
 *
 * Verifies that the language server reports parse errors and validation
 * errors as VS Code diagnostics with correct severity, source, and ranges.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  openDocument,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from './helpers';

suite('Diagnostics', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('reports diagnostics for files with errors', async () => {
    const doc = await openDocument('errors.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    assert.ok(
      diagnostics.length > 0,
      'Should have at least one diagnostic for a file with unknown types and duplicate fields',
    );
  });

  test('diagnostics have Error severity for schema issues', async () => {
    const doc = await openDocument('errors.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(errors.length > 0, 'Should have at least one Error-severity diagnostic');
  });

  test('valid file has no error diagnostics', async () => {
    const doc = await openDocument('simple-model.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(errors.length, 0, `Expected no errors but got: ${errors.map((d) => d.message).join(', ')}`);
  });

  test('diagnostics have source "cerial"', async () => {
    const doc = await openDocument('errors.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    const withSource = diagnostics.filter((d) => d.source === 'cerial');
    assert.ok(withSource.length > 0, 'Diagnostics should have source "cerial"');
  });

  test('diagnostics have valid ranges', async () => {
    const doc = await openDocument('errors.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    for (const diag of diagnostics) {
      assert.ok(
        diag.range.start.line >= 0,
        `Diagnostic start line should be non-negative, got ${diag.range.start.line}`,
      );
      assert.ok(
        diag.range.start.character >= 0,
        `Diagnostic start character should be non-negative, got ${diag.range.start.character}`,
      );
      assert.ok(diag.range.end.line >= diag.range.start.line, 'Diagnostic end line should be >= start line');
    }
  });

  test('diagnostics update when document content changes', async function () {
    this.timeout(15000);

    // Open valid file — should have no errors
    const doc = await openDocument('simple-model.cerial');
    await waitForNoDiagnostics(doc.uri);

    const initialErrors = vscode.languages
      .getDiagnostics(doc.uri)
      .filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(initialErrors.length, 0, 'Valid file should start with no errors');
  });

  test('cross-file diagnostics work across schema group', async function () {
    this.timeout(15000);

    // Open multi-file-b.cerial which references types from multi-file-a.cerial
    // If cross-file resolution works, Employee and ContactInfo should resolve
    const doc = await openDocument('multi-file-b.cerial');
    const diagnostics = await waitForNoDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.strictEqual(
      errors.length,
      0,
      `Cross-file references should resolve without errors, got: ${errors.map((d) => d.message).join(', ')}`,
    );
  });

  test('extends pick without @id reports diagnostic error', async function () {
    this.timeout(15000);

    const doc = await openDocument('extends-errors.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(errors.length > 0, 'Should report error when extends pick drops @id field');

    const idError = errors.find((d) => d.message.includes('@id'));
    assert.ok(idError, `Should have diagnostic about missing @id, got: ${errors.map((d) => d.message).join('; ')}`);
  });
});
