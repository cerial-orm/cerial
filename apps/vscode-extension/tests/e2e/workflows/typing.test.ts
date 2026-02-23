/**
 * Typing Workflow E2E tests.
 *
 * Simulates incremental typing with real-time feedback: typing character by
 * character (or in small chunks) triggers appropriate completions and
 * diagnostics from the language server.
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
  getCompletionLabel,
  insertText,
  openDocument,
  pollUntil,
  replaceDocument,
  sleep,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

suite('Typing Workflows', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation(undefined, 'schema.cerial');
    await waitForServerReady(undefined, 'schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('type field name and get type completions', async function () {
    this.timeout(30000);

    // Step 1: Open document and save original content
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Insert a new line inside WfUser model before the closing brace (line 9)
      // We insert at the end of line 8 (createdAt Date @createdAt) to create a new field line
      const line8End = doc.lineAt(8).range.end;
      await insertText(doc, line8End, '\n  ');
      await sleep(100);

      // Step 3: Type field name incrementally — build "new" in chunks
      // After the newline+indent, cursor is at line 9, col 2
      let pos = new vscode.Position(9, 2);
      await insertText(doc, pos, 'ne');
      await sleep(100);

      pos = new vscode.Position(9, 4);
      await insertText(doc, pos, 'w');
      await sleep(100);

      // Step 4: Add space after field name to move to type position
      pos = new vscode.Position(9, 5);
      await insertText(doc, pos, ' ');
      await sleep(200);

      // Step 5: Trigger completions at the type position and verify
      const typePos = new vscode.Position(9, 6);
      const completions = await pollUntil(async () => {
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          typePos,
        );
        if (result && result.items.length > 0) return result;

        return null;
      }, 10000);

      assert.ok(completions, 'Should receive type completions after typing field name');
      const labels = completions.items.map(getCompletionLabel);

      // Verify built-in types appear
      assert.ok(labels.includes('String'), 'Type completions should include String');
      assert.ok(labels.includes('Int'), 'Type completions should include Int');
      assert.ok(labels.includes('Bool'), 'Type completions should include Bool');
      assert.ok(labels.includes('Date'), 'Type completions should include Date');

      // Step 6: Complete the field by inserting a type
      await insertText(doc, typePos, 'String');
      await sleep(200);

      // Step 7: Wait for diagnostics to settle and verify zero errors
      const diagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Complete field should have no errors, got: ${errors.map((d) => d.message).join('; ')}`,
      );
    } finally {
      // Always restore original content
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });

  test('type decorator and get decorator completions', async function () {
    this.timeout(30000);

    // Step 1: Open document and save original content
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Insert a new field line inside WfPost before closing brace (line 16)
      // Insert at end of line 15 (published Bool @default(false))
      const line15End = doc.lineAt(15).range.end;
      await insertText(doc, line15End, '\n  extra String ');
      await sleep(200);

      // Step 3: Type '@' to trigger decorator completions
      const atPos = new vscode.Position(16, 16);
      await insertText(doc, atPos, '@');
      await sleep(200);

      // Step 4: Trigger completions after '@' and verify decorator suggestions
      const completionPos = new vscode.Position(16, 17);
      const completions = await pollUntil(async () => {
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          completionPos,
        );
        if (result && result.items.length > 0) return result;

        return null;
      }, 10000);

      assert.ok(completions, 'Should receive decorator completions after typing @');
      const labels = completions.items.map(getCompletionLabel);

      // Verify common decorator completions appear
      const hasDecorators = labels.some(
        (l) => l.includes('default') || l.includes('unique') || l.includes('nullable') || l.includes('readonly'),
      );
      assert.ok(
        hasDecorators,
        `Decorator completions should include common decorators, got: ${labels.slice(0, 10).join(', ')}`,
      );

      // Step 5: Complete the decorator by inserting 'unique'
      await insertText(doc, completionPos, 'unique');
      await sleep(200);

      // Step 6: Wait for diagnostics to settle and verify zero errors
      const diagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Complete field with @unique should have no errors, got: ${errors.map((d) => d.message).join('; ')}`,
      );
    } finally {
      // Always restore original content
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });

  test('incremental typing with transient errors resolving', async function () {
    this.timeout(30000);

    // Step 1: Open document and save original content
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Insert a partial field inside WfUser before closing brace (line 9)
      // Insert at end of line 8 (createdAt Date @createdAt)
      const line8End = doc.lineAt(8).range.end;
      await insertText(doc, line8End, '\n  partial ');
      await sleep(300);

      // At this point, "partial " is an incomplete field — type is missing
      // The server may report diagnostics for the incomplete field

      // Step 3: Start typing the type — insert "Str" (partial type name)
      let typePos = new vscode.Position(9, 10);
      await insertText(doc, typePos, 'Str');
      await sleep(300);

      // "partial Str" — still incomplete/unknown type, may have diagnostics

      // Step 4: Complete the type — insert "ing" to make "String"
      typePos = new vscode.Position(9, 13);
      await insertText(doc, typePos, 'ing');
      await sleep(200);

      // Step 5: Wait for diagnostics to settle — complete field should be valid
      const diagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Completed field "partial String" should have no errors, got: ${errors.map((d) => d.message).join('; ')}`,
      );

      // Step 6: Verify the document contains the complete field
      const currentText = doc.getText();
      assert.ok(currentText.includes('partial String'), 'Document should contain the completed field "partial String"');
    } finally {
      // Always restore original content
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });
});
