/**
 * Extension activation integration tests.
 *
 * Verifies the extension loads, activates on .cerial files,
 * and contributes the expected language configuration.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { openDocument, waitForExtensionActivation } from './helpers';

suite('Extension Activation', () => {
  test('extension is present in the extension list', () => {
    const ext = vscode.extensions.getExtension('cerial.cerial');
    assert.ok(ext, 'Extension cerial.cerial should be installed');
  });

  test('extension activates when a .cerial file is opened', async () => {
    const ext = await waitForExtensionActivation();
    assert.strictEqual(ext.isActive, true, 'Extension should be active after opening a .cerial file');
  });

  test('.cerial files are recognized as cerial language', async () => {
    const doc = await openDocument('simple-model.cerial');
    assert.strictEqual(doc.languageId, 'cerial', 'Language ID should be "cerial"');
  });

  test('extension contributes the cerial language', () => {
    const ext = vscode.extensions.getExtension('cerial.cerial');
    assert.ok(ext, 'Extension should exist');

    const languages: Array<{ id: string; extensions?: string[] }> | undefined = ext.packageJSON?.contributes?.languages;
    assert.ok(Array.isArray(languages), 'Should contribute languages');

    const cerialLang = languages.find((lang) => lang.id === 'cerial');
    assert.ok(cerialLang, 'Should contribute a language with id "cerial"');
    assert.ok(cerialLang.extensions?.includes('.cerial'), 'Language should be associated with .cerial extension');
  });

  test('extension contributes the cerial grammar', () => {
    const ext = vscode.extensions.getExtension('cerial.cerial');
    assert.ok(ext, 'Extension should exist');

    const grammars: Array<{ language: string; scopeName: string }> | undefined = ext.packageJSON?.contributes?.grammars;
    assert.ok(Array.isArray(grammars), 'Should contribute grammars');

    const cerialGrammar = grammars.find((g) => g.language === 'cerial');
    assert.ok(cerialGrammar, 'Should contribute a grammar for cerial language');
    assert.strictEqual(cerialGrammar.scopeName, 'source.cerial', 'Grammar scope should be source.cerial');
  });

  test('extension contributes configuration settings', () => {
    const ext = vscode.extensions.getExtension('cerial.cerial');
    assert.ok(ext, 'Extension should exist');

    const config: { properties?: Record<string, unknown> } | undefined = ext.packageJSON?.contributes?.configuration;
    assert.ok(config, 'Should contribute configuration');
    assert.ok(config.properties, 'Configuration should have properties');

    // Verify key settings exist
    assert.ok('cerial.format.indentSize' in config.properties, 'Should have cerial.format.indentSize setting');
    assert.ok('cerial.diagnostics.enabled' in config.properties, 'Should have cerial.diagnostics.enabled setting');
    assert.ok('cerial.inlayHints.enabled' in config.properties, 'Should have cerial.inlayHints.enabled setting');
  });
});
