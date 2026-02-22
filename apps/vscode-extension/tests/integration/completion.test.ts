/**
 * Completion integration tests.
 *
 * Verifies the language server returns correct completions at various
 * cursor positions: top-level keywords, field types, decorators, and
 * cross-file type references.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  openDocument,
  waitForExtensionActivation,
  waitForServerReady,
} from './helpers';

suite('Completions', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Top-level completions ───────────────────────────────────────────────

  test('provides keyword completions at top level', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 1 is the empty line between comment and first model block
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(1, 0),
    );

    assert.ok(completions, 'Should return a CompletionList');
    const labels = completions.items.map(getCompletionLabel);

    assert.ok(labels.includes('model'), 'Should include "model" keyword');
    assert.ok(labels.includes('object'), 'Should include "object" keyword');
    assert.ok(labels.includes('enum'), 'Should include "enum" keyword');
    assert.ok(labels.includes('tuple'), 'Should include "tuple" keyword');
    assert.ok(labels.includes('literal'), 'Should include "literal" keyword');
    assert.ok(labels.includes('abstract model'), 'Should include "abstract model" keyword');
  });

  test('top-level completions are keyword kind', async () => {
    const doc = await openDocument('simple-model.cerial');

    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(1, 0),
    );

    assert.ok(completions, 'Should return completions');

    const modelItem = completions.items.find((item) => getCompletionLabel(item) === 'model');
    assert.ok(modelItem, 'Should find model completion item');
    assert.strictEqual(modelItem.kind, vscode.CompletionItemKind.Keyword, 'model completion should be Keyword kind');
  });

  // ── Field type completions ──────────────────────────────────────────────

  test('provides type completions at field type position', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 5: "  name String" — col 7 is on "String" (field type position)
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(5, 7),
    );

    assert.ok(completions, 'Should return completions');
    const labels = completions.items.map(getCompletionLabel);

    // Primitive types
    assert.ok(labels.includes('String'), 'Should include String type');
    assert.ok(labels.includes('Int'), 'Should include Int type');
    assert.ok(labels.includes('Float'), 'Should include Float type');
    assert.ok(labels.includes('Bool'), 'Should include Bool type');
    assert.ok(labels.includes('Date'), 'Should include Date type');
    assert.ok(labels.includes('Email'), 'Should include Email type');
    assert.ok(labels.includes('Record'), 'Should include Record type');
    assert.ok(labels.includes('Uuid'), 'Should include Uuid type');
    assert.ok(labels.includes('Duration'), 'Should include Duration type');
    assert.ok(labels.includes('Decimal'), 'Should include Decimal type');
    assert.ok(labels.includes('Bytes'), 'Should include Bytes type');
    assert.ok(labels.includes('Geometry'), 'Should include Geometry type');
    assert.ok(labels.includes('Any'), 'Should include Any type');
    assert.ok(labels.includes('Number'), 'Should include Number type');
  });

  test('provides array type completions', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 11: "  tags String[]" — field type position
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(11, 7),
    );

    assert.ok(completions, 'Should return completions');
    const labels = completions.items.map(getCompletionLabel);

    assert.ok(labels.includes('String[]'), 'Should include String[] array type');
    assert.ok(labels.includes('Int[]'), 'Should include Int[] array type');
    assert.ok(labels.includes('Bool[]'), 'Should include Bool[] array type');
  });

  // ── Decorator completions ───────────────────────────────────────────────

  test('provides decorator completions after @', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 7: "  isActive Bool @default(true)" — col 17 is in decorator position (after @)
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(7, 17),
      '@', // trigger character
    );

    assert.ok(completions, 'Should return completions');

    const labels = completions.items.map(getCompletionLabel);
    const hasDecoratorItems = labels.some((l) => l.startsWith('@') || l === '@id' || l === '@unique');
    assert.ok(hasDecoratorItems, 'Should include decorator completions');
  });

  test('decorator completions include common field decorators', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 4: "  email Email @unique" — col 15 is on "@unique" (decorator position)
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(4, 15),
      '@',
    );

    assert.ok(completions, 'Should return completions');
    const labels = completions.items.map(getCompletionLabel);

    // Common decorators that should be offered in a model block
    const expectedDecorators = ['@id', '@nullable', '@readonly'];
    for (const dec of expectedDecorators) {
      assert.ok(labels.includes(dec), `Should include ${dec} in decorator completions`);
    }
  });

  // ── Cross-file type completions ─────────────────────────────────────────

  test('includes cross-file types in completions', async () => {
    const doc = await openDocument('multi-file-b.cerial');

    // Line 11: "  name String" — field type position in Project model
    const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
      'vscode.executeCompletionItemProvider',
      doc.uri,
      new vscode.Position(11, 7),
    );

    assert.ok(completions, 'Should return completions');
    const labels = completions.items.map(getCompletionLabel);

    // Types from multi-file-a.cerial (cross-file)
    assert.ok(labels.includes('ContactInfo'), 'Should include ContactInfo from multi-file-a.cerial');
    assert.ok(labels.includes('Department'), 'Should include Department enum from multi-file-a.cerial');
  });
});
