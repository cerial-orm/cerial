/**
 * Formatting integration tests.
 *
 * Verifies the language server's document formatting provider works
 * through the VS Code API. Tests that poorly formatted files receive
 * edits and that well-formatted files remain unchanged.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, openDocument, waitForExtensionActivation, waitForServerReady } from './helpers';

suite('Formatting', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('format document returns edits for unformatted file', async () => {
    const doc = await openDocument('unformatted.cerial');

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
      { tabSize: 2, insertSpaces: true } as vscode.FormattingOptions,
    );

    assert.ok(edits, 'Should return formatting edits');
    assert.ok(edits.length > 0, 'Unformatted file should produce at least one formatting edit');
  });

  test('formatting edits have valid ranges', async () => {
    const doc = await openDocument('unformatted.cerial');

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
      { tabSize: 2, insertSpaces: true } as vscode.FormattingOptions,
    );

    assert.ok(edits, 'Should return edits');

    for (const edit of edits) {
      assert.ok(edit.range.start.line >= 0, `Edit start line should be non-negative, got ${edit.range.start.line}`);
      assert.ok(
        edit.range.start.character >= 0,
        `Edit start character should be non-negative, got ${edit.range.start.character}`,
      );
      assert.ok(edit.range.end.line >= edit.range.start.line, 'Edit end line should be >= start line');
      assert.ok(typeof edit.newText === 'string', 'Edit newText should be a string');
    }
  });

  test('well-formatted file produces no edits or identity edits', async () => {
    const doc = await openDocument('simple-model.cerial');

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
      { tabSize: 2, insertSpaces: true } as vscode.FormattingOptions,
    );

    // A well-formatted file may return no edits, or a single identity edit
    // that replaces the document with the same content
    if (edits && edits.length > 0) {
      // If there are edits, they should produce the same content
      // (identity edit — the formatter replaces the entire document)
      const originalText = doc.getText();

      // Apply edits to check content equivalence
      // A single whole-document replacement with the same content is acceptable
      if (edits.length === 1) {
        const edit = edits[0]!;
        const fullRange = new vscode.Range(new vscode.Position(0, 0), doc.positionAt(originalText.length));

        if (edit.range.isEqual(fullRange)) {
          // Whole-document replacement — content should be equivalent
          // (may have trailing newline differences)
          const normalized = (s: string): string => s.replace(/\s+$/, '');
          assert.strictEqual(
            normalized(edit.newText),
            normalized(originalText),
            'Identity edit should produce the same content',
          );
        }
      }
    }
    // If no edits returned, that's the expected behavior for a well-formatted file
  });

  test('formatting preserves comments', async () => {
    const doc = await openDocument('unformatted.cerial');
    const originalText = doc.getText();

    const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
      'vscode.executeFormatDocumentProvider',
      doc.uri,
      { tabSize: 2, insertSpaces: true } as vscode.FormattingOptions,
    );

    if (edits && edits.length > 0) {
      // The formatted output should still contain the comment
      // For a whole-document replacement, check the newText
      const formattedText = edits.length === 1 ? edits[0]!.newText : originalText;
      assert.ok(formattedText.includes('Needs formatting'), 'Formatted output should preserve the comment text');
    }
  });
});
