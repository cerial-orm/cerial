/**
 * Symbol integration tests.
 *
 * Verifies Document Symbols and Workspace Symbols work through
 * the VS Code API, showing model/object/enum hierarchy.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { closeAllEditors, openDocument, waitForExtensionActivation, waitForServerReady } from './helpers';

suite('Symbols', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Document Symbols ────────────────────────────────────────────────────

  test('document symbols show model hierarchy', async () => {
    const doc = await openDocument('simple-model.cerial');

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri,
    );

    assert.ok(symbols, 'Should return document symbols');
    assert.ok(symbols.length > 0, 'Should have at least one top-level symbol');

    // Find the User model symbol
    const userSymbol = symbols.find((s) => s.name === 'User');
    assert.ok(userSymbol, 'Should find User model symbol');
    assert.strictEqual(userSymbol.kind, vscode.SymbolKind.Class, 'Model should be Class kind');

    // User model should have child symbols (fields)
    assert.ok(userSymbol.children.length > 0, 'User model should have field children');
  });

  test('document symbols include all top-level blocks', async () => {
    const doc = await openDocument('multi-file-a.cerial');

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri,
    );

    assert.ok(symbols, 'Should return document symbols');

    const names = symbols.map((s) => s.name);
    assert.ok(names.includes('Department'), 'Should include Department enum');
    assert.ok(names.includes('ContactInfo'), 'Should include ContactInfo object');
    assert.ok(names.includes('Employee'), 'Should include Employee model');
  });

  test('model fields appear as children of model symbol', async () => {
    const doc = await openDocument('simple-model.cerial');

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri,
    );

    assert.ok(symbols, 'Should return symbols');

    const userSymbol = symbols.find((s) => s.name === 'User');
    assert.ok(userSymbol, 'Should find User model');

    const fieldNames = userSymbol.children.map((c) => c.name);
    assert.ok(fieldNames.includes('email'), 'Should have email field');
    assert.ok(fieldNames.includes('name'), 'Should have name field');
    assert.ok(fieldNames.includes('createdAt'), 'Should have createdAt field');
  });

  test('field symbols have Property kind', async () => {
    const doc = await openDocument('simple-model.cerial');

    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      doc.uri,
    );

    assert.ok(symbols, 'Should return symbols');

    const userSymbol = symbols.find((s) => s.name === 'User');
    assert.ok(userSymbol, 'Should find User model');

    const fieldSymbols = userSymbol.children.filter((c) => c.kind === vscode.SymbolKind.Property);
    assert.ok(fieldSymbols.length > 0, 'Fields should have Property kind');
  });

  // ── Workspace Symbols ──────────────────────────────────────────────────

  test('workspace symbols search finds models across files', async () => {
    // Open both files to ensure they are indexed
    await openDocument('multi-file-a.cerial');
    await openDocument('multi-file-b.cerial');

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      'Employee',
    );

    assert.ok(symbols, 'Should return workspace symbols');
    assert.ok(symbols.length > 0, 'Should find Employee in workspace symbols');

    const employeeSymbol = symbols.find((s) => s.name === 'Employee');
    assert.ok(employeeSymbol, 'Should find exact Employee match');
  });

  test('workspace symbols search with empty query returns all types', async () => {
    await openDocument('multi-file-a.cerial');
    await openDocument('multi-file-b.cerial');

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
      'vscode.executeWorkspaceSymbolProvider',
      '',
    );

    assert.ok(symbols, 'Should return workspace symbols');
    // Should include types from both files
    assert.ok(symbols.length >= 2, `Should find multiple workspace symbols, got ${symbols.length}`);
  });
});
