/**
 * Format Correctness Workflow E2E tests.
 *
 * Verifies that the Cerial formatter produces correct output and is idempotent.
 * Tests the full formatting pipeline via VS Code's format document provider.
 *
 * Uses unformatted.cerial and schema.cerial from workspace-e2e-workflows fixture.
 *
 * Workspace file line maps (0-indexed):
 *
 * unformatted.cerial:
 *   0: model     WfConfig   {
 *   1:     id Record     @id
 *   2:   name    String
 *   3:      enabled Bool       @default(true)
 *   4:         (whitespace-only line)
 *   5:   count      Int    @default(0)
 *   6:           label String?
 *   7: }
 *
 * schema.cerial:
 *   0: // @convention marker
 *   1: model WfUser {
 *   2:   id Record @id
 *   ...  (already well-formatted)
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  openDocument,
  replaceDocument,
  waitForExtensionActivation,
  waitForServerReady,
} from '../helpers';

const FORMAT_OPTIONS: vscode.FormattingOptions = {
  tabSize: 2,
  insertSpaces: true,
};

async function getFormattingEdits(doc: vscode.TextDocument): Promise<vscode.TextEdit[]> {
  const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    'vscode.executeFormatDocumentProvider',
    doc.uri,
    FORMAT_OPTIONS,
  );

  return edits ?? [];
}

async function applyFormattingEdits(doc: vscode.TextDocument, edits: vscode.TextEdit[]): Promise<boolean> {
  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.set(doc.uri, edits);

  return vscode.workspace.applyEdit(wsEdit);
}

suite('Format Correctness Workflows', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation(undefined, 'schema.cerial');
    await waitForServerReady(undefined, 'schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('format messy file produces clean output with consistent structure', async function () {
    this.timeout(30000);

    // Step 1: Open unformatted file and capture original content
    const doc = await openDocument('unformatted.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Request formatting edits from the provider
      const edits = await getFormattingEdits(doc);
      assert.ok(edits.length > 0, 'Formatter should produce edits for a messy file');

      // Step 3: Apply the edits and read the formatted result
      const applied = await applyFormattingEdits(doc, edits);
      assert.ok(applied, 'Workspace edit should apply successfully');

      const formattedContent = doc.getText();
      const lines = formattedContent.split('\n');

      // Step 4: Verify structural properties of the formatted output

      // Model declaration should have no extra spaces
      const modelLine = lines.find((l) => l.startsWith('model'));
      assert.ok(modelLine, 'Should have a model declaration line');
      assert.ok(!modelLine.includes('model     '), `Model declaration should not have extra spaces: "${modelLine}"`);
      assert.ok(
        !modelLine.includes('WfConfig   {'),
        `Model name and brace should not have extra spaces: "${modelLine}"`,
      );

      // Every field line inside the block should start with exactly 2 spaces
      const fieldLines = lines.filter((l) => l.startsWith('  ') && !l.startsWith('   ') && l.trim().length > 0);
      const indentedLines = lines.filter((l) => /^\s+\S/.test(l));
      for (const line of indentedLines) {
        const leadingSpaces = line.match(/^(\s*)/)?.[1] ?? '';
        assert.strictEqual(leadingSpaces, '  ', `Field line should have exactly 2-space indentation: "${line}"`);
      }

      // No field should have excessive spaces between name and type
      for (const line of fieldLines) {
        const trimmed = line.trim();
        const nameTypeMatch = trimmed.match(/^(\w+)\s+/);
        if (nameTypeMatch) {
          const gapAfterName = trimmed.slice(nameTypeMatch[1]!.length).match(/^(\s+)/);
          if (gapAfterName) {
            assert.ok(gapAfterName[1]!.length <= 10, `Gap between field name and type should be reasonable: "${line}"`);
          }
        }
      }

      // No whitespace-only lines (the original has one at line 4)
      const whitespaceOnlyLines = lines.filter((l) => l.length > 0 && l.trim().length === 0);
      assert.strictEqual(
        whitespaceOnlyLines.length,
        0,
        `Should have no whitespace-only lines, found ${whitespaceOnlyLines.length}`,
      );

      // Closing brace should be at column 0 with no leading whitespace
      const closingBrace = lines.find((l) => l.trim() === '}');
      assert.ok(closingBrace !== undefined, 'Should have a closing brace');
      assert.strictEqual(closingBrace, '}', 'Closing brace should have no leading whitespace');
    } finally {
      // Always restore original content
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });

  test('format is idempotent — second format produces no changes', async function () {
    this.timeout(30000);

    // Step 1: Open unformatted file and capture original content
    const doc = await openDocument('unformatted.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Format once
      const firstEdits = await getFormattingEdits(doc);
      assert.ok(firstEdits.length > 0, 'First format should produce edits');

      const firstApplied = await applyFormattingEdits(doc, firstEdits);
      assert.ok(firstApplied, 'First format edits should apply successfully');

      const formattedOnce = doc.getText();

      // Step 3: Format again — should produce no changes
      const secondEdits = await getFormattingEdits(doc);

      if (secondEdits.length > 0) {
        // If edits are returned, applying them should produce identical content
        const secondApplied = await applyFormattingEdits(doc, secondEdits);
        assert.ok(secondApplied, 'Second format edits should apply successfully');

        const formattedTwice = doc.getText();
        assert.strictEqual(
          formattedTwice,
          formattedOnce,
          'Second format should produce identical content to first format (idempotency)',
        );
      }

    } finally {
      // Always restore original content
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });

  test('format already-clean file produces no changes', async function () {
    this.timeout(30000);

    // Step 1: Open the already well-formatted schema.cerial
    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Step 2: Request formatting edits
      const edits = await getFormattingEdits(doc);

      // Step 3: Verify no visible changes
      if (edits.length === 0) {
        assert.strictEqual(edits.length, 0, 'Clean file should require zero formatting edits');
      } else {
        // If edits are returned, applying them must produce identical content
        const contentBefore = doc.getText();
        const applied = await applyFormattingEdits(doc, edits);
        assert.ok(applied, 'Edits should apply successfully');

        const contentAfter = doc.getText();
        assert.strictEqual(
          contentAfter,
          contentBefore,
          'Applying format edits to a clean file should not change content',
        );
      }

      // Step 4: Confirm the content matches original regardless of edit path
      const finalContent = doc.getText();
      assert.strictEqual(finalContent, originalContent, 'Clean file content should remain unchanged after formatting');
    } finally {
      await replaceDocument(doc, originalContent);
      await doc.save();
    }
  });
});
