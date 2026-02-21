/**
 * Inlay Hints provider for .cerial files.
 *
 * Shows inline hints for non-obvious field behaviors:
 * - FK Record fields: inferred type from target model's @id (e.g., `: CerialId<number>`)
 * - @uuid/@uuid4/@uuid7 fields: "auto-generated"
 * - @createdAt/@updatedAt fields: "server-set"
 * - @now fields: "computed"
 * - Inherited fields (extends overrides): "from ParentName"
 * - @defaultAlways fields: "resets on write"
 */

import { type Connection, type InlayHint, InlayHintKind, type TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ASTField, ASTModel, ASTObject } from '../../../../src/types';
import type { WorkspaceIndexer } from '../indexer';
import type { CerialSettings } from '../server';
import { cerialToLsp } from '../utils/position';

// ---------------------------------------------------------------------------
// ID type mapping
// ---------------------------------------------------------------------------

/** Map a Record(Type) @id type parameter to its TypeScript representation. */
function mapIdTypeToTs(idType: string): string {
  switch (idType) {
    case 'int':
    case 'float':
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'uuid':
      return 'CerialUuid';
    default:
      // Tuple or object name — use as-is
      return idType;
  }
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

/** Check whether a field carries a specific decorator. */
function hasDecorator(field: ASTField, name: string): boolean {
  return field.decorators.some((d) => d.type === name);
}

/** Get the first decorator of a given type from a field, or undefined. */
function getDecorator(field: ASTField, name: string) {
  return field.decorators.find((d) => d.type === name);
}

/** Find a model by name across every file in a schema group. */
function findModelInGroup(indexer: WorkspaceIndexer, groupName: string, modelName: string): ASTModel | null {
  const allAsts = indexer.getAllASTsInGroup(groupName);
  for (const ast of allAsts.values()) {
    const model = ast.models.find((m) => m.name === modelName);
    if (model) return model;
  }

  return null;
}

/** Find an object by name across every file in a schema group. */
function findObjectInGroup(indexer: WorkspaceIndexer, groupName: string, objectName: string): ASTObject | null {
  const allAsts = indexer.getAllASTsInGroup(groupName);
  for (const ast of allAsts.values()) {
    const obj = ast.objects.find((o) => o.name === objectName);
    if (obj) return obj;
  }

  return null;
}

/** Build the `CerialId<T>` type string for an FK field based on the target model's @id. */
function buildFkTypeHint(targetModel: ASTModel): string {
  const idField = targetModel.fields.find((f) => f.decorators.some((d) => d.type === 'id'));

  if (!idField?.recordIdTypes?.length) {
    return 'CerialId<string>';
  }

  if (idField.recordIdTypes.length === 1) {
    return `CerialId<${mapIdTypeToTs(idField.recordIdTypes[0]!)}>`;
  }

  // Union ID types: Record(string, int) → CerialId<string | number>
  const mapped = idField.recordIdTypes.map(mapIdTypeToTs);

  return `CerialId<${mapped.join(' | ')}>`;
}

/**
 * Find the column position immediately after the `Record` (or `Record[]`) token
 * on a source line. Returns null if not found.
 */
function findRecordTypeEnd(sourceLine: string, isArray: boolean): number | null {
  const pattern = isArray ? /\bRecord\s*\[\s*\]/ : /\bRecord\b/;
  const match = sourceLine.match(pattern);
  if (!match || match.index === undefined) return null;

  return match.index + match[0].length;
}

/** Check whether an LSP position falls within an LSP range. */
function isInLspRange(
  pos: { line: number; character: number },
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) return false;
  if (pos.line === range.end.line && pos.character > range.end.character) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Hint generators
// ---------------------------------------------------------------------------

/**
 * Generate FK type-inference hints for Record fields paired with Relations.
 *
 * When a Record field has a paired Relation @field/@model, the FK type is
 * inferred from the target model's @id type. The hint shows the resolved
 * CerialId<T> type after the Record keyword.
 */
function generateFkHints(
  model: ASTModel,
  sourceLines: string[],
  indexer: WorkspaceIndexer,
  groupName: string,
): InlayHint[] {
  const hints: InlayHint[] = [];

  for (const field of model.fields) {
    if (field.type !== 'record') continue;

    // Skip @id fields — those are the model's own ID, not FK
    if (hasDecorator(field, 'id')) continue;

    // Find paired Relation with @field(thisFieldName)
    const pairedRelation = model.fields.find(
      (f) => f.type === 'relation' && f.decorators.some((d) => d.type === 'field' && d.value === field.name),
    );
    if (!pairedRelation) continue;

    // Get target model name from @model() decorator
    const modelDec = getDecorator(pairedRelation, 'model');
    if (!modelDec?.value) continue;

    const targetModel = findModelInGroup(indexer, groupName, modelDec.value as string);
    if (!targetModel) continue;

    // Build type hint
    const typeHint = buildFkTypeHint(targetModel);

    // Locate the end of "Record" or "Record[]" on the field's line
    const fieldLine = field.range.start.line - 1; // 0-indexed for LSP
    const lineText = sourceLines[fieldLine];
    if (!lineText) continue;

    const recordEnd = findRecordTypeEnd(lineText, !!field.isArray);
    if (recordEnd === null) continue;

    hints.push({
      position: { line: fieldLine, character: recordEnd },
      label: `: ${typeHint}`,
      kind: InlayHintKind.Type,
      paddingLeft: true,
    });
  }

  return hints;
}

/**
 * Generate behavioral hints derived from field decorators.
 *
 * - @uuid / @uuid4 / @uuid7 → `auto-generated` (before field name)
 * - @createdAt / @updatedAt → `server-set` (before field name)
 * - @now → `computed` (before field name)
 * - @defaultAlways → `resets on write` (after decorator)
 */
function generateDecoratorHints(fields: readonly ASTField[]): InlayHint[] {
  const hints: InlayHint[] = [];

  for (const field of fields) {
    const startPos = cerialToLsp(field.range.start);

    // @uuid / @uuid4 / @uuid7 → auto-generated
    if (hasDecorator(field, 'uuid') || hasDecorator(field, 'uuid4') || hasDecorator(field, 'uuid7')) {
      hints.push({
        position: startPos,
        label: 'auto-generated',
        kind: InlayHintKind.Parameter,
        paddingRight: true,
      });
    }

    // @createdAt / @updatedAt → server-set
    if (hasDecorator(field, 'createdAt') || hasDecorator(field, 'updatedAt')) {
      hints.push({
        position: startPos,
        label: 'server-set',
        kind: InlayHintKind.Parameter,
        paddingRight: true,
      });
    }

    // @now → computed
    if (hasDecorator(field, 'now')) {
      hints.push({
        position: startPos,
        label: 'computed',
        kind: InlayHintKind.Parameter,
        paddingRight: true,
      });
    }

    // @defaultAlways → resets on write (after the decorator)
    const defaultAlwaysDec = getDecorator(field, 'defaultAlways');
    if (defaultAlwaysDec) {
      hints.push({
        position: cerialToLsp(defaultAlwaysDec.range.end),
        label: 'resets on write',
        kind: InlayHintKind.Parameter,
        paddingLeft: true,
      });
    }
  }

  return hints;
}

/**
 * Generate "from ParentName" hints on fields that override a parent's fields.
 *
 * When a model or object uses `extends`, any field whose name also appears
 * in the parent definition gets an annotation showing its origin.
 */
function generateInheritanceHints(
  fields: readonly ASTField[],
  parentName: string,
  parentFields: readonly ASTField[],
): InlayHint[] {
  const parentFieldNames = new Set(parentFields.map((f) => f.name));
  const hints: InlayHint[] = [];

  for (const field of fields) {
    if (parentFieldNames.has(field.name)) {
      hints.push({
        position: cerialToLsp(field.range.end),
        label: `from ${parentName}`,
        kind: InlayHintKind.Parameter,
        paddingLeft: true,
      });
    }
  }

  return hints;
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the inlay hints provider on the LSP connection.
 *
 * Returns InlayHint[] for the requested range, covering FK type inference,
 * decorator-based behavioral hints, and inheritance annotations.
 * Each hint category respects its corresponding settings toggle.
 */
export function registerInlayHintsProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
  getSettings: () => CerialSettings,
): void {
  connection.languages.inlayHint.on((params) => {
    const hintSettings = getSettings().inlayHints;

    // Master toggle — disable all inlay hints
    if (!hintSettings.enabled) return [];

    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return [];

    const source = doc.getText();
    const sourceLines = source.split('\n');
    const group = indexer.getSchemaGroup(params.textDocument.uri);
    const groupName = group?.name ?? null;

    const hints: InlayHint[] = [];

    // ── Models ──────────────────────────────────────────────────────────
    for (const model of ast.models) {
      // FK type-inference hints (needs schema group for cross-file lookup)
      if (hintSettings.inferredTypes && groupName) {
        hints.push(...generateFkHints(model, sourceLines, indexer, groupName));
      }

      // Decorator behavioral hints
      if (hintSettings.serverSetFields) {
        hints.push(...generateDecoratorHints(model.fields));
      }

      // Inheritance hints
      if (hintSettings.inheritedFields && model.extends && groupName) {
        const parent = findModelInGroup(indexer, groupName, model.extends);
        if (parent) {
          hints.push(...generateInheritanceHints(model.fields, model.extends, parent.fields));
        }
      }
    }

    // ── Objects ──────────────────────────────────────────────────────────
    for (const obj of ast.objects) {
      // Decorator behavioral hints (objects support @createdAt, @updatedAt, @defaultAlways)
      if (hintSettings.serverSetFields) {
        hints.push(...generateDecoratorHints(obj.fields));
      }

      // Inheritance hints
      if (hintSettings.inheritedFields && obj.extends && groupName) {
        const parent = findObjectInGroup(indexer, groupName, obj.extends);
        if (parent) {
          hints.push(...generateInheritanceHints(obj.fields, obj.extends, parent.fields));
        }
      }
    }

    // Filter to the requested visible range
    const filtered = hints.filter((h) => isInLspRange(h.position, params.range));

    return filtered;
  });
}
