/**
 * Provider fixes E2E tests.
 *
 * Tests provider enhancements through the real language server:
 *
 * - Smart @default/@defaultAlways snippets for enum/literal fields
 * - Field-type-aware decorator filtering (Date→@createdAt, Uuid→@uuid, etc.)
 * - Invalid token diagnostics (unknown tokens after field type)
 * - @default value type mismatch warnings
 * - Extends bracket completions (parent field suggestions)
 * - Go-to-definition file priority (current file first)
 *
 * Fixture: provider-fixes.cerial (0-indexed line map)
 *
 *   0: # Provider fixes test fixture
 *   1: (empty)
 *   2: enum Priority {
 *   3:   Low
 *   4:   Medium
 *   5:   High
 *   6:   Critical
 *   7: }
 *   8: (empty)
 *   9: literal Severity { 'Minor', 'Major', 'Blocker' }
 *  10: (empty)
 *  11: abstract model BaseItem {
 *  12:   id Record @id
 *  13:   title String
 *  14:   priority Priority @default(Medium)
 *  15:   createdAt Date @createdAt
 *  16: }
 *  17: (empty)
 *  18: model Task {
 *  19:   id Record @id
 *  20:   title String
 *  21:   priority Priority
 *  22:   severity Severity
 *  23:   dueDate Date?
 *  24:   score Int?
 *  25:   isActive Bool @default(true)
 *  26:   taskUuid Uuid?
 *  27: }
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  getDefinitionUri,
  openDocument,
  pollUntil,
  replaceDocument,
  sleep,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from './helpers';

/** Extract insertText string from a CompletionItem (handles both string and SnippetString). */
function getInsertText(item: vscode.CompletionItem): string {
  if (typeof item.insertText === 'string') return item.insertText;
  if (item.insertText instanceof vscode.SnippetString) return item.insertText.value;

  return '';
}

