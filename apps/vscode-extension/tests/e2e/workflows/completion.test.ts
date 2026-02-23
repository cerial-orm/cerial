/**
 * Completion workflow E2E tests.
 *
 * Verifies that accepting a completion produces valid code by testing
 * completion → insert → validate cycles on real schema files.
 *
 * Uses schema.cerial and types.cerial from workspace-e2e-workflows fixture.
 *
 * Workspace file line maps (0-indexed):
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
 *
 * types.cerial:
 *   0: object WfAddress {
 *   1:   street String
 *   2:   city String
 *   3:   zip String?
 *   4: }
 *   5: (empty)
 *   6: enum WfRole {
 *   7:   Admin
 *   8:   Editor
 *   9:   Viewer
 *  10: }
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
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

suite('Completion Workflows', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation(undefined, 'schema.cerial');
    await waitForServerReady(undefined, 'schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Field type completion → insert → validate ───────────────────────────

  test('field type completion produces valid schema', async function () {
    this.timeout(30000);

    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Action 1: Insert a new field line inside WfUser (before closing brace at line 9)
      const inserted = await insertText(doc, new vscode.Position(9, 0), '  newField \n');
      assert.ok(inserted, 'Should insert new field line');

      // After insertion: line 9 = "  newField ", line 10 = "}"
      // The type position is at column 11 (after "  newField ")
      const typePosition = new vscode.Position(9, 11);

      // Verify 1: Trigger completions at the type position and check offered types
      const completions = await pollUntil(async () => {
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          typePosition,
        );

        return result && result.items.length > 0 ? result : null;
      }, 10000);
      assert.ok(completions, 'Should return type completions');
      const labels = completions.items.map(getCompletionLabel);
      assert.ok(labels.includes('String'), 'Should include String type');
      assert.ok(labels.includes('Int'), 'Should include Int type');
      assert.ok(labels.includes('Bool'), 'Should include Bool type');
      assert.ok(labels.includes('Date'), 'Should include Date type');
      assert.ok(labels.includes('WfAddress'), 'Should include WfAddress from types.cerial');
      assert.ok(labels.includes('WfRole'), 'Should include WfRole from types.cerial');

      // Action 2: Simulate accepting a completion — insert "String" at type position
      const typeInserted = await insertText(doc, typePosition, 'String');
      assert.ok(typeInserted, 'Should insert type text');

      // Verify 2: Document contains the completed field
      const lineText = doc.lineAt(9).text;
      assert.ok(lineText.includes('newField String'), `Line should contain completed field, got: "${lineText}"`);

      // Action 3: Wait for diagnostics to settle
      const diagnostics = await waitForNoDiagnostics(doc.uri);
      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Valid field should produce no errors, got: ${errors.map((d) => d.message).join(', ')}`,
      );
    } finally {
      await replaceDocument(doc, originalContent);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('workbench.action.files.save');
    }
  });

  // ── Cross-file type completion ──────────────────────────────────────────

  test('cross-file type completion resolves and validates', async function () {
    this.timeout(30000);

    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Action 1: Insert a new field inside WfUser for a cross-file type reference
      const inserted = await insertText(doc, new vscode.Position(9, 0), '  home \n');
      assert.ok(inserted, 'Should insert new field line');

      // After insertion: line 9 = "  home ", line 10 = "}"
      // "  home " = 7 chars, type position at column 7
      const typePosition = new vscode.Position(9, 7);

      // Verify 1: Completions include types defined in types.cerial
      const completions = await pollUntil(async () => {
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          typePosition,
        );

        return result && result.items.length > 0 ? result : null;
      }, 10000);
      assert.ok(completions, 'Should return completions');
      const labels = completions.items.map(getCompletionLabel);

      assert.ok(labels.includes('WfAddress'), 'Should include WfAddress object from types.cerial');
      assert.ok(labels.includes('WfRole'), 'Should include WfRole enum from types.cerial');

      // Action 2: Insert the cross-file type "WfAddress"
      const typeInserted = await insertText(doc, typePosition, 'WfAddress');
      assert.ok(typeInserted, 'Should insert cross-file type');

      // Verify 2: Document contains the cross-file type reference
      const lineText = doc.lineAt(9).text;
      assert.ok(lineText.includes('home WfAddress'), `Line should contain cross-file type, got: "${lineText}"`);

      // Action 3: Wait for diagnostics — cross-file type should resolve cleanly
      const diagnostics = await waitForNoDiagnostics(doc.uri);

      // Verify 3: No errors — the type from types.cerial is valid
      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Cross-file type should resolve without errors, got: ${errors.map((d) => d.message).join(', ')}`,
      );
    } finally {
      await replaceDocument(doc, originalContent);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('workbench.action.files.save');
    }
  });

  // ── Decorator completion → insert → validate ───────────────────────────

  test('decorator completion produces valid schema', async function () {
    this.timeout(30000);

    const doc = await openDocument('schema.cerial');
    const originalContent = doc.getText();

    try {
      // Action 1: Insert a new field with decorator trigger inside WfPost
      // WfPost closing brace is at line 16. Insert before it.
      const inserted = await insertText(doc, new vscode.Position(16, 0), '  extra String @\n');
      assert.ok(inserted, 'Should insert field with decorator trigger');

      // "  extra String @" = 16 chars. Position after @ is column 16.
      const decoratorPosition = new vscode.Position(16, 16);

      // Verify 1: Decorator completions appear with expected items
      const completions = await pollUntil(async () => {
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          decoratorPosition,
        );

        return result && result.items.length > 0 ? result : null;
      }, 10000);
      assert.ok(completions, 'Should return decorator completions');
      const labels = completions.items.map(getCompletionLabel);
      const hasDefault = labels.some((l) => l.includes('default'));
      const hasUnique = labels.some((l) => l.includes('unique'));
      const hasNullable = labels.some((l) => l.includes('nullable'));
      assert.ok(hasDefault, `Should include @default decorator, got: ${labels.join(', ')}`);
      assert.ok(hasUnique, `Should include @unique decorator, got: ${labels.join(', ')}`);
      assert.ok(hasNullable, `Should include @nullable decorator, got: ${labels.join(', ')}`);

      // Action 2: Insert decorator text after the @
      const decorInserted = await insertText(doc, decoratorPosition, 'nullable');
      assert.ok(decorInserted, 'Should insert decorator text');

      // Verify 2: Document has the full @nullable decorator
      const lineText = doc.lineAt(16).text;
      assert.ok(lineText.includes('@nullable'), `Line should contain @nullable decorator, got: "${lineText}"`);

      // Action 3: Wait for diagnostics — @nullable on String is valid
      const diagnostics = await waitForNoDiagnostics(doc.uri);

      // Verify 3: No errors produced
      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `@nullable on String should be valid, got: ${errors.map((d) => d.message).join(', ')}`,
      );
    } finally {
      await replaceDocument(doc, originalContent);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('workbench.action.files.save');
    }
  });
});
