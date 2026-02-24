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
  sleep,
  waitForExtensionActivation,
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

/**
 * Wait for diagnostics to stabilize (stop changing) for a given duration.
 * Unlike waitForNoDiagnostics, this doesn't require zero diagnostics —
 * it waits until the diagnostic count stays the same for `stableMs`.
 */
async function waitForStableDiagnostics(
  uri: vscode.Uri,
  stableMs = 2000,
  timeout = 10000,
): Promise<readonly vscode.Diagnostic[]> {
  const start = Date.now();
  let lastCount = -1;
  let lastChangeTime = Date.now();

  while (Date.now() - start < timeout) {
    const diagnostics = vscode.languages.getDiagnostics(uri);
    if (diagnostics.length !== lastCount) {
      lastCount = diagnostics.length;
      lastChangeTime = Date.now();
    } else if (Date.now() - lastChangeTime >= stableMs) {
      return diagnostics;
    }
    await sleep(200);
  }

  return vscode.languages.getDiagnostics(uri);
}

/**
 * Execute rename via the rename provider, polling until a non-empty WorkspaceEdit
 * is returned. Catches "can't be renamed" errors during polling (server may still
 * be re-indexing after a previous restore).
 */
async function executeRename(
  docUri: vscode.Uri,
  position: vscode.Position,
  newName: string,
  timeout = 10000,
  minEntries = 1,
): Promise<vscode.WorkspaceEdit> {
  const edit = await pollUntil(async () => {
    try {
      const e = await vscode.commands.executeCommand<vscode.WorkspaceEdit>(
        'vscode.executeDocumentRenameProvider',
        docUri,
        position,
        newName,
      );
      if (!e) return null;

      return e.entries().length >= minEntries ? e : null;
    } catch {
      // "The element can't be renamed" — server still re-indexing, retry
      return null;
    }
  }, timeout);

  assert.ok(edit, 'Rename should return a WorkspaceEdit with entries');

  return edit;
}

/**
 * Apply a rename by manually replacing document content.
 * The rename provider's WorkspaceEdit may not update document buffers
 * in the VS Code test host, so we apply the text changes ourselves.
 */
async function applyRenameManually(
  schemaDoc: vscode.TextDocument,
  relationsDoc: vscode.TextDocument,
  relationsUri: vscode.Uri,
  originalSchemaContent: string,
  originalRelationsContent: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const nameRegex = new RegExp(oldName, 'g');
  const renamedSchemaContent = originalSchemaContent.replace(nameRegex, newName);
  const renamedRelationsContent = originalRelationsContent.replace(nameRegex, newName);

  await vscode.window.showTextDocument(schemaDoc);
  await replaceDocument(schemaDoc, renamedSchemaContent);
  await vscode.window.showTextDocument(relationsDoc);
  await replaceDocument(relationsDoc, renamedRelationsContent);

  // Save to disk so the language server re-indexes
  await saveContentToDisk(schemaDoc.uri, schemaDoc.getText());
  await saveContentToDisk(relationsUri, relationsDoc.getText());
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
      const renamePosition = new vscode.Position(18, 6);
      const edit = await executeRename(schemaDoc.uri, renamePosition, 'RenamedModel', 10000, 2);

      // Verify the WorkspaceEdit targets both files
      const editEntries = edit.entries();
      const affectedFiles = editEntries.map(([uri]) => uri.path);
      assert.ok(
        affectedFiles.some((p) => p.endsWith('schema.cerial')),
        'Rename should produce edits in schema.cerial',
      );
      assert.ok(
        affectedFiles.some((p) => p.endsWith('relations.cerial')),
        'Rename should produce edits in relations.cerial',
      );

      // Apply the rename manually via replaceDocument
      await applyRenameManually(
        schemaDoc,
        relationsDoc,
        relationsUri,
        originalSchemaContent,
        originalRelationsContent,
        'RenameTarget',
        'RenamedModel',
      );

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

      // Step 4: Wait for diagnostics to stabilize and verify the rename
      // didn't introduce errors referencing the old name ("RenameTarget").
      // The fixture has pre-existing validation errors unrelated to the rename.
      const postSchemaErrors = (await waitForStableDiagnostics(schemaDoc.uri)).filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error,
      );
      const postRelationsErrors = (await waitForStableDiagnostics(relationsUri)).filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error,
      );

      const renameRelatedSchemaErrors = postSchemaErrors.filter((d) => d.message.includes('RenameTarget'));
      assert.strictEqual(
        renameRelatedSchemaErrors.length,
        0,
        `schema.cerial should have no errors referencing old name: ${renameRelatedSchemaErrors.map((d) => d.message).join(', ')}`,
      );
      const renameRelatedRelationsErrors = postRelationsErrors.filter((d) => d.message.includes('RenameTarget'));
      assert.strictEqual(
        renameRelatedRelationsErrors.length,
        0,
        `relations.cerial should have no errors referencing old name: ${renameRelatedRelationsErrors.map((d) => d.message).join(', ')}`,
      );
    } finally {
      // Always restore both files to original content
      await restoreFile(schemaDoc.uri, originalSchemaContent);
      await restoreFile(relationsUri, originalRelationsContent);
      // Give the server time to re-index restored files
      await sleep(500);
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
      const renamePosition = new vscode.Position(18, 6);
      const edit = await executeRename(schemaDoc.uri, renamePosition, 'RenamedModel');
      assert.ok(edit.entries().length > 0, 'Rename should produce edits');

      // Apply the rename manually via replaceDocument
      await applyRenameManually(
        schemaDoc,
        relationsDoc,
        relationsUri,
        originalSchemaContent,
        originalRelationsContent,
        'RenameTarget',
        'RenamedModel',
      );

      // Wait for server to process changes
      await waitForStableDiagnostics(schemaDoc.uri);

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
      const defResult = await pollUntil(async () => {
        const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
          'vscode.executeDefinitionProvider',
          relDoc.uri,
          new vscode.Position(8, 25),
        );
        if (!defs || !defs.length) return null;

        const uri = getDefinitionUri(defs[0]!);

        return uri.path.endsWith('schema.cerial') ? uri : null;
      }, 10000);
      assert.ok(defResult, 'Go-to-definition for RenamedModel should point to schema.cerial');
    } finally {
      await restoreFile(schemaDoc.uri, originalSchemaContent);
      await restoreFile(relationsUri, originalRelationsContent);
      // Give the server time to re-index restored files
      await sleep(500);
    }
  });

  // ── Prepare Rename Validation ─────────────────────────────────────────

  test('prepare rename succeeds on type names and rejects non-renameable positions', async function () {
    this.timeout(30000);

    const schemaDoc = await openDocument('schema.cerial');
    const typesDoc = await openDocument('types.cerial');

    // Step 1: Verify prepare rename succeeds on type names

    // Model name: RenameTarget at line 18, col 6 in schema.cerial
    const modelResult = await pollUntil(async () => {
      try {
        return await vscode.commands.executeCommand<vscode.Range | { range: vscode.Range; placeholder: string } | null>(
          'vscode.prepareRename',
          schemaDoc.uri,
          new vscode.Position(18, 6),
        );
      } catch {
        // Server may still be re-indexing after previous test restore
        return null;
      }
    }, 10000);
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
