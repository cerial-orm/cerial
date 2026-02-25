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

  // ── Context 5: Top-level completions ────────────────────────────────────

  suite('Top-level completions', () => {
    test('empty line outside blocks offers block keywords', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');

      try {
        // Line 5 (0-indexed) is an empty line outside any block
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(5, 0),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'model' || l === 'object') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return top-level keyword completions on empty line');
        const labels = completions.items.map(getCompletionLabel);

        // Block keywords should be present
        assert.ok(labels.includes('model'), `Should include "model", got: ${labels.join(', ')}`);
        assert.ok(
          labels.includes('abstract model'),
          `Should include "abstract model", got: ${labels.join(', ')}`,
        );
        assert.ok(labels.includes('object'), `Should include "object", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('tuple'), `Should include "tuple", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('enum'), `Should include "enum", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('literal'), `Should include "literal", got: ${labels.join(', ')}`);

        // Field types should NOT be present at top level
        assert.ok(!labels.includes('String'), `Should NOT include field type "String", got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('Int'), `Should NOT include field type "Int", got: ${labels.join(', ')}`);
        assert.ok(!labels.includes('Bool'), `Should NOT include field type "Bool", got: ${labels.join(', ')}`);
      } finally {
        await closeAllEditors();
      }
    });
  });

  // ── Context 6: Decorator completions ────────────────────────────────────

  suite('Decorator completions', () => {
    test('Date field offers timestamp decorators', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 44 (0-indexed): "  createdAt Date" → inject @ after Date
        const modified = originalContent.replace('  createdAt Date\n', '  createdAt Date @\n');
        await replaceDocument(doc, modified);

        // "  createdAt Date @" → cursor at col 18 (after @)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(44, 18),
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

    test('Uuid field offers UUID decorators', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 46 (0-indexed): "  profileUuid Uuid?" → inject @ after Uuid?
        const modified = originalContent.replace('  profileUuid Uuid?\n', '  profileUuid Uuid? @\n');
        await replaceDocument(doc, modified);

        // "  profileUuid Uuid? @" → cursor at col 21 (after @)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(46, 21),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('uuid')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for Uuid field');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(
          labels.some((l) => l === '@uuid' || l === 'uuid' || l === '@uuid()'),
          `Uuid field should include @uuid, got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.some((l) => l === '@uuid4' || l === 'uuid4' || l === '@uuid4()'),
          `Uuid field should include @uuid4, got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.some((l) => l === '@uuid7' || l === 'uuid7' || l === '@uuid7()'),
          `Uuid field should include @uuid7, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });

    test('array field offers set/distinct/sort decorators', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 50 (0-indexed): "  tags String[]" → inject @ after String[]
        const modified = originalContent.replace('  tags String[]\n', '  tags String[] @\n');
        await replaceDocument(doc, modified);

        // "  tags String[] @" → cursor at col 17 (after @)
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(50, 17),
            '@',
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l.includes('set') || l.includes('distinct')) ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return decorator completions for array field');
        const labels = completions.items.map(getCompletionLabel);

        assert.ok(
          labels.some((l) => l === '@set' || l === 'set'),
          `Array field should include @set, got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.some((l) => l === '@distinct' || l === 'distinct'),
          `Array field should include @distinct, got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.some((l) => l === '@sort' || l === 'sort' || l.includes('sort')),
          `Array field should include @sort, got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });

  // ── Context 7: Field type completions ──────────────────────────────────

  suite('Field type completions', () => {
    test('empty line inside model block offers field types', async function () {
      this.timeout(30000);
      const doc = await openDocument('completion-contexts.cerial');
      const originalContent = doc.getText();

      try {
        // Line 85-86 (0-indexed): "model EmptyFieldModel {\n}" → inject empty line inside
        const modified = originalContent.replace(
          'model EmptyFieldModel {\n}',
          'model EmptyFieldModel {\n  \n}',
        );
        await replaceDocument(doc, modified);

        // Line 86 (0-indexed) is the new indented line inside the model block
        const completions = await pollUntil(async () => {
          const result = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider',
            doc.uri,
            new vscode.Position(86, 2),
          );
          if (!result || !result.items.length) return null;
          const labels = result.items.map(getCompletionLabel);

          return labels.some((l) => l === 'String' || l === 'Int') ? result : null;
        }, 10000);

        assert.ok(completions, 'Should return field type completions inside model block');
        const labels = completions.items.map(getCompletionLabel);

        // Primitive types should be present
        assert.ok(labels.includes('String'), `Should include "String", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Int'), `Should include "Int", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Float'), `Should include "Float", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Bool'), `Should include "Bool", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Date'), `Should include "Date", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Email'), `Should include "Email", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Record'), `Should include "Record", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Relation'), `Should include "Relation", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Uuid'), `Should include "Uuid", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Duration'), `Should include "Duration", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Decimal'), `Should include "Decimal", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Bytes'), `Should include "Bytes", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Geometry'), `Should include "Geometry", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Number'), `Should include "Number", got: ${labels.join(', ')}`);
        assert.ok(labels.includes('Any'), `Should include "Any", got: ${labels.join(', ')}`);

        // User-defined types from same file should be present
        assert.ok(labels.includes('Address'), `Should include object "Address", got: ${labels.join(', ')}`);
        assert.ok(
          labels.includes('Coordinate'),
          `Should include tuple "Coordinate", got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.includes('StatusEnum'),
          `Should include enum "StatusEnum", got: ${labels.join(', ')}`,
        );
        assert.ok(
          labels.includes('StatusLiteral'),
          `Should include literal "StatusLiteral", got: ${labels.join(', ')}`,
        );

        // Block keywords should NOT be present inside a model block
        assert.ok(
          !labels.includes('model'),
          `Should NOT include block keyword "model", got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.includes('object'),
          `Should NOT include block keyword "object", got: ${labels.join(', ')}`,
        );
        assert.ok(
          !labels.includes('tuple'),
          `Should NOT include block keyword "tuple", got: ${labels.join(', ')}`,
        );
      } finally {
        await replaceDocument(doc, originalContent);
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.files.save');
      }
    });
  });
});
