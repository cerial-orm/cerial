/**
 * Performance E2E tests.
 *
 * Smoke tests with generous timing budgets to catch severe performance
 * regressions. These are NOT benchmarks — they verify that core operations
 * complete within reasonable wall-clock time in a real VS Code instance.
 *
 * Budgets are intentionally generous to avoid flaky failures from CI load:
 *   - Diagnostics on first load: < 5 seconds
 *   - Completion response: < 2 seconds
 *   - Formatting response: < 2 seconds
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  measureTime,
  openDocument,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from './helpers';

/** Maximum allowed time for diagnostics to appear on first file open (ms). */
const DIAGNOSTICS_BUDGET_MS = 5000;

/** Maximum allowed time for a completion response (ms). */
const COMPLETION_BUDGET_MS = 2000;

/** Maximum allowed time for a formatting response (ms). */
const FORMATTING_BUDGET_MS = 2000;

suite('Performance E2E', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation();
    await waitForServerReady();
    // Close all editors to start from a clean state for timing tests
    await closeAllEditors();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Diagnostics Timing ──────────────────────────────────────────────────

  suite('Diagnostics Performance', () => {
    test(`diagnostics appear within ${DIAGNOSTICS_BUDGET_MS}ms on file open`, async function () {
      this.timeout(DIAGNOSTICS_BUDGET_MS + 10000); // extra buffer for test infrastructure

      const { durationMs } = await measureTime(async () => {
        const doc = await openDocument('errors.cerial');

        return waitForDiagnostics(doc.uri, DIAGNOSTICS_BUDGET_MS);
      });

      assert.ok(
        durationMs < DIAGNOSTICS_BUDGET_MS,
        `Diagnostics should appear within ${DIAGNOSTICS_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });

    test(`clean diagnostics resolve within ${DIAGNOSTICS_BUDGET_MS}ms`, async function () {
      this.timeout(DIAGNOSTICS_BUDGET_MS + 10000);

      const { durationMs } = await measureTime(async () => {
        const doc = await openDocument('simple-model.cerial');

        return waitForNoDiagnostics(doc.uri, 1000, DIAGNOSTICS_BUDGET_MS);
      });

      assert.ok(
        durationMs < DIAGNOSTICS_BUDGET_MS,
        `Clean diagnostics should resolve within ${DIAGNOSTICS_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });
  });

  // ── Completion Timing ───────────────────────────────────────────────────

  suite('Completion Performance', () => {
    test(`top-level completions respond within ${COMPLETION_BUDGET_MS}ms`, async function () {
      this.timeout(COMPLETION_BUDGET_MS + 10000);

      const doc = await openDocument('simple-model.cerial');

      const { result: completions, durationMs } = await measureTime(async () => {
        return vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(1, 0),
        );
      });

      assert.ok(completions, 'Should return completions');
      assert.ok(completions.items.length > 0, 'Should have completion items');
      assert.ok(
        durationMs < COMPLETION_BUDGET_MS,
        `Completions should respond within ${COMPLETION_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });

    test(`field type completions respond within ${COMPLETION_BUDGET_MS}ms`, async function () {
      this.timeout(COMPLETION_BUDGET_MS + 10000);

      const doc = await openDocument('simple-model.cerial');

      const { result: completions, durationMs } = await measureTime(async () => {
        // Line 5: "  name String" — field type position
        return vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(5, 7),
        );
      });

      assert.ok(completions, 'Should return completions');
      assert.ok(
        durationMs < COMPLETION_BUDGET_MS,
        `Field type completions should respond within ${COMPLETION_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });

    test(`cross-file completions respond within ${COMPLETION_BUDGET_MS}ms`, async function () {
      this.timeout(COMPLETION_BUDGET_MS + 10000);

      const doc = await openDocument('multi-file-b.cerial');

      const { result: completions, durationMs } = await measureTime(async () => {
        return vscode.commands.executeCommand<vscode.CompletionList>(
          'vscode.executeCompletionItemProvider',
          doc.uri,
          new vscode.Position(11, 7),
        );
      });

      assert.ok(completions, 'Should return completions');
      assert.ok(
        durationMs < COMPLETION_BUDGET_MS,
        `Cross-file completions should respond within ${COMPLETION_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });
  });

  // ── Formatting Timing ───────────────────────────────────────────────────

  suite('Formatting Performance', () => {
    test(`formatting responds within ${FORMATTING_BUDGET_MS}ms`, async function () {
      this.timeout(FORMATTING_BUDGET_MS + 10000);

      const doc = await openDocument('unformatted.cerial');

      const { result: edits, durationMs } = await measureTime(async () => {
        return vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', doc.uri, {
          tabSize: 2,
          insertSpaces: true,
        } as vscode.FormattingOptions);
      });

      assert.ok(edits, 'Should return formatting edits');
      assert.ok(
        durationMs < FORMATTING_BUDGET_MS,
        `Formatting should respond within ${FORMATTING_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });

    test(`well-formatted file formatting responds within ${FORMATTING_BUDGET_MS}ms`, async function () {
      this.timeout(FORMATTING_BUDGET_MS + 10000);

      const doc = await openDocument('simple-model.cerial');

      const { durationMs } = await measureTime(async () => {
        return vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', doc.uri, {
          tabSize: 2,
          insertSpaces: true,
        } as vscode.FormattingOptions);
      });

      assert.ok(
        durationMs < FORMATTING_BUDGET_MS,
        `Formatting well-formatted file should respond within ${FORMATTING_BUDGET_MS}ms, took ${durationMs}ms`,
      );
    });
  });

  // ── Go-to-Definition Timing ─────────────────────────────────────────────

  suite('Navigation Performance', () => {
    test('go-to-definition responds within 2 seconds', async function () {
      this.timeout(12000);

      const doc = await openDocument('multi-file-b.cerial');

      const { result: definitions, durationMs } = await measureTime(async () => {
        // Line 15: @model(Employee) — cross-file definition
        return vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
          'vscode.executeDefinitionProvider',
          doc.uri,
          new vscode.Position(15, 40),
        );
      });

      assert.ok(definitions, 'Should return definitions');
      assert.ok(durationMs < 2000, `Go-to-definition should respond within 2000ms, took ${durationMs}ms`);
    });

    test('find-all-references responds within 2 seconds', async function () {
      this.timeout(12000);

      const doc = await openDocument('multi-file-b.cerial');

      const { result: references, durationMs } = await measureTime(async () => {
        return vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          doc.uri,
          new vscode.Position(15, 40),
        );
      });

      assert.ok(references, 'Should return references');
      assert.ok(durationMs < 2000, `Find-all-references should respond within 2000ms, took ${durationMs}ms`);
    });
  });
});
