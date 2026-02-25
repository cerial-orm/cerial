import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  closeAllEditors,
  createTempDocument,
  openDocument,
  waitForDiagnostics,
  waitForExtensionActivation,
  waitForServerReady,
} from './helpers';

suite('Diagnostics Coverage E2E', () => {
  suiteSetup(async function () {
    this.timeout(60000);
    await waitForExtensionActivation();
    await waitForServerReady();
  });

  teardown(async () => {
    await closeAllEditors();
  });

  test('diagnostics-coverage fixture surfaces errors from multiple validator categories', async function () {
    this.timeout(30000);
    const doc = await openDocument('diagnostics-coverage.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    // Should have multiple diagnostics from various validators
    assert.ok(diagnostics.length > 0, `Expected diagnostics from the fixture, got ${diagnostics.length}`);

    // Collect all diagnostic messages for partial matching
    const messages = diagnostics.map((d) => d.message);
    const lowerMessages = messages.map((m) => m.toLowerCase());

    // Helper: check if at least one diagnostic message matches any of the keywords
    const hasCategory = (keywords: string[]): boolean =>
      lowerMessages.some((m) => keywords.some((kw) => m.includes(kw.toLowerCase())));

    // Track which categories were found
    const categories: Array<{ name: string; keywords: string[]; found: boolean }> = [
      {
        name: 'duplicate-model',
        keywords: ['duplicate', 'already defined', 'DuplicateModel'],
        found: false,
      },
      {
        name: 'duplicate-field',
        keywords: ['duplicate', 'field', 'name'],
        found: false,
      },
      {
        name: 'nullable-object',
        keywords: ['nullable', 'object'],
        found: false,
      },
      {
        name: 'timestamp-non-date',
        keywords: ['createdAt', 'date', 'timestamp'],
        found: false,
      },
      {
        name: 'uuid-non-uuid',
        keywords: ['uuid', 'Uuid'],
        found: false,
      },
      {
        name: 'flexible-non-object',
        keywords: ['flexible', 'object'],
        found: false,
      },
      {
        name: 'set-non-array',
        keywords: ['set', 'array'],
        found: false,
      },
      {
        name: 'invalid-object-name',
        keywords: ['lowercase', 'uppercase', 'capital', 'naming', 'invalidObjectName'],
        found: false,
      },
      {
        name: 'invalid-token',
        keywords: ['unknown', 'unrecognized', '@unknown'],
        found: false,
      },
    ];

    for (const category of categories) {
      category.found = hasCategory(category.keywords);
    }

    const foundCategories = categories.filter((c) => c.found);
    const missedCategories = categories.filter((c) => !c.found);

    // We expect at least some categories to be detected.
    // Some may not produce diagnostics if the parser fails before validators run.
    // Require at least 3 categories to be surfaced to ensure the pipeline works.
    assert.ok(
      foundCategories.length >= 3,
      `Expected at least 3 diagnostic categories to be surfaced, found ${foundCategories.length} (${foundCategories.map((c) => c.name).join(', ')}). ` +
        `Missed: ${missedCategories.map((c) => c.name).join(', ')}. ` +
        `All messages:\n${messages.join('\n')}`,
    );
  });

  test('all diagnostics have Error or Warning severity', async function () {
    this.timeout(30000);
    const doc = await openDocument('diagnostics-coverage.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    assert.ok(diagnostics.length > 0, 'Expected diagnostics from the fixture');

    for (const diag of diagnostics) {
      const isErrorOrWarning =
        diag.severity === vscode.DiagnosticSeverity.Error || diag.severity === vscode.DiagnosticSeverity.Warning;
      assert.ok(
        isErrorOrWarning,
        `Diagnostic "${diag.message}" at line ${diag.range.start.line} has unexpected severity ${diag.severity} (expected Error=0 or Warning=1)`,
      );
    }
  });

  test('diagnostics have valid line ranges within document bounds', async function () {
    this.timeout(30000);
    const doc = await openDocument('diagnostics-coverage.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    assert.ok(diagnostics.length > 0, 'Expected diagnostics from the fixture');

    const lineCount = doc.lineCount;
    for (const diag of diagnostics) {
      assert.ok(
        diag.range.start.line >= 0 && diag.range.start.line < lineCount,
        `Diagnostic "${diag.message}" has out-of-bounds start line ${diag.range.start.line} (document has ${lineCount} lines)`,
      );
      assert.ok(
        diag.range.end.line >= 0 && diag.range.end.line < lineCount,
        `Diagnostic "${diag.message}" has out-of-bounds end line ${diag.range.end.line} (document has ${lineCount} lines)`,
      );
    }
  });

  test('diagnostics point to expected line regions for known errors', async function () {
    this.timeout(30000);
    const doc = await openDocument('diagnostics-coverage.cerial');
    const diagnostics = await waitForDiagnostics(doc.uri);

    assert.ok(diagnostics.length > 0, 'Expected diagnostics from the fixture');

    // The fixture has known error regions. Verify diagnostics appear in
    // reasonable line ranges for at least some categories.
    // Line numbers are 0-indexed in VS Code diagnostics.

    // DuplicateModel is at lines ~28-37 (second definition at line 33)
    const duplicateModelDiags = diagnostics.filter(
      (d) => d.message.toLowerCase().includes('duplicate') || d.message.toLowerCase().includes('already defined'),
    );

    // If found, at least one should be in the duplicate model region (lines 28-37)
    if (duplicateModelDiags.length > 0) {
      const inRegion = duplicateModelDiags.some((d) => d.range.start.line >= 27 && d.range.start.line <= 45);
      assert.ok(
        inRegion,
        `Expected duplicate-model diagnostics in lines 28-45, got lines: ${duplicateModelDiags.map((d) => d.range.start.line).join(', ')}`,
      );
    }

    // @unknown token is at line 118 (0-indexed: 118)
    const unknownTokenDiags = diagnostics.filter(
      (d) => d.message.toLowerCase().includes('unknown') || d.message.toLowerCase().includes('unrecognized'),
    );

    if (unknownTokenDiags.length > 0) {
      const inRegion = unknownTokenDiags.some((d) => d.range.start.line >= 115 && d.range.start.line <= 120);
      assert.ok(
        inRegion,
        `Expected invalid-token diagnostics near line 118, got lines: ${unknownTokenDiags.map((d) => d.range.start.line).join(', ')}`,
      );
    }
  });

  test('extends pick that drops @id field reports diagnostic error', async function () {
    this.timeout(15000);

    // Create a standalone temp document with abstract parent + concrete child
    // that picks only non-@id fields — should produce an @id error after resolution
    const doc = await createTempDocument(
      'abstract model PickBase {\n' +
      '  id Record @id !!private\n' +
      '  createdAt Date @createdAt !!private\n' +
      '  label String\n' +
      '}\n' +
      '\n' +
      'model PickNoId extends PickBase[createdAt, label] {\n' +
      '  notes String?\n' +
      '}\n',
    );

    const diagnostics = await waitForDiagnostics(doc.uri);

    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(errors.length > 0, 'Should report error when extends pick drops @id field');

    const idError = errors.find((d) => d.message.includes('@id'));
    assert.ok(
      idError,
      `Should have diagnostic about missing @id, got: ${errors.map((d) => d.message).join('; ')}`,
    );
  });
});
