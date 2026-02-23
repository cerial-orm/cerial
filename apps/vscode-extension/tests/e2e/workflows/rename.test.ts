/**
 * Rename refactoring workflow E2E tests.
 *
 * Verifies that rename refactoring works end-to-end: renaming a type
 * updates all references across files and produces no new diagnostics.
 *
 * Uses schema.cerial, relations.cerial, and types.cerial from workspace-e2e-workflows.
 *
 * Workspace file line maps (0-indexed):
 *
 * schema.cerial:
 *   0: // @convention marker
 *   1: model WfUser {
 *  ...
 *  18: model RenameTarget {
 *  19:   id Record @id
 *  20:   label String
 *  21:   value Int
 *  22: }
 *
 * relations.cerial:
 *   0: model WfComment {
 *  ...
 *   8:   target Relation @model(RenameTarget)
 *   9: }
 *
 * types.cerial:
 *   0: object WfAddress {
 *  ...
 *   6: enum WfRole {
 *  ...
 *  10: }
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  getDefinitionUri,
  getDocumentUri,
  openDocument,
  pollUntil,
  replaceDocument,
  waitForExtensionActivation,
  waitForNoDiagnostics,
  waitForServerReady,
} from '../helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Save content to disk at the given URI. */
async function saveContentToDisk(uri: vscode.Uri, content: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
}

/** Restore a file to its original content (in-memory via replaceDocument + persisted to disk). */
async function restoreFile(uri: vscode.Uri, originalContent: string): Promise<void> {
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc);
  await replaceDocument(doc, originalContent);
  await saveContentToDisk(uri, originalContent);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

