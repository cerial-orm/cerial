/**
 * Navigation integration tests.
 *
 * Verifies go-to-definition, find-all-references, and rename
 * through the VS Code command API. Tests cross-file navigation
 * between multi-file-a.cerial and multi-file-b.cerial.
 *
 * Workspace file line maps (0-indexed):
 *
 * multi-file-a.cerial:
 *   0: # comment
 *   1: (empty)
 *   2: enum Department { ... }
 *   3: (empty)
 *   4: object ContactInfo {
 *   5:   phone String
 *   6:   address String?
 *   7: }
 *   8: (empty)
 *   9: model Employee {
 *  10:   id Record @id
 *  ...
 *  17:   leadOf Relation[] @model(Project) @key(lead)
 *  18: }
 *
 * multi-file-b.cerial:
 *   0: # comment
 *   1: (empty)
 *   2: literal ProjectStatus { ... }
 *   3: (empty)
 *   4: tuple Budget {
 *   5:   amount Float,
 *   6:   currency String
 *   7: }
 *   8: (empty)
 *   9: model Project {
 *  10:   id Record @id
 *  11:   name String
 *  12:   status ProjectStatus
 *  13:   budget Budget?
 *  14:   leadId Record
 *  15:   lead Relation @field(leadId) @model(Employee) @key(lead)
 *  16:   memberIds Record[]
 *  17:   members Relation[] @field(memberIds) @model(Employee) @key(projects)
 *  18: }
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getDefinitionUri,
  getDocumentUri,
  openDocument,
  waitForExtensionActivation,
  waitForServerReady,
} from './helpers';

suite('Navigation', () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Go to Definition ────────────────────────────────────────────────────

  suite('Go to Definition', () => {
    test('navigates to cross-file model definition from @model() argument', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: "  lead Relation @field(leadId) @model(Employee)"
      // "Employee" starts at col 38 — position cursor at col 40
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(15, 40),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find at least one definition');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-a.cerial'),
        `Definition should be in multi-file-a.cerial, got ${targetUri.path}`,
      );
    });

    test('navigates to local type definition from field type reference', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 12: "  status ProjectStatus"
      // "ProjectStatus" starts at col 9 — position cursor at col 12
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(12, 12),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find at least one definition');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-b.cerial'),
        `Local type definition should be in the same file, got ${targetUri.path}`,
      );
    });

    test('navigates to local tuple definition from field type', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 13: "  budget Budget?"
      // "Budget" starts at col 9 — position cursor at col 11
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(13, 11),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find at least one definition for Budget tuple');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-b.cerial'),
        `Budget definition should be in the same file, got ${targetUri.path}`,
      );
    });

    test('returns empty for primitive types', async () => {
      const doc = await openDocument('simple-model.cerial');

      // Line 5: "  name String" — position on "String" at col 9
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(5, 9),
      );

      // Primitive types have no navigable definition — should return null/empty
      const count = definitions ? definitions.length : 0;
      assert.strictEqual(count, 0, 'Primitive type "String" should have no definition');
    });
  });

  // ── Find All References ─────────────────────────────────────────────────

  suite('Find All References', () => {
    test('finds references across files', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: "  lead Relation @field(leadId) @model(Employee)"
      // Position on "Employee" at col 40
      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        new vscode.Position(15, 40),
      );

      assert.ok(references, 'Should return references');
      assert.ok(
        references.length >= 2,
        `Should find at least 2 references to Employee (def + usage), found ${references.length}`,
      );

      // Should include locations in both files
      const filePaths = references.map((ref) => ref.uri.path);
      const hasFileA = filePaths.some((p) => p.endsWith('multi-file-a.cerial'));
      const hasFileB = filePaths.some((p) => p.endsWith('multi-file-b.cerial'));

      assert.ok(hasFileA, 'References should include multi-file-a.cerial (definition)');
      assert.ok(hasFileB, 'References should include multi-file-b.cerial (usage)');
    });

    test('finds references for locally-defined types', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 2: "literal ProjectStatus { ... }"
      // "ProjectStatus" at col 10 — position cursor there
      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        new vscode.Position(2, 10),
      );

      assert.ok(references, 'Should return references');
      // ProjectStatus is defined at line 2 and used at line 12 ("status ProjectStatus")
      assert.ok(
        references.length >= 2,
        `Should find at least 2 references to ProjectStatus, found ${references.length}`,
      );
    });
  });

  // ── Rename ──────────────────────────────────────────────────────────────

  suite('Rename', () => {
    test('prepare rename succeeds for user-defined type', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 2: "literal ProjectStatus { ... }"
      // Position on "ProjectStatus" at col 12
      const prepareResult = await vscode.commands.executeCommand<
        vscode.Range | { range: vscode.Range; placeholder: string }
      >('vscode.prepareRename', doc.uri, new vscode.Position(2, 12));

      // If rename is supported, it should return a range or range+placeholder
      assert.ok(prepareResult, 'Prepare rename should return a result for a user-defined type');
    });

    test('rename produces a WorkspaceEdit', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 2: "literal ProjectStatus { ... }"
      // Position on "ProjectStatus" at col 12 — rename to "NewStatus"
      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        doc.uri,
        new vscode.Position(2, 12),
        'NewStatus',
      );

      assert.ok(edit, 'Rename should return a WorkspaceEdit');

      // The edit should contain changes — at minimum the definition and usage
      const entries = edit.entries();
      assert.ok(entries.length > 0, 'WorkspaceEdit should contain changes for at least one file');

      // Count total text edits across all files
      let totalEdits = 0;
      for (const [, fileEdits] of entries) {
        totalEdits += fileEdits.length;
      }

      // ProjectStatus appears at line 2 (definition) and line 12 (usage) — at least 2 edits
      assert.ok(totalEdits >= 2, `Rename should produce at least 2 edits (def + usage), got ${totalEdits}`);
    });
  });
});
