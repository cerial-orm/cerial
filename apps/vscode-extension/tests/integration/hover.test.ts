/**
 * Hover tooltip integration tests.
 *
 * Verifies the language server returns hover information for field types,
 * decorators, and type definitions.
 *
 * simple-model.cerial line map (0-indexed):
 *   0: # Simple model for testing
 *   1: (empty)
 *   2: model User {
 *   3:   id Record @id
 *   4:   email Email @unique
 *   5:   name String
 *   6:   age Int?
 *   7:   isActive Bool @default(true)
 *   8:   score Float
 *   9:   createdAt Date @createdAt
 *  10:   updatedAt Date @updatedAt
 *  11:   tags String[]
 *  12: }
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, openDocument, waitForExtensionActivation, waitForServerReady } from './helpers';

/**
 * Extract plain text content from a Hover result's MarkdownString or string contents.
 */
function getHoverText(hover: vscode.Hover): string {
  const parts: string[] = [];
  for (const content of hover.contents) {
    if (typeof content === 'string') {
      parts.push(content);
    } else if (content instanceof vscode.MarkdownString) {
      parts.push(content.value);
    } else if ('value' in content) {
      // MarkedString with language
      parts.push(content.value);
    }
  }

  return parts.join('\n');
}

suite('Hover', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('shows hover for field type "Record"', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 3: "  id Record @id" — "Record" at cols 5-10, position at col 7
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(3, 7),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for "Record" type');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
  });

  test('shows hover for decorator "@id"', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 3: "  id Record @id" — "@id" at cols 12-14, position at col 13
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(3, 13),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for "@id" decorator');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
  });

  test('shows hover for model name "User"', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 2: "model User {" — "User" at cols 6-9, position at col 7
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(2, 7),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for "User" model name');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
    // Model hover should mention "model" somewhere
    assert.ok(
      text.toLowerCase().includes('model') || text.includes('User'),
      'Hover for model name should contain model information',
    );
  });

  test('shows hover for field type "Email"', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 4: "  email Email @unique" — "Email" at cols 8-12, position at col 10
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(4, 10),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for "Email" type');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
  });

  test('shows hover for decorator "@unique"', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 4: "  email Email @unique" — "@unique" at cols 14-20, position at col 16
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(4, 16),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for "@unique" decorator');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
  });

  test('shows hover for field name', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 6: "  age Int?" — "age" at cols 2-4, position at col 3
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(6, 3),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for field name "age"');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
  });

  test('shows hover for cross-file type reference', async () => {
    const doc = await openDocument('multi-file-b.cerial');

    // Line 12: "  status ProjectStatus" — "ProjectStatus" at cols 9-21, position at col 14
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(12, 14),
    );

    assert.ok(hovers, 'Should return hover results');
    assert.ok(hovers.length > 0, 'Should have at least one hover for "ProjectStatus" reference');

    const text = getHoverText(hovers[0]!);
    assert.ok(text.length > 0, 'Hover content should not be empty');
  });

  test('hover includes range information', async () => {
    const doc = await openDocument('simple-model.cerial');

    // Line 3: "  id Record @id" — position on "Record"
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      doc.uri,
      new vscode.Position(3, 7),
    );

    assert.ok(hovers, 'Should return hovers');
    assert.ok(hovers.length > 0, 'Should have hover results');

    // Hover may include a range indicating the symbol boundaries
    const hover = hovers[0]!;
    if (hover.range) {
      assert.ok(hover.range.start.line >= 0, 'Hover range start line should be non-negative');
      assert.ok(hover.range.start.character >= 0, 'Hover range start character should be non-negative');
    }
  });
});
