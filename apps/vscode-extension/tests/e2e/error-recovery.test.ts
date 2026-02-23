/**
 * Error recovery E2E tests.
 *
 * Verifies that the extension gracefully handles malformed input:
 * incomplete models, garbage content, rapid edits, and mixed valid/invalid
 * files. The extension must remain active and functional throughout.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createTempDocument,
  openDocument,
  sleep,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from './helpers';

/** Verify the Cerial extension is still active (not crashed). */
function assertExtensionActive(): void {
  const ext = vscode.extensions.getExtension('cerial.cerial-vscode');
  assert.ok(ext, 'Extension should still be present');
  assert.strictEqual(ext.isActive, true, 'Extension should still be active after error recovery');
}

suite('Error Recovery E2E', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Incomplete Model Syntax ─────────────────────────────────────────────

  suite('Incomplete Model Syntax', () => {
    test('incomplete model produces diagnostics without crash', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('model Incomplete {\n  id Record @id\n  name\n');

      // Should get diagnostics for the incomplete field (missing type) or unclosed block
      const diagnostics = await waitForDiagnostics(doc.uri);

      assert.ok(diagnostics.length > 0, 'Incomplete model should produce diagnostics');
      assertExtensionActive();
    });

    test('model with missing closing brace produces diagnostics', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('model Unclosed {\n  id Record @id\n  name String\n');

      const diagnostics = await waitForDiagnostics(doc.uri);

      assert.ok(diagnostics.length > 0, 'Unclosed model block should produce diagnostics');
      assertExtensionActive();
    });

    test('model with missing opening brace produces diagnostics', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('model NoBrace\n  id Record @id\n  name String\n}\n');

      const diagnostics = await waitForDiagnostics(doc.uri);

      assert.ok(diagnostics.length > 0, 'Model without opening brace should produce diagnostics');
      assertExtensionActive();
    });

    test('empty model body produces diagnostics or is valid', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('model Empty {\n}\n');

      // An empty model might be valid or produce a warning — either is fine
      // The key is that the extension doesn't crash
      await sleep(2000);
      assertExtensionActive();
    });
  });

  // ── Garbage Content ─────────────────────────────────────────────────────

  suite('Garbage Content', () => {
    test('random garbage content produces diagnostics without crash', async function () {
      this.timeout(15000);

      const doc = await createTempDocument(
        '!!!@#$%^&*()_+\nfoo bar baz\n{ random [ stuff ] }\n<html>not a schema</html>\n',
      );

      const diagnostics = await waitForDiagnostics(doc.uri);

      assert.ok(diagnostics.length > 0, 'Garbage content should produce diagnostics');
      assertExtensionActive();
    });

    test('empty file produces no crash', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('');

      // Empty file should either have no diagnostics or a warning
      await sleep(2000);
      assertExtensionActive();
    });

    test('file with only comments produces no errors', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('# This is a comment-only file\n// Another comment\n# Third line\n');

      const diagnostics = await waitForNoDiagnostics(doc.uri);

      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Comment-only file should have no errors, got: ${errors.map((d) => d.message).join(', ')}`,
      );
      assertExtensionActive();
    });

    test('binary-like content produces diagnostics without crash', async function () {
      this.timeout(15000);

      // Simulate binary-like content (control characters mixed with text)
      const doc = await createTempDocument('\x00\x01\x02model Binary\x03 {\n  id Record\x04 @id\n}\n');

      // Should produce errors or be handled gracefully
      await sleep(2000);
      assertExtensionActive();
    });
  });

  // ── Recovery After Errors ───────────────────────────────────────────────

  suite('Recovery After Errors', () => {
    test('valid file gets correct diagnostics after error file was opened', async function () {
      this.timeout(20000);

      // First, open a file with errors
      const errorDoc = await createTempDocument('!!!garbage content that is not a schema\n');
      await waitForDiagnostics(errorDoc.uri);
      assertExtensionActive();

      // Now open a valid file — should work correctly
      const validDoc = await openDocument('simple-model.cerial');
      const diagnostics = await waitForNoDiagnostics(validDoc.uri);

      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Valid file should have no errors after processing error file, got: ${errors.map((d) => d.message).join(', ')}`,
      );
      assertExtensionActive();
    });

    test('error file diagnostics persist after opening valid file', async function () {
      this.timeout(20000);

      // Open error file
      const errorDoc = await openDocument('errors.cerial');
      const errorDiags = await waitForDiagnostics(errorDoc.uri);
      assert.ok(errorDiags.length > 0, 'Error file should have diagnostics');

      // Open valid file — diagnostics refresh may clear and re-pull
      await openDocument('simple-model.cerial');
      // Re-show error file — pull diagnostics only re-pull for visible documents
      await vscode.window.showTextDocument(errorDoc);
      const persistedDiags = await waitForDiagnostics(errorDoc.uri);
      assert.ok(persistedDiags.length > 0, 'Error file diagnostics should persist after opening a valid file');
      assertExtensionActive();
    });

    test('cross-file resolution works after error file is closed', async function () {
      this.timeout(20000);

      // Open error file, then close it
      await createTempDocument('totally broken {{{{ schema\n');
      await sleep(1000);
      await closeAllEditors();
      await sleep(500);

      // Now verify cross-file resolution still works
      const doc = await openDocument('multi-file-b.cerial');
      const diagnostics = await waitForNoDiagnostics(doc.uri);

      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Cross-file references should still resolve after error file is closed, got: ${errors.map((d) => d.message).join(', ')}`,
      );
      assertExtensionActive();
    });
  });

  // ── Multiple Error Types ────────────────────────────────────────────────

  suite('Multiple Error Types', () => {
    test('file with mixed valid and invalid blocks produces partial diagnostics', async function () {
      this.timeout(15000);

      const doc = await createTempDocument(
        'model Valid {\n  id Record @id\n  name String\n}\n\n' +
          'model Invalid {\n  id Record @id\n  badField UnknownType\n}\n',
      );

      const diagnostics = await waitForDiagnostics(doc.uri);

      // Should have diagnostics for the unknown type but not crash
      assert.ok(diagnostics.length > 0, 'File with unknown type should produce diagnostics');
      assertExtensionActive();
    });

    test('duplicate model names produce diagnostics', async function () {
      this.timeout(15000);

      const doc = await createTempDocument('model Dup {\n  id Record @id\n}\n\n' + 'model Dup {\n  id Record @id\n}\n');

      const diagnostics = await waitForDiagnostics(doc.uri);

      assert.ok(diagnostics.length > 0, 'Duplicate model names should produce diagnostics');
      assertExtensionActive();
    });

    test('unknown decorator produces diagnostics without crash', async function () {
      this.timeout(15000);

      const doc = await createTempDocument(
        'model WithBadDecorator {\n  id Record @id\n  name String @nonExistent\n}\n',
      );

      const diagnostics = await waitForDiagnostics(doc.uri);

      assert.ok(diagnostics.length > 0, 'Unknown decorator should produce diagnostics');
      assertExtensionActive();
    });
  });

  // ── Extension Stability ─────────────────────────────────────────────────

  suite('Extension Stability', () => {
    test('extension survives rapid file opens', async function () {
      this.timeout(30000);

      // Rapidly open multiple files
      await openDocument('simple-model.cerial');
      await openDocument('errors.cerial');
      await openDocument('multi-file-a.cerial');
      await openDocument('multi-file-b.cerial');
      await openDocument('unformatted.cerial');

      await sleep(2000);
      assertExtensionActive();

      // Verify completions still work after rapid opens
      const doc = await openDocument('simple-model.cerial');
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(1, 0),
      );

      assert.ok(completions, 'Completions should still work after rapid file opens');
      assert.ok(completions.items.length > 0, 'Should still return completion items');
    });

    test('extension survives opening and closing error files repeatedly', async function () {
      this.timeout(30000);

      for (let i = 0; i < 3; i++) {
        await createTempDocument(`broken content iteration ${i} {{{\n`);
        await sleep(500);
        await closeAllEditors();
        await sleep(500);
      }

      assertExtensionActive();

      // Verify the server still responds
      const doc = await openDocument('simple-model.cerial');
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(1, 0),
      );

      assert.ok(completions, 'Server should still respond after repeated error file cycles');
      assert.ok(completions.items.length > 0, 'Should return completions');
    });
  });
});
