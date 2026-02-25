/**
 * Completion Contexts E2E tests.
 *
 * Tests completion handler contexts 1-4 through the real language server:
 *
 * - Context 1: @model() arg completions (model names, excludes abstract)
 * - Context 2: @field() arg completions (Record-type fields in current model)
 * - Context 3: Record() arg completions (primitive ID types + user-defined types)
 * - Context 4: extends completions (model names including abstract)
 *
 * Fixture: completion-contexts.cerial (0-indexed line map)
 *
 *   0: # Completion contexts test fixture
 *   6: enum StatusEnum {
 *  12: literal StatusLiteral {
 *  18: object Address {
 *  24: tuple Coordinate {
 *  29: abstract model BaseEntity {
 *  39: model Author {
 *  59:   posts Relation[] @model(Post)
 *  62: model Post {
 *  68:   author Relation @field(authorId) @model(Author)
 *  72: model TypedIdModel {
 *  73:   id Record(int) @id
 *  77: model ChildModel extends BaseEntity {
 *  81: model PickChild extends BaseEntity[name, email] {
 *  85: model EmptyFieldModel {
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  openDocument,
  pollUntil,
  replaceDocument,
  waitForExtensionActivation,
  waitForServerReady,
} from './helpers';

suite('Completion Contexts E2E', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Context 1: @model() arg completions ─────────────────────────────────

  suite('@model() arg completions', () => {
    test('@model() offers concrete model names, excludes abstract and non-model types', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 59: "  posts Relation[] @model(Post)" → replace with @model()
        const modified = originalContent.replace('@model(Post)', '@model()');
        await replaceDocument(doc, modified);

        // "  posts Relation[] @model()" → cursor at col 26 (inside empty parens)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(59, 26),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'Author' || l === 'Post') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return model name completions inside @model()');
        const labels = completions.items.map(getCompletionLabel);

        // Concrete models should be present
        assert.ok(labels.includes('Author'), `Should include "Author", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Post'), `Should include "Post", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('TypedIdModel'), `Should include "TypedIdModel", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('ChildModel'), `Should include "ChildModel", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('PickChild'), `Should include "PickChild", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('EmptyFieldModel'), `Should include "EmptyFieldModel", got: ${labels.join(', ')}`);

        // Abstract models should NOT be present (can't be relation targets)
        assert.ok(
          !labels.includes('BaseEntity'),
          `Should NOT include abstract model "BaseEntity", got: ${labels.join(', ')}`,
        );

        // Non-model types should NOT be present
        assert.ok(!labels.includes('Address'), `Should NOT include object "Address", got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('Coordinate'), `Should NOT include tuple "Coordinate", got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('StatusEnum'), `Should NOT include enum "StatusEnum", got: ${labels.join(', ')}`);
        assert.ok(
          !labels.includes('StatusLiteral'),
          `Should NOT include literal "StatusLiteral", got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Context 2: @field() arg completions ─────────────────────────────────

  suite('@field() arg completions', () => {
    test('@field() offers Record-type field names from current model', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 68: "  author Relation @field(authorId) @model(Author)" → replace with @field()
        const modified = originalContent.replace('@field(authorId)', '@field()');
        await replaceDocument(doc, modified);

        // "  author Relation @field() @model(Author)" → cursor at col 25 (inside empty parens)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(68, 25),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'authorId') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return Record-type field completions inside @field()');
        const labels = completions.items.map(getCompletionLabel);

        // Record-type fields should be present
        assert.ok(labels.includes('authorId'), `Should include Record field "authorId", got: ${labels.join(', ')}`);

        // Non-Record fields should NOT be present
        assert.ok(!labels.includes('title'), `Should NOT include non-Record field "title", got: ${labels.join(', ')}`);
        assert.ok(
          !labels.includes('content'),
          `Should NOT include non-Record field "content", got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Context 3: Record() arg completions ─────────────────────────────────

  suite('Record() arg completions', () => {
    test('Record() offers primitive ID types and user-defined types', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 73: "  id Record(int) @id" → replace with Record()
        const modified = originalContent.replace('Record(int)', 'Record()');
        await replaceDocument(doc, modified);

        // "  id Record() @id" → cursor at col 12 (inside empty parens)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(73, 12),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'int' || l === 'string') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return ID type completions inside Record()');
        const labels = completions.items.map(getCompletionLabel);

        // Primitive ID types should be present
        assert.ok(labels.includes('int'), `Should include "int", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('float'), `Should include "float", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('number'), `Should include "number", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('string'), `Should include "string", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('uuid'), `Should include "uuid", got: ${labels.join(', ')}`);

        // User-defined types should be present (for complex IDs)
        assert.ok(labels.includes('Address'), `Should include object "Address", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Coordinate'), `Should include tuple "Coordinate", got: ${labels.join(', ')}`);
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Context 4: extends completions ──────────────────────────────────────

  suite('extends completions', () => {
    test('extends offers model names including abstract models', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 77: "model ChildModel extends BaseEntity {" → replace with "extends  {"
        const modified = originalContent.replace('extends BaseEntity {', 'extends  {');
        await replaceDocument(doc, modified);

        // "model ChildModel extends  {" → cursor at col 25 (after "extends ")
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(77, 25),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'BaseEntity' || l === 'Author') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return model name completions after extends');
        const labels = completions.items.map(getCompletionLabel);

        // Abstract models SHOULD be present (they CAN be extended)
        assert.ok(
          labels.includes('BaseEntity'),
          `Should include abstract model "BaseEntity", got: ${labels.join(', ')}`,
        );

        // Concrete models should also be present
        assert.ok(
          labels.some((l) => l === 'Author' || l === 'Post'),
          `Should include concrete models, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });
});