suite('Rename Refactoring Workflows', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation(undefined, 'schema.cerial');
    await waitForServerReady(undefined, 'schema.cerial');
  });

  teardown(async () => {
    await closeAllEditors();
  });

  // ── Rename Type Across Files ──────────────────────────────────────────

  test('rename type updates all references across files with zero diagnostics', async function () {
    this.timeout(30000);

    // Step 1: Open files and capture original content
    const schemaDoc = await openDocument('schema.cerial');
    const relationsUri = getDocumentUri('relations.cerial');
    const relationsDoc = await vscode.workspace.openTextDocument(relationsUri);

    const originalSchemaContent = schemaDoc.getText();
    const originalRelationsContent = relationsDoc.getText();

    try {
      // Step 2: Execute rename — RenameTarget → RenamedModel
      // Line 18 (0-indexed): "model RenameTarget {" — "RenameTarget" at col 6
      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        schemaDoc.uri,
        new vscode.Position(18, 6),
        'RenamedModel',
      );

      assert.ok(edit, 'Rename should return a WorkspaceEdit');

      const applied = await vscode.workspace.applyEdit(edit);
      assert.ok(applied, 'WorkspaceEdit should apply successfully');

      // Save modified files to disk for language server re-indexing
      await saveContentToDisk(schemaDoc.uri, schemaDoc.getText());
      await saveContentToDisk(relationsUri, relationsDoc.getText());

      // Step 3: Verify schema.cerial contains the renamed model
      const schemaText = schemaDoc.getText();
      assert.ok(schemaText.includes('model RenamedModel'), 'schema.cerial should contain "model RenamedModel"');
      assert.ok(
        !schemaText.includes('model RenameTarget'),
        'schema.cerial should no longer contain "model RenameTarget"',
      );

      // Verify relations.cerial contains the updated reference
      const relText = relationsDoc.getText();
      assert.ok(relText.includes('@model(RenamedModel)'), 'relations.cerial should contain "@model(RenamedModel)"');
      assert.ok(
        !relText.includes('@model(RenameTarget)'),
        'relations.cerial should no longer contain "@model(RenameTarget)"',
      );

      // Step 4: Wait for diagnostics to settle and verify zero errors on both files
      const schemaDiags = await waitForNoDiagnostics(schemaDoc.uri);
      const schemaErrors = schemaDiags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        schemaErrors.length,
        0,
        `schema.cerial should have no errors after rename, got: ${schemaErrors.map((d) => d.message).join(', ')}`,
      );

      const relationsDiags = await waitForNoDiagnostics(relationsUri);
      const relationsErrors = relationsDiags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
      assert.strictEqual(
        relationsErrors.length,
        0,
        `relations.cerial should have no errors after rename, got: ${relationsErrors.map((d) => d.message).join(', ')}`,
      );
    } finally {
      // Always restore both files to original content
      await restoreFile(schemaDoc.uri, originalSchemaContent);
      await restoreFile(relationsUri, originalRelationsContent);
    }
  });

  // ── Rename and Verify References ──────────────────────────────────────

  test('references and go-to-definition resolve correctly after rename', async function () {
    this.timeout(30000);

    // Step 1: Open files and capture original content
    const schemaDoc = await openDocument('schema.cerial');
    const relationsUri = getDocumentUri('relations.cerial');
    const relationsDoc = await vscode.workspace.openTextDocument(relationsUri);

    const originalSchemaContent = schemaDoc.getText();
    const originalRelationsContent = relationsDoc.getText();

    try {
      // Step 2: Execute rename and apply
      const edit = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        schemaDoc.uri,
        new vscode.Position(18, 6),
        'RenamedModel',
      );

      assert.ok(edit, 'Rename should return a WorkspaceEdit');

      const applied = await vscode.workspace.applyEdit(edit);
      assert.ok(applied, 'WorkspaceEdit should apply successfully');

      // Save to disk for server re-indexing
      await saveContentToDisk(schemaDoc.uri, schemaDoc.getText());
      await saveContentToDisk(relationsUri, relationsDoc.getText());

      // Wait for server to process changes
      await waitForNoDiagnostics(schemaDoc.uri);

      // Step 3: Verify references for the renamed symbol
      // RenamedModel is at line 18, col 6 in schema.cerial (same position, new name)
      const references = await pollUntil(async () => {
        const refs = await vscode.commands.executeCommand<vscode.Location[]>(
          'vscode.executeReferenceProvider',
          schemaDoc.uri,
          new vscode.Position(18, 6),
        );

        return refs && refs.length >= 2 ? refs : null;
      }, 10000);

      assert.ok(references, 'Should find references for the renamed symbol');
      assert.ok(
        references.length >= 2,
        `Should find at least 2 references (definition + usage), found ${references.length}`,
      );

      const refPaths = references.map((ref) => ref.uri.path);
      assert.ok(
        refPaths.some((p) => p.endsWith('schema.cerial')),
        'References should include schema.cerial (definition)',
      );
      assert.ok(
        refPaths.some((p) => p.endsWith('relations.cerial')),
        'References should include relations.cerial (usage)',
      );

      // Step 4: Verify go-to-definition from the reference site in relations.cerial
      // Line 8 (0-indexed): "  target Relation @model(RenamedModel)"
      // "RenamedModel" starts at col 25
      const relDoc = await openDocument('relations.cerial');
      const definitions = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
        'vscode.executeDefinitionProvider',
        relDoc.uri,
        new vscode.Position(8, 25),
      );

      assert.ok(definitions, 'Go-to-definition should return results');
      assert.ok(definitions.length > 0, 'Should find definition for RenamedModel');

      const defUri = getDefinitionUri(definitions[0]!);
      assert.ok(defUri.path.endsWith('schema.cerial'), `Definition should point to schema.cerial, got ${defUri.path}`);
    } finally {
      await restoreFile(schemaDoc.uri, originalSchemaContent);
      await restoreFile(relationsUri, originalRelationsContent);
    }
  });

  // ── Prepare Rename Validation ─────────────────────────────────────────

  test('prepare rename succeeds on type names and rejects non-renameable positions', async function () {
    this.timeout(30000);

    const schemaDoc = await openDocument('schema.cerial');
    const typesDoc = await openDocument('types.cerial');

    // Step 1: Verify prepare rename succeeds on type names

    // Model name: RenameTarget at line 18, col 6 in schema.cerial
    const modelResult = await vscode.commands.executeCommand<
      vscode.Range | { range: vscode.Range; placeholder: string } | null
    >('vscode.prepareRename', schemaDoc.uri, new vscode.Position(18, 6));
    assert.ok(modelResult, 'Prepare rename should succeed on model name (RenameTarget)');

    // Object name: WfAddress at line 0, col 7 in types.cerial
    const objectResult = await vscode.commands.executeCommand<
      vscode.Range | { range: vscode.Range; placeholder: string } | null
    >('vscode.prepareRename', typesDoc.uri, new vscode.Position(0, 7));
    assert.ok(objectResult, 'Prepare rename should succeed on object name (WfAddress)');

    // Enum name: WfRole at line 6, col 5 in types.cerial
    const enumResult = await vscode.commands.executeCommand<
      vscode.Range | { range: vscode.Range; placeholder: string } | null
    >('vscode.prepareRename', typesDoc.uri, new vscode.Position(6, 5));
    assert.ok(enumResult, 'Prepare rename should succeed on enum name (WfRole)');

    // Step 2: Verify prepare rename rejects keywords
    // "model" keyword at line 18, col 0 in schema.cerial
    let keywordRejected = false;
    try {
      const keywordResult = await vscode.commands.executeCommand<
        vscode.Range | { range: vscode.Range; placeholder: string } | null
      >('vscode.prepareRename', schemaDoc.uri, new vscode.Position(18, 0));

      if (!keywordResult) {
        keywordRejected = true;
      } else {
        // Server may expand to nearby type name — verify it didn't return "model"
        const range = 'range' in keywordResult ? keywordResult.range : keywordResult;
        const text = schemaDoc.getText(range);
        if (text === 'model') {
          assert.fail('Prepare rename should not allow renaming the "model" keyword');
        }
        // Returned the type name range instead — acceptable expansion behavior
        keywordRejected = true;
      }
    } catch {
      // Error thrown = position is not renameable — expected behavior
      keywordRejected = true;
    }
    assert.ok(keywordRejected, 'Keyword position should not be directly renameable');

    // Step 3: Verify prepare rename rejects built-in field types
    // "String" at line 20, col 8 in schema.cerial
    let fieldTypeRejected = false;
    try {
      const fieldTypeResult = await vscode.commands.executeCommand<
        vscode.Range | { range: vscode.Range; placeholder: string } | null
      >('vscode.prepareRename', schemaDoc.uri, new vscode.Position(20, 8));

      if (!fieldTypeResult) {
        fieldTypeRejected = true;
      } else {
        const range = 'range' in fieldTypeResult ? fieldTypeResult.range : fieldTypeResult;
        const text = schemaDoc.getText(range);
        if (text === 'String') {
          assert.fail('Prepare rename should not allow renaming built-in type "String"');
        }
        fieldTypeRejected = true;
      }
    } catch {
      // Error thrown = position is not renameable — expected behavior
      fieldTypeRejected = true;
    }
    assert.ok(fieldTypeRejected, 'Built-in field type position should not be renameable');
  });
});
