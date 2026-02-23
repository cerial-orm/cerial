/**
 * Edit-Feedback Workflow E2E tests.
 *
 * Simulates the edit → diagnostic feedback loop: when a user edits a .cerial
 * file, diagnostics should appear/disappear correctly in response.
 *
 * Uses schema.cerial from workspace-e2e-workflows fixture.
 *
 * Workspace file line map (0-indexed):
 *
 * schema.cerial:
 *   0: // @convention marker
 *   1: model WfUser {
 *   2:   id Record @id
 *   3:   email Email @unique
 *   4:   name String
 *   5:   age Int?
 *   6:   role WfRole @default(Admin)
 *   7:   address WfAddress?
 *   8:   createdAt Date @createdAt
 *   9: }
 *  10: (empty)
 *  11: model WfPost {
 *  12:   id Record @id
 *  13:   title String
 *  14:   body String?
 *  15:   published Bool @default(false)
 *  16: }
 *  17: (empty)
 *  18: model RenameTarget {
 *  19:   id Record @id
 *  20:   label String
 *  21:   value Int
 *  22: }
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  openDocument,
  replaceDocument,
  waitForDiagnostics,
  waitForDiagnosticsChange,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

suite('Edit-Feedback Workflows', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation(undefined, 'schema.cerial');
    await waitForServerReady(undefined, 'schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('insert invalid decorator triggers diagnostic, removal clears it', async function () {
    this.timeout(30000);

    // Step 1: Open document and capture original content
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Insert @now on String field (invalid — @now only valid on Date)
      const contentWithNow = originalContent.replace('  name String', '  name String @now');
      await replaceDocument(doc, contentWithNow);
      await doc.save();

      // Step 3: Wait for diagnostic to appear and verify
      const diagnostics = await waitForDiagnostics(doc.uri, 15000);
      assert.ok(diagnostics.length > 0, 'Should have at least one diagnostic after adding @now to String field');

      const hasRelevantDiagnostic = diagnostics.some(
        (d) =>
          d.message.toLowerCase().includes('now') ||
          d.message.toLowerCase().includes('date') ||
          d.message.toLowerCase().includes('timestamp'),
      );
      assert.ok(
        hasRelevantDiagnostic,
        `Expected diagnostic about @now on non-Date field, got: ${diagnostics.map((d) => d.message).join('; ')}`,
      );

      // Step 4: Fix by restoring original content
      await replaceDocument(doc, originalContent);
      await doc.save();

      // Step 5: Wait for diagnostics to clear and verify zero errors
      const clearedDiagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = clearedDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Diagnostics should clear after removing @now, got: ${errors.map((d) => d.message).join('; ')}`,
      );
    } finally {
      // Always restore original content to disk
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });

  test('insert unknown type reference triggers diagnostic, fixing clears it', async function () {
    this.timeout(30000);

    // Step 1: Open document and capture original content
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Change field type to UnknownType
      const contentWithUnknown = originalContent.replace('  name String', '  name UnknownType');
      await replaceDocument(doc, contentWithUnknown);
      await doc.save();

      // Step 3: Wait for diagnostic about unknown type and verify
      const diagnostics = await waitForDiagnostics(doc.uri, 15000);
      assert.ok(diagnostics.length > 0, 'Should have at least one diagnostic for unknown type reference');

      const hasUnknownTypeDiagnostic = diagnostics.some(
        (d) =>
          d.message.toLowerCase().includes('unknown') ||
          d.message.toLowerCase().includes('not found') ||
          d.message.toLowerCase().includes('undefined') ||
          d.message.toLowerCase().includes('unknowntype'),
      );
      assert.ok(
        hasUnknownTypeDiagnostic,
        `Expected diagnostic about unknown type, got: ${diagnostics.map((d) => d.message).join('; ')}`,
      );

      // Step 4: Fix by restoring to String
      await replaceDocument(doc, originalContent);
      await doc.save();

      // Step 5: Wait for diagnostics to clear and verify zero errors
      const clearedDiagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = clearedDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Diagnostics should clear after fixing type reference, got: ${errors.map((d) => d.message).join('; ')}`,
      );
    } finally {
      // Always restore original content to disk
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });

  test('multiple errors fixed incrementally clears diagnostics one by one', async function () {
    this.timeout(30000);

    // Step 1: Open document and capture original content
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Introduce two distinct errors
      // Error 1: unknown type on name field (line 4)
      // Error 2: @now on Int field (line 5) — @now only valid on Date
      const contentWithTwoErrors = originalContent
        .replace('  name String', '  name UnknownType')
        .replace('  age Int?', '  age Int? @now');
      await replaceDocument(doc, contentWithTwoErrors);
      await doc.save();

      // Step 3: Wait for multiple diagnostics and verify at least 2
      const diagnostics = await waitForDiagnostics(doc.uri, 15000);
      assert.ok(
        diagnostics.length >= 2,
        `Should have at least 2 diagnostics, got ${diagnostics.length}: ${diagnostics.map((d) => d.message).join('; ')}`,
      );
      const initialCount = diagnostics.length;

      // Step 4: Fix first error only (restore name to String, keep @now on age)
      const contentWithOneError = originalContent.replace('  age Int?', '  age Int? @now');
      await replaceDocument(doc, contentWithOneError);
      await doc.save();

      // Step 5: Wait for diagnostic count to decrease
      const partialFix = await waitForDiagnosticsChange(doc.uri, initialCount, 15000);
      assert.ok(
        partialFix.length < initialCount,
        `Diagnostic count should decrease after fixing one error: was ${initialCount}, now ${partialFix.length}`,
      );
      assert.ok(partialFix.length > 0, 'Should still have at least one diagnostic for remaining @now error');

      // Step 6: Fix second error (restore age field to original)
      await replaceDocument(doc, originalContent);
      await doc.save();

      // Step 7: Wait for all diagnostics to clear and verify zero errors
      const clearedDiagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = clearedDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `All diagnostics should clear after fixing both errors, got: ${errors.map((d) => d.message).join('; ')}`,
      );
    } finally {
      // Always restore original content to disk
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });
});
