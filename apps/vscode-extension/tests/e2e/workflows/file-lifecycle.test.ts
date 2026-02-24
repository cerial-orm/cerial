/**
 * File Lifecycle Workflow E2E tests.
 *
 * Simulates file creation and deletion on disk, verifying the extension
 * re-indexes correctly: new types appear in completions, deleted types
 * disappear, and broken references produce diagnostics.
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
  getDocumentUri,
  openDocument,
  pollUntil,
  replaceDocument,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

suite('File Lifecycle Workflows', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation(undefined, 'schema.cerial');
    await waitForServerReady(undefined, 'schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('create new file → types appear in completions', async function () {
    this.timeout(30000);

    const newFileUri = getDocumentUri('lifecycle-create.cerial');
    const newFileContent = 'model NewLifecycleModel {\n  id Record @id\n  data String\n}\n';

    try {
      // Step 1: Verify NewLifecycleModel is NOT in completions initially
      const doc = await openDocument('schema.cerial');
      const initialCompletions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(4, 7), // Line 4: "  name String" — field type position
      );
      const initialLabels = (initialCompletions?.items ?? []).map(getCompletionLabel);
      assert.ok(
        !initialLabels.includes('NewLifecycleModel'),
        'NewLifecycleModel should NOT exist in completions before file creation',
      );

      // Step 2: Create the new .cerial file on disk
      await vscode.workspace.fs.writeFile(newFileUri, new TextEncoder().encode(newFileContent));

      // Step 3: Poll until NewLifecycleModel appears in completions
      const found = await pollUntil(
        async () => {
          const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(4, 7),
          );
          const labels = (completions?.items ?? []).map(getCompletionLabel);
          if (labels.includes('NewLifecycleModel')) return true;

          return null;
        },
        15000,
        500,
      );

      // Step 4: Verify the new type appeared
      assert.ok(found, 'NewLifecycleModel should appear in completions after file creation');
    } finally {
      // Clean up: delete the created file
      try {
        await vscode.workspace.fs.delete(newFileUri);
      } catch {
        // File may not exist if creation failed
      }
    }
  });

  test('delete file → types disappear from completions', async function () {
    this.timeout(30000);

    const tempFileUri = getDocumentUri('lifecycle-delete.cerial');
    const tempFileContent = 'model DeleteTestModel {\n  id Record @id\n  label String\n}\n';

    try {
      // Step 1: Create a temporary .cerial file with a model
      await vscode.workspace.fs.writeFile(tempFileUri, new TextEncoder().encode(tempFileContent));

      // Step 2: Wait for DeleteTestModel to appear in completions
      const doc = await openDocument('schema.cerial');
      const appeared = await pollUntil(
        async () => {
          const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(4, 7),
          );
          const labels = (completions?.items ?? []).map(getCompletionLabel);
          if (labels.includes('DeleteTestModel')) return true;

          return null;
        },
        15000,
        500,
      );
      assert.ok(appeared, 'DeleteTestModel should appear in completions after file creation');

      // Step 3: Delete the file from disk
      await vscode.workspace.fs.delete(tempFileUri);

      // Step 4: Poll until DeleteTestModel disappears from completions
      const disappeared = await pollUntil(
        async () => {
          const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(4, 7),
          );
          const labels = (completions?.items ?? []).map(getCompletionLabel);
          if (!labels.includes('DeleteTestModel')) return true;

          return null;
        },
        15000,
        500,
      );

      // Step 5: Verify the type is gone
      assert.ok(disappeared, 'DeleteTestModel should disappear from completions after file deletion');
    } finally {
      // Clean up: ensure file is deleted
      try {
        await vscode.workspace.fs.delete(tempFileUri);
      } catch {
        // File may already be deleted
      }
    }
  });

  test('delete file → diagnostics appear for broken references', async function () {
    this.timeout(30000);

    const tempFileUri = getDocumentUri('lifecycle-ref.cerial');
    const tempFileContent = 'object TempObj {\n  val String\n}\n';

    // Capture original schema.cerial content for restoration
    const schemaDoc = await openDocument('schema.cerial');
    const originalContent = schemaDoc.getText();

    try {
      // Step 1: Create a temporary .cerial file with TempObj
      await vscode.workspace.fs.writeFile(tempFileUri, new TextEncoder().encode(tempFileContent));

      // Step 2: Modify schema.cerial to reference TempObj (add field to WfUser)
      const contentWithRef = originalContent.replace(
        '  createdAt Date @createdAt',
        '  tempField TempObj\n  createdAt Date @createdAt',
      );
      await replaceDocument(schemaDoc, contentWithRef);
      await schemaDoc.save();

      // Step 3: Wait for zero diagnostics (TempObj reference resolves)
      const noDiags = await waitForNoDiagnostics(schemaDoc.uri, 2000, 15000);
      const initialErrors = noDiags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        initialErrors.length,
        0,
        `TempObj reference should resolve without errors, got: ${initialErrors.map((d) => d.message).join('; ')}`,
      );

      // Step 4: Delete the temporary file
      await vscode.workspace.fs.delete(tempFileUri);

      // Step 5: Wait for diagnostics to appear on schema.cerial (broken reference)
      const diagnostics = await waitForDiagnostics(schemaDoc.uri, 15000);
      assert.ok(diagnostics.length > 0, 'Diagnostics should appear after deleting file with referenced type');

      // Step 6: Verify diagnostic mentions unknown/unresolved type
      const hasUnresolvedDiag = diagnostics.some(
        (d) =>
          d.message.toLowerCase().includes('unknown') ||
          d.message.toLowerCase().includes('not found') ||
          d.message.toLowerCase().includes('undefined') ||
          d.message.toLowerCase().includes('unresolved') ||
          d.message.toLowerCase().includes('tempobj'),
      );
      assert.ok(
        hasUnresolvedDiag,
        `Expected diagnostic about unresolved TempObj, got: ${diagnostics.map((d) => d.message).join('; ')}`,
      );
    } finally {
      // Restore schema.cerial to original content
      await replaceDocument(schemaDoc, originalContent);
      await schemaDoc.save();

      // Clean up: ensure temporary file is deleted
      try {
        await vscode.workspace.fs.delete(tempFileUri);
      } catch {
        // File may already be deleted
      }
    }
  });
});