suite('Provider Fixes E2E', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Smart @default/@defaultAlways for enum/literal ─────────────────────

  suite('Smart @default/@defaultAlways for enum/literal', () => {
    test('@default on enum field includes enum values in snippet', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject @ after "priority Priority" on line 21 (Task model only — BaseItem has @default(Medium))
        const modified = originalContent.replace('  priority Priority\n', '  priority Priority @\n');
        await replaceDocument(doc, modified);

        // Line 21: "  priority Priority @" → cursor at col 21
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(21, 21),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('default')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return completions with @default');

        const defaultItem = completions.items.find(
          (item) => getCompletionLabel(item) === '@default' || getCompletionLabel(item).startsWith('@default'),
        );
        assert.ok(defaultItem, 'Should have @default completion item');

        const text = getInsertText(defaultItem);
        assert.ok(text.includes('Low'), `@default insertText should contain "Low", got: ${text}`);
        assert.ok(text.includes('Medium'), `@default insertText should contain "Medium", got: ${text}`);
        assert.ok(text.includes('High'), `@default insertText should contain "High", got: ${text}`);
        assert.ok(text.includes('Critical'), `@default insertText should contain "Critical", got: ${text}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('@default on literal field includes literal values in snippet', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject @ after "severity Severity" on line 22
        const modified = originalContent.replace('  severity Severity\n', '  severity Severity @\n');
        await replaceDocument(doc, modified);

        // Line 22: "  severity Severity @" → cursor at col 21
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(22, 21),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('default')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return completions with @default');

        const defaultItem = completions.items.find(
          (item) => getCompletionLabel(item) === '@default' || getCompletionLabel(item).startsWith('@default'),
        );
        assert.ok(defaultItem, 'Should have @default completion item');

        const text = getInsertText(defaultItem);
        assert.ok(text.includes('Minor'), `@default insertText should contain "Minor", got: ${text}`);
        assert.ok(text.includes('Major'), `@default insertText should contain "Major", got: ${text}`);
        assert.ok(text.includes('Blocker'), `@default insertText should contain "Blocker", got: ${text}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('@defaultAlways on enum field includes enum values in snippet', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        const modified = originalContent.replace('  priority Priority\n', '  priority Priority @\n');
        await replaceDocument(doc, modified);

        // Line 21: cursor at col 21
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(21, 21),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('defaultAlways')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return completions with @defaultAlways');

        const defaultAlwaysItem = completions.items.find((item) => getCompletionLabel(item).includes('defaultAlways'));
        assert.ok(defaultAlwaysItem, 'Should have @defaultAlways completion item');

        const text = getInsertText(defaultAlwaysItem);
        assert.ok(text.includes('Low'), `@defaultAlways insertText should contain "Low", got: ${text}`);
        assert.ok(text.includes('Medium'), `@defaultAlways insertText should contain "Medium", got: ${text}`);
        assert.ok(text.includes('High'), `@defaultAlways insertText should contain "High", got: ${text}`);
        assert.ok(text.includes('Critical'), `@defaultAlways insertText should contain "Critical", got: ${text}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('@default on String field does not include enum/literal values', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Use multi-line pattern to target Task's title (not BaseItem's)
        const modified = originalContent.replace(
          '  title String\n  priority Priority\n',
          '  title String @\n  priority Priority\n',
        );
        await replaceDocument(doc, modified);

        // Line 20: "  title String @" → cursor at col 16
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(20, 16),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('default') || l.includes('nullable')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for String field');

        const defaultItem = completions.items.find(
          (item) => getCompletionLabel(item) === '@default' || getCompletionLabel(item).startsWith('@default'),
        );
        assert.ok(defaultItem, 'Should have @default completion item');

        const text = getInsertText(defaultItem);
        assert.ok(!text.includes('Low'), '@default on String should not contain enum value "Low"');
        assert.ok(!text.includes('Medium'), '@default on String should not contain enum value "Medium"');
        assert.ok(!text.includes('Minor'), '@default on String should not contain literal value "Minor"');
        assert.ok(!text.includes('Blocker'), '@default on String should not contain literal value "Blocker"');
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Inside @default() parens autocomplete ──────────────────────────────

  suite('inside @default() autocomplete', () => {
    test('enum field inside @default() shows enum values', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');

      try {
        // Line 26 (0-indexed): "  status Priority @default()" → cursor at col 28 (inside parens)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(26, 28),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'Low' || l === 'Medium') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return enum value completions inside @default()');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(labels.includes('Low'), `Should include enum value "Low", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Medium'), `Should include enum value "Medium", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('High'), `Should include enum value "High", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Critical'), `Should include enum value "Critical", got: ${labels.join(', ')}`);
      } finally {
        await closeAllEditors();
      }
    });

    test('bool field inside @default() shows true and false', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');

      try {
        // Line 27 (0-indexed): "  enabled Bool @default()" → cursor at col 26 (inside parens)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(27, 26),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'true' || l === 'false') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return bool value completions inside @default()');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(labels.includes('true'), `Should include "true", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('false'), `Should include "false", got: ${labels.join(', ')}`);
      } finally {
        await closeAllEditors();
      }
    });
  });

  // ── Field-type-aware decorator filtering ───────────────────────────────

  suite('Field-type-aware decorator filtering', () => {
    test('Date field includes @createdAt, @updatedAt, @now decorators', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject @ after "dueDate Date?" on line 23
        const modified = originalContent.replace('  dueDate Date?\n', '  dueDate Date? @\n');
        await replaceDocument(doc, modified);

        // Line 23: "  dueDate Date? @" → cursor at col 17
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(23, 17),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('createdAt') || l.includes('updatedAt')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for Date field');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(
          labels.some((l) => l.includes('createdAt')),
          `Date field should include @createdAt, got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.some((l) => l.includes('updatedAt')),
          `Date field should include @updatedAt, got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.some((l) => l.includes('now')),
          `Date field should include @now, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('Uuid field includes @uuid decorator', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject @ after "taskUuid Uuid?" on line 26
        const modified = originalContent.replace('  taskUuid Uuid?\n', '  taskUuid Uuid? @\n');
        await replaceDocument(doc, modified);

        // Line 26: "  taskUuid Uuid? @" → cursor at col 18
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(26, 18),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('uuid')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for Uuid field');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(
          labels.some((l) => l === '@uuid' || l === 'uuid'),
          `Uuid field should include @uuid, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('String field does not include @uuid, @now, @createdAt, @updatedAt', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Target Task's title String (not BaseItem's) via multi-line pattern
        const modified = originalContent.replace(
          '  title String\n  priority Priority\n',
          '  title String @\n  priority Priority\n',
        );
        await replaceDocument(doc, modified);

        // Line 20: "  title String @" → cursor at col 16
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(20, 16),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('default') || l.includes('nullable')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for String field');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(
          !labels.some((l) => l.includes('uuid')),
          `String field should not include @uuid variants, got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.some((l) => l.includes('now')),
          `String field should not include @now, got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.some((l) => l.includes('createdAt')),
          `String field should not include @createdAt, got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.some((l) => l.includes('updatedAt')),
          `String field should not include @updatedAt, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('Int field does not include @uuid, @now, @createdAt', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject @ after "score Int?" on line 24
        const modified = originalContent.replace('  score Int?\n', '  score Int? @\n');
        await replaceDocument(doc, modified);

        // Line 24: "  score Int? @" → cursor at col 14
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(24, 14),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('default') || l.includes('nullable')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for Int field');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(
          !labels.some((l) => l.includes('uuid')),
          `Int field should not include @uuid variants, got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.some((l) => l.includes('now')),
          `Int field should not include @now, got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.some((l) => l.includes('createdAt')),
          `Int field should not include @createdAt, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Invalid token diagnostics ──────────────────────────────────────────

  suite('Invalid token diagnostics', () => {
    test('unknown token after field type produces warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject "foobar" after title String on line 20
        const modified = originalContent.replace(
          '  title String\n  priority Priority\n',
          '  title String foobar\n  priority Priority\n',
        );
        await replaceDocument(doc, modified);

        const warningFound = await pollUntil(async () => {
          const diags = vscode.languages.getDiagnostics(doc.uri);
          const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

          return warnings.some((w) => w.message.includes('foobar')) ? warnings : null;
        }, 10000);

        assert.ok(warningFound, 'Should produce warning diagnostic containing "foobar"');
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('unknown decorator produces warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Inject unknown decorator on line 20
        const modified = originalContent.replace(
          '  title String\n  priority Priority\n',
          '  title String @invalidDec\n  priority Priority\n',
        );
        await replaceDocument(doc, modified);

        const warningFound = await pollUntil(async () => {
          const diags = vscode.languages.getDiagnostics(doc.uri);
          const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

          return warnings.some(
            (w) =>
              w.message.toLowerCase().includes('invalidDec'.toLowerCase()) ||
              w.message.toLowerCase().includes('unknown') ||
              w.message.toLowerCase().includes('unrecognized'),
          )
            ? warnings
            : null;
        }, 10000);

        assert.ok(warningFound, 'Should produce warning about unknown decorator @invalidDec');
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('unmodified file has no warning diagnostics', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');

      await waitForNoDiagnostics(doc.uri);
      const diags = vscode.languages.getDiagnostics(doc.uri);
      const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

      assert.strictEqual(
        warnings.length,
        0,
        `Unmodified file should have no warnings, got: ${warnings.map((w) => w.message).join(', ')}`,
      );
    });

    test('valid decorator does not produce invalid token warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Add valid @unique decorator on line 20
        const modified = originalContent.replace(
          '  title String\n  priority Priority\n',
          '  title String @unique\n  priority Priority\n',
        );
        await replaceDocument(doc, modified);

        await sleep(3000);
        const diags = vscode.languages.getDiagnostics(doc.uri);
        const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

        assert.strictEqual(
          warnings.length,
          0,
          `Valid @unique decorator should not produce warnings, got: ${warnings.map((w) => w.message).join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── @default value type mismatch ───────────────────────────────────────

  suite('@default type mismatch diagnostics', () => {
    test('string value for Int @default produces warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace "score Int?" with "score Int @default(hello)" on line 24
        const modified = originalContent.replace('  score Int?\n', '  score Int @default(hello)\n');
        await replaceDocument(doc, modified);

        const warningFound = await pollUntil(async () => {
          const diags = vscode.languages.getDiagnostics(doc.uri);
          const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

          return warnings.some(
            (w) =>
              w.message.includes('hello') ||
              w.message.toLowerCase().includes('mismatch') ||
              w.message.toLowerCase().includes('invalid') ||
              w.message.toLowerCase().includes('expected'),
          )
            ? warnings
            : null;
        }, 10000);

        assert.ok(warningFound, 'Should produce warning about type mismatch for Int @default(hello)');
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('numeric value for Bool @default produces warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace "isActive Bool @default(true)" with "isActive Bool @default(42)" on line 25
        const modified = originalContent.replace('  isActive Bool @default(true)\n', '  isActive Bool @default(42)\n');
        await replaceDocument(doc, modified);

        const warningFound = await pollUntil(async () => {
          const diags = vscode.languages.getDiagnostics(doc.uri);
          const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

          return warnings.some(
            (w) =>
              w.message.includes('42') ||
              w.message.toLowerCase().includes('mismatch') ||
              w.message.toLowerCase().includes('invalid') ||
              w.message.toLowerCase().includes('expected'),
          )
            ? warnings
            : null;
        }, 10000);

        assert.ok(warningFound, 'Should produce warning about type mismatch for Bool @default(42)');
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('invalid enum value for @default produces warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace "priority Priority" with "priority Priority @default(INVALID)" on line 21
        const modified = originalContent.replace('  priority Priority\n', '  priority Priority @default(INVALID)\n');
        await replaceDocument(doc, modified);

        const warningFound = await pollUntil(async () => {
          const diags = vscode.languages.getDiagnostics(doc.uri);
          const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

          return warnings.some(
            (w) =>
              w.message.includes('INVALID') ||
              w.message.toLowerCase().includes('invalid') ||
              w.message.toLowerCase().includes('enum') ||
              w.message.toLowerCase().includes('expected'),
          )
            ? warnings
            : null;
        }, 10000);

        assert.ok(warningFound, 'Should produce warning about invalid enum value INVALID for Priority');
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('valid Int @default does not produce warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace "score Int?" with "score Int @default(42)" — valid int default
        const modified = originalContent.replace('  score Int?\n', '  score Int @default(42)\n');
        await replaceDocument(doc, modified);

        await sleep(3000);
        const diags = vscode.languages.getDiagnostics(doc.uri);
        const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

        assert.strictEqual(
          warnings.length,
          0,
          `Valid Int @default(42) should not produce warnings, got: ${warnings.map((w) => w.message).join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('valid enum value for @default does not produce warning', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace "priority Priority" with "priority Priority @default(Low)" — valid enum value
        const modified = originalContent.replace('  priority Priority\n', '  priority Priority @default(Low)\n');
        await replaceDocument(doc, modified);

        await sleep(3000);
        const diags = vscode.languages.getDiagnostics(doc.uri);
        const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning);

        assert.strictEqual(
          warnings.length,
          0,
          `Valid @default(Low) should not produce warnings, got: ${warnings.map((w) => w.message).join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Extends bracket field completions ─────────────────────────────────

  suite('Extends bracket field completions', () => {
    test('empty brackets offer all parent fields', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace "model Task {" with "model Task extends BaseItem[] {"
        const modified = originalContent.replace('model Task {\n', 'model Task extends BaseItem[] {\n');
        await replaceDocument(doc, modified);

        // Line 18: "model Task extends BaseItem[] {" → cursor at col 28 (between [])
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(18, 28),
          );
          if (!result || !result.items.length) return null;
          const fieldItems = result.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
          const fieldLabels = fieldItems.map(getCompletionLabel);

          return fieldLabels.some((l) => l === 'id' || l === 'title') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return field completions for BaseItem');
        const fieldItems = completions.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
        const labels = fieldItems.map(getCompletionLabel);

        assert.ok(labels.includes('id'), `Should include "id", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('title'), `Should include "title", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('priority'), `Should include "priority", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('createdAt'), `Should include "createdAt", got: ${labels.join(', ')}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('already-listed field excluded from bracket completions', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace with "model Task extends BaseItem[id, ] {" — id already picked
        const modified = originalContent.replace('model Task {\n', 'model Task extends BaseItem[id, ] {\n');
        await replaceDocument(doc, modified);

        // Line 18: cursor at col 32 (after "id, ", before "]")
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(18, 32),
          );
          if (!result || !result.items.length) return null;
          const fieldItems = result.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
          const fieldLabels = fieldItems.map(getCompletionLabel);

          return fieldLabels.some((l) => l === 'title' || l === 'priority') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return remaining field completions');
        const fieldItems = completions.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
        const labels = fieldItems.map(getCompletionLabel);

        assert.ok(!labels.includes('id'), `"id" already listed — should be excluded, got: ${labels.join(', ')}`);
        assert.ok(labels.includes('title'), `Should include "title", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('priority'), `Should include "priority", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('createdAt'), `Should include "createdAt", got: ${labels.join(', ')}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('non-existent parent yields no field completions', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');
      const originalContent = doc.getText();

      try {
        // Replace with "model Task extends NonExistent[] {"
        const modified = originalContent.replace('model Task {\n', 'model Task extends NonExistent[] {\n');
        await replaceDocument(doc, modified);

        // "model Task extends NonExistent[]" → [ at col 30, cursor at col 31
        await sleep(3000);
        const result = await vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(18, 31),
        );

        const fieldCompletions = result?.items.filter(
          (item) => item.kind === vscode.CompletionItemKind.Field,
        ) ?? [];
        assert.strictEqual(fieldCompletions.length, 0, `NonExistent parent should yield no field completions, got: ${fieldCompletions.map(getCompletionLabel).join(', ')}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Go-to-definition file priority ───────────────────────────────────

  suite('Go-to-definition file priority', () => {
    test('local type resolves to current file definition', async function () {
      this.timeout(30000);
      const doc = await openDocument('multi-file-b.cerial');

      // Line 12 (0-indexed): "  status ProjectStatus" — "ProjectStatus" starts at col 9
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(12, 12),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find at least one definition for ProjectStatus');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-b.cerial'),
        `ProjectStatus should resolve to multi-file-b.cerial, got: ${targetUri.path}`,
      );
    });

    test('cross-file type resolves to correct foreign file', async function () {
      this.timeout(30000);
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15 (0-indexed): "  lead Relation @field(leadId) @model(Employee) @key(lead)" — "Employee" at col 38
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(15, 40),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find at least one definition for Employee');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-a.cerial'),
        `Employee should resolve to multi-file-a.cerial, got: ${targetUri.path}`,
      );
    });
  });

  // ── Extends bracket omit completion ─────────────────────────────────

  suite('Extends bracket omit completion', () => {
    test('empty brackets offer both pick and omit items', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');

      try {
        // Position cursor inside empty brackets: "model ChildEmpty extends ParentForOmit[] {"
        // Line 44 (cat -n) = Line 43 (0-indexed VS Code)
        // Cursor at col 39 (between [])
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(43, 39),
          );
          if (!result || !result.items.length) return null;
          const fieldItems = result.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
          const fieldLabels = fieldItems.map(getCompletionLabel);

          return fieldLabels.some((l) => l === 'id' || l === 'name') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return field completions for ParentForOmit');
        const fieldItems = completions.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
        const labels = fieldItems.map(getCompletionLabel);

        // Both pick and omit items should be present
        assert.ok(labels.includes('id'), `Should include pick item "id", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('name'), `Should include pick item "name", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('email'), `Should include pick item "email", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('age'), `Should include pick item "age", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!id'), `Should include omit item "!id", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!name'), `Should include omit item "!name", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!email'), `Should include omit item "!email", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!age'), `Should include omit item "!age", got: ${labels.join(', ')}`);
      } finally {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('omit-mode bracket offers only omit-style suggestions', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');

      try {
        // Position cursor inside omit bracket: "model ChildOmit extends ParentForOmit[!name] {"
        // Line 41 (cat -n) = Line 40 (0-indexed VS Code)
        // Cursor at col 40 (after "!name", before "]")
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(40, 40),
          );
          if (!result || !result.items.length) return null;
          const fieldItems = result.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
          const fieldLabels = fieldItems.map(getCompletionLabel);

          return fieldLabels.some((l) => l.startsWith('!')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return omit-style field completions');
        const fieldItems = completions.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
        const labels = fieldItems.map(getCompletionLabel);

        // Only omit items should be present (no pick items)
        assert.ok(!labels.includes('id'), `Pick item "id" should not appear in omit mode, got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('email'), `Pick item "email" should not appear in omit mode, got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('age'), `Pick item "age" should not appear in omit mode, got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!id'), `Should include omit item "!id", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!email'), `Should include omit item "!email", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('!age'), `Should include omit item "!age", got: ${labels.join(', ')}`);
      } finally {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('already-used fields excluded from bracket completions', async function () {
      this.timeout(30000);
      const doc = await openDocument('provider-fixes.cerial');

      try {
        // Position cursor inside pick bracket: "model ChildPick extends ParentForOmit[name] {"
        // Line 38 (cat -n) = Line 37 (0-indexed VS Code)
        // Cursor at col 39 (after "name", before "]")
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(37, 39),
          );
          if (!result || !result.items.length) return null;
          const fieldItems = result.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
          const fieldLabels = fieldItems.map(getCompletionLabel);

          return fieldLabels.some((l) => l === 'id' || l === 'email') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return remaining field completions');
        const fieldItems = completions.items.filter((item) => item.kind === vscode.CompletionItemKind.Field);
        const labels = fieldItems.map(getCompletionLabel);

        // "name" should be excluded (already used), but other fields should be present
        assert.ok(!labels.includes('name'), `Already-used field "name" should be excluded, got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('!name'), `Already-used field "!name" should be excluded, got: ${labels.join(', ')}`);
        assert.ok(labels.includes('id'), `Should include remaining field "id", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('email'), `Should include remaining field "email", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('age'), `Should include remaining field "age", got: ${labels.join(', ')}`);
      } finally {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });
});
