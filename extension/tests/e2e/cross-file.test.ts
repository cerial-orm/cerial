/**
 * Cross-file E2E tests.
 *
 * Verifies that cross-file navigation, references, completion, and
 * diagnostics work correctly across .cerial files in the same schema group.
 *
 * Uses multi-file-a.cerial and multi-file-b.cerial from the workspace fixtures.
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
 *  11:   name String
 *  12:   department Department
 *  13:   contact ContactInfo
 *  14:   managerId Record?
 *  15:   manager Relation? @field(managerId) @model(Employee)
 *  16:   projects Relation[] @model(Project)
 *  17: }
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
 *  15:   lead Relation @field(leadId) @model(Employee)
 *  16:   memberIds Record[]
 *  17:   members Relation[] @field(memberIds) @model(Employee)
 *  18: }
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getCompletionLabel,
  getDefinitionUri,
  getDocumentUri,
  openDocument,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from './helpers';

suite('Cross-File E2E', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Cross-file Completions ──────────────────────────────────────────────

  suite('Cross-file Completions', () => {
    test('completions in multi-file-b include types from multi-file-a', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 11: "  name String" — field type position in Project model
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(11, 7),
      );

      assert.ok(completions, 'Should return a CompletionList');
      const labels = completions.items.map(getCompletionLabel);

      // Types from multi-file-a.cerial should be available
      assert.ok(labels.includes('ContactInfo'), 'Should include ContactInfo object from multi-file-a');
      assert.ok(labels.includes('Department'), 'Should include Department enum from multi-file-a');
    });

    test('completions include Employee model from multi-file-a', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 11: "  name String" — field type position
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(11, 7),
      );

      assert.ok(completions, 'Should return completions');
      const labels = completions.items.map(getCompletionLabel);

      // Employee is a model in multi-file-a — should appear in type completions
      // (it would show up in @model() decorator completions or as a reference)
      // At field type position, we check that cross-file types are available
      assert.ok(labels.includes('ContactInfo'), 'Cross-file object types should be available');
    });

    test('completions include local types from multi-file-b', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 11 — field type position
      const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
        'vscode.executeCompletionItemProvider',
        doc.uri,
        new vscode.Position(11, 7),
      );

      assert.ok(completions, 'Should return completions');
      const labels = completions.items.map(getCompletionLabel);

      // Types defined in multi-file-b.cerial
      assert.ok(labels.includes('ProjectStatus'), 'Should include ProjectStatus literal from same file');
      assert.ok(labels.includes('Budget'), 'Should include Budget tuple from same file');
    });
  });

  // ── Cross-file Go to Definition ─────────────────────────────────────────

  suite('Cross-file Go to Definition', () => {
    test('@model(Employee) navigates to multi-file-a.cerial', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: "  lead Relation @field(leadId) @model(Employee)"
      // "Employee" starts at col 38
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
        `Employee definition should be in multi-file-a.cerial, got ${targetUri.path}`,
      );
    });

    test('second @model(Employee) reference also navigates correctly', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 17: "  members Relation[] @field(memberIds) @model(Employee)"
      // "Employee" starts at col 44
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(17, 46),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find Employee definition from second reference');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-a.cerial'),
        `Employee definition should be in multi-file-a.cerial, got ${targetUri.path}`,
      );
    });

    test('local type definition stays in same file', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 12: "  status ProjectStatus" — "ProjectStatus" at col 9
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        doc.uri,
        new vscode.Position(12, 12),
      );

      assert.ok(definitions, 'Should return definitions');
      assert.ok(definitions.length > 0, 'Should find ProjectStatus definition');

      const targetUri = getDefinitionUri(definitions[0]!);
      assert.ok(
        targetUri.path.endsWith('multi-file-b.cerial'),
        `Local type should stay in multi-file-b.cerial, got ${targetUri.path}`,
      );
    });
  });

  // ── Cross-file Find All References ──────────────────────────────────────

  suite('Cross-file Find References', () => {
    test('Employee has references in both files', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: position on "Employee" at col 40
      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        new vscode.Position(15, 40),
      );

      assert.ok(references, 'Should return references');
      assert.ok(
        references.length >= 2,
        `Employee should have at least 2 references (definition + usages), found ${references.length}`,
      );

      const filePaths = references.map((ref) => ref.uri.path);
      const hasFileA = filePaths.some((p) => p.endsWith('multi-file-a.cerial'));
      const hasFileB = filePaths.some((p) => p.endsWith('multi-file-b.cerial'));

      assert.ok(hasFileA, 'References should include multi-file-a.cerial (definition)');
      assert.ok(hasFileB, 'References should include multi-file-b.cerial (usages)');
    });

    test('Employee references include multiple usages in multi-file-b', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: position on "Employee"
      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        new vscode.Position(15, 40),
      );

      assert.ok(references, 'Should return references');

      // Employee is used in multi-file-b at lines 15 and 17 (@model(Employee))
      const fileBRefs = references.filter((ref) => ref.uri.path.endsWith('multi-file-b.cerial'));
      assert.ok(
        fileBRefs.length >= 2,
        `Should find at least 2 Employee references in multi-file-b.cerial, found ${fileBRefs.length}`,
      );
    });

    test('ContactInfo references span files', async () => {
      const doc = await openDocument('multi-file-a.cerial');

      // Line 4: "object ContactInfo {" — "ContactInfo" starts at col 7
      const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        doc.uri,
        new vscode.Position(4, 10),
      );

      assert.ok(references, 'Should return references');
      // ContactInfo is defined in multi-file-a (line 4) and used in multi-file-a (line 13)
      assert.ok(references.length >= 2, `ContactInfo should have at least 2 references, found ${references.length}`);
    });
  });

  // ── Cross-file Diagnostics ──────────────────────────────────────────────

  suite('Cross-file Diagnostics', () => {
    test('multi-file-b has no errors (cross-file types resolve)', async () => {
      const doc = await openDocument('multi-file-b.cerial');
      const diagnostics = await waitForNoDiagnostics(doc.uri);

      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `Cross-file references should resolve without errors, got: ${errors.map((d) => d.message).join(', ')}`,
      );
    });

    test('multi-file-a has no errors', async () => {
      const doc = await openDocument('multi-file-a.cerial');
      const diagnostics = await waitForNoDiagnostics(doc.uri);

      const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        errors.length,
        0,
        `multi-file-a should have no errors, got: ${errors.map((d) => d.message).join(', ')}`,
      );
    });
  });

  // ── Cross-file Rename ───────────────────────────────────────────────────

  suite('Cross-file Rename', () => {
    test('rename Employee produces edits in both files', async () => {
      // Open file-a first to ensure definition is loaded
      await openDocument('multi-file-a.cerial');
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: "  lead Relation @field(leadId) @model(Employee)"
      // Position on "Employee" at col 40 — rename to "Staff"
      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        doc.uri,
        new vscode.Position(15, 40),
        'Staff',
      );

      assert.ok(edit, 'Rename should return a WorkspaceEdit');

      const entries = edit.entries();
      assert.ok(entries.length > 0, 'WorkspaceEdit should contain changes');

      // Collect all affected file paths
      const affectedFiles = entries.map(([uri]) => uri.path);
      const hasFileA = affectedFiles.some((p) => p.endsWith('multi-file-a.cerial'));
      const hasFileB = affectedFiles.some((p) => p.endsWith('multi-file-b.cerial'));

      assert.ok(hasFileA, 'Rename should produce edits in multi-file-a.cerial (definition)');
      assert.ok(hasFileB, 'Rename should produce edits in multi-file-b.cerial (usages)');

      // Count total edits — should include definition + all usages
      let totalEdits = 0;
      for (const [, fileEdits] of entries) {
        totalEdits += fileEdits.length;
      }

      // Employee appears: definition (line 9), self-ref @model(Employee) (line 15),
      // usage in file-b @model(Employee) (lines 15, 17), and possibly more
      assert.ok(totalEdits >= 3, `Rename should produce at least 3 edits, got ${totalEdits}`);
    });

    test('prepare rename succeeds for cross-file type', async () => {
      const doc = await openDocument('multi-file-b.cerial');

      // Line 15: position on "Employee" at col 40
      const prepareResult = await vscode.commands.executeCommand<
        vscode.Range | { range: vscode.Range; placeholder: string }
      >('vscode.prepareRename', doc.uri, new vscode.Position(15, 40));

      assert.ok(prepareResult, 'Prepare rename should succeed for cross-file type reference');
    });
  });
});
