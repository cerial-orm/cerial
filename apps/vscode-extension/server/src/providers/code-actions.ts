/**
 * Code Actions / Quick Fixes provider for .cerial files.
 *
 * Maps diagnostic message patterns to actionable quick-fix text edits.
 * Only provides QuickFix actions (no refactoring) — each fix corresponds
 * to a specific validator error that can be resolved with a simple edit.
 *
 * Since the diagnostics provider does not set diagnostic codes, all matching
 * is done via message text patterns.
 */

import {
  type CodeAction,
  CodeActionKind,
  type Connection,
  type Diagnostic,
  type Range,
  type TextDocuments,
  TextEdit,
  type WorkspaceEdit,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { WorkspaceIndexer } from '../indexer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A quick fix generator: given a diagnostic and document context, returns CodeAction(s) or null */
type FixGenerator = (
  diag: Diagnostic,
  doc: TextDocument,
  uri: string,
  indexer: WorkspaceIndexer,
) => CodeAction[] | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get the text of a specific 0-indexed line from the document */
function getLineText(doc: TextDocument, line: number): string {
  const startOffset = doc.offsetAt({ line, character: 0 });
  const endOffset = doc.offsetAt({ line: line + 1, character: 0 });
  const text = doc.getText().slice(startOffset, endOffset);

  // Strip trailing newline
  return text.replace(/\r?\n$/, '');
}

/** Create a CodeAction with a single-file WorkspaceEdit */
function makeQuickFix(title: string, uri: string, edits: TextEdit[], diag: Diagnostic, isPreferred = true): CodeAction {
  const action: CodeAction = {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diag],
    edit: { changes: { [uri]: edits } } satisfies WorkspaceEdit,
    isPreferred,
  };

  return action;
}

/**
 * Find the column range of the first occurrence of `needle` in `lineText`.
 * Returns [start, end] columns, or null if not found.
 */
function findInLine(lineText: string, needle: string): [number, number] | null {
  const idx = lineText.indexOf(needle);
  if (idx === -1) return null;

  return [idx, idx + needle.length];
}

/**
 * Extract a quoted name from a diagnostic message using a regex.
 * Returns the first capture group, or null.
 */
function extractName(message: string, pattern: RegExp): string | null {
  const match = pattern.exec(message);

  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Fix generators
// ---------------------------------------------------------------------------

/**
 * Fix 1: Add @id field to model missing it.
 *
 * Diagnostic: `Model "X" does not have an @id field.`
 * Fix: Insert `  id Record @id` on the line after the model header.
 */
const fixAddIdField: FixGenerator = (diag, _doc, uri) => {
  if (!diag.message.includes('does not have an @id field')) return null;

  // The diagnostic range covers the model header line.
  // Insert a new field line right after it.
  const insertLine = diag.range.start.line + 1;
  const insertPos = { line: insertLine, character: 0 };
  const edit = TextEdit.insert(insertPos, '  id Record @id\n');

  return [makeQuickFix('Add "id Record @id" field', uri, [edit], diag)];
};

/**
 * Fix 2: Remove @nullable from object-type field.
 *
 * Diagnostic: `@nullable is not allowed on object field 'X' in ...`
 * Fix: Remove the `@nullable` text (and leading space) from the field line.
 */
const fixRemoveNullableFromObjectField: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('@nullable is not allowed on object field')) return null;

  return removeDecoratorFromLine(diag, doc, uri, '@nullable');
};

/**
 * Fix 3: Remove @nullable from tuple-type field.
 *
 * Diagnostic: `@nullable is not allowed on tuple field 'X' in ...`
 * Fix: Remove the `@nullable` text (and leading space) from the field line.
 */
const fixRemoveNullableFromTupleField: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('@nullable is not allowed on tuple field')) return null;

  return removeDecoratorFromLine(diag, doc, uri, '@nullable');
};

/**
 * Fix 4: Remove `?` from Any field.
 *
 * Diagnostic: `Optional (?) is not allowed on Any field 'X' in ...`
 * Fix: Remove `?` after the `Any` type name.
 */
const fixRemoveOptionalFromAnyField: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('Optional (?) is not allowed on Any field')) return null;

  const line = diag.range.start.line;
  const lineText = getLineText(doc, line);

  // Look for `Any?` pattern (no space) or `Any ?` (with space)
  const anyQIdx = lineText.indexOf('Any?');
  if (anyQIdx !== -1) {
    const range: Range = {
      start: { line, character: anyQIdx + 3 },
      end: { line, character: anyQIdx + 4 },
    };
    const edit = TextEdit.del(range);

    return [makeQuickFix('Remove "?" from Any field', uri, [edit], diag)];
  }

  // Fallback: `Any ?` with space
  const anySpaceQIdx = lineText.indexOf('Any ?');
  if (anySpaceQIdx !== -1) {
    const range: Range = {
      start: { line, character: anySpaceQIdx + 3 },
      end: { line, character: anySpaceQIdx + 5 },
    };
    const edit = TextEdit.del(range);

    return [makeQuickFix('Remove "?" from Any field', uri, [edit], diag)];
  }

  return null;
};

/**
 * Fix 5: Replace `?` with `@nullable` on tuple element.
 *
 * Diagnostic: `Optional elements (?) are not allowed in tuples. Use @nullable instead.`
 * Fix: Find `Type?` and replace `?` with ` @nullable` (or ` @nullable` appended).
 */
const fixReplaceTupleOptionalWithNullable: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('Optional elements (?) are not allowed in tuples')) return null;

  // Extract element name from message: Element 'X' in tuple Y
  const elemName = extractName(diag.message, /Element '([^']+)'/);
  if (!elemName) return null;

  // Tuple-level diagnostics point to the tuple header line.
  // We need to scan the tuple body to find the element with `?`.
  const startLine = diag.range.start.line;
  const lineCount = doc.lineCount;

  for (let l = startLine + 1; l < lineCount; l++) {
    const lineText = getLineText(doc, l);

    // Stop at closing brace
    if (lineText.trim() === '}') break;

    // Check if this line contains the element name or a `?` after a type
    // Pattern: `  name Type?` or `  Type?` (unnamed element)
    const qMatch = lineText.match(/(\w+)\?/);
    if (!qMatch) continue;

    // Verify this is the right element line — either the element name appears
    // or for unnamed elements, any line with Type? is a candidate
    const hasElemName = elemName.startsWith('element[') || lineText.includes(elemName);
    if (!hasElemName && !elemName.startsWith('element[')) continue;

    const qIdx = lineText.indexOf(qMatch[0]!);
    const qCharPos = qIdx + qMatch[0]!.length - 1;

    // Remove the `?`
    const delRange: Range = {
      start: { line: l, character: qCharPos },
      end: { line: l, character: qCharPos + 1 },
    };

    // Find end of line content (before any comment) to append @nullable
    const trimmed = lineText.trimEnd();
    const appendPos = { line: l, character: trimmed.length };
    const edits = [TextEdit.del(delRange), TextEdit.insert(appendPos, ' @nullable')];

    return [makeQuickFix('Replace "?" with @nullable', uri, edits, diag)];
  }

  return null;
};

/**
 * Fix 6: Add @nullable when @default(null) is present.
 *
 * Diagnostic: `@default(null) requires @nullable on field 'X' in ...`
 *          or `@default(null) requires @nullable on element 'X' in ...`
 * Fix: Insert `@nullable ` before `@default(null)`.
 */
const fixAddNullableForDefaultNull: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('@default(null) requires @nullable')) return null;

  const line = diag.range.start.line;
  const lineText = getLineText(doc, line);

  const cols = findInLine(lineText, '@default(null)');
  if (!cols) return null;

  const insertPos = { line, character: cols[0] };
  const edit = TextEdit.insert(insertPos, '@nullable ');

  return [makeQuickFix('Add @nullable before @default(null)', uri, [edit], diag)];
};

/**
 * Fix 7: Remove conflicting decorator.
 *
 * Matches various patterns:
 * - `@X and @Y cannot be used together on field 'Z' in ...`
 * - `@X and @default cannot be used together on field 'Z' in ...`
 * - `@X and @defaultAlways cannot be used together on field 'Z' in ...`
 * - `Field 'Z' ... has multiple timestamp decorators (X). Only one of ...`
 * - `@X cannot be combined with timestamp decorators on field 'Z' in ...`
 * - `@X and @Y cannot be used together on element 'Z' in ...`
 *
 * Fix: Offer to remove each of the conflicting decorators.
 */
const fixRemoveConflictingDecorator: FixGenerator = (diag, doc, uri) => {
  const msg = diag.message;

  // Pattern 1: `@X and @Y cannot be used together`
  const twoDecMatch = msg.match(/@(\w+) and @(\w+) cannot be used together/);
  if (twoDecMatch) {
    const dec1 = twoDecMatch[1]!;
    const dec2 = twoDecMatch[2]!;
    const actions: CodeAction[] = [];

    const remove1 = removeDecoratorFromLine(diag, doc, uri, `@${dec1}`);
    if (remove1) {
      for (const a of remove1) {
        a.title = `Remove @${dec1}`;
        a.isPreferred = false;
      }
      actions.push(...remove1);
    }

    const remove2 = removeDecoratorFromLine(diag, doc, uri, `@${dec2}`);
    if (remove2) {
      for (const a of remove2) {
        a.title = `Remove @${dec2}`;
        a.isPreferred = true;
      }
      actions.push(...remove2);
    }

    if (actions.length) return actions;
  }

  // Pattern 2: `@X cannot be combined with timestamp decorators`
  const combinedMatch = msg.match(/@(\w+) cannot be combined with timestamp decorators/);
  if (combinedMatch) {
    const dec = combinedMatch[1]!;
    const actions = removeDecoratorFromLine(diag, doc, uri, `@${dec}`);
    if (actions) {
      for (const a of actions) {
        a.title = `Remove @${dec}`;
      }

      return actions;
    }
  }

  // Pattern 3: `has multiple timestamp decorators`
  if (msg.includes('has multiple timestamp decorators')) {
    // Extract the decorator names from the parenthesized list
    const listMatch = msg.match(/\(([^)]+)\)/);
    if (listMatch) {
      const names = listMatch[1]!.split(',').map((n) => n.trim());
      const actions: CodeAction[] = [];

      for (const name of names) {
        const decName = name.startsWith('@') ? name : `@${name}`;
        const removal = removeDecoratorFromLine(diag, doc, uri, decName);
        if (removal) {
          for (const a of removal) {
            a.title = `Remove ${decName}`;
            a.isPreferred = false;
          }
          actions.push(...removal);
        }
      }

      if (actions.length) return actions;
    }
  }

  return null;
};

/**
 * Fix 8: Add `abstract` keyword to parent model.
 *
 * Diagnostic: `Model "X" extends concrete model "Y". Models can only extend abstract models.`
 * Fix: Add `abstract ` before the parent model's `model` keyword.
 */
const fixAddAbstractToParent: FixGenerator = (diag, doc, uri, indexer) => {
  if (!diag.message.includes('extends concrete model')) return null;
  if (!diag.message.includes('Models can only extend abstract models')) return null;

  // Extract parent model name from: extends concrete model "Y"
  const parentName = extractName(diag.message, /extends concrete model "([^"]+)"/);
  if (!parentName) return null;

  // Find the parent model's position in the AST
  const ast = indexer.getAST(uri);
  if (!ast) return null;

  // Search in the current file first
  for (const model of ast.models) {
    if (model.name !== parentName) continue;

    // model.range.start is 1-indexed line, 0-indexed column
    const modelLine = model.range.start.line - 1;
    const lineText = getLineText(doc, modelLine);
    const modelIdx = lineText.indexOf('model ');
    if (modelIdx === -1) continue;

    const insertPos = { line: modelLine, character: modelIdx };
    const edit = TextEdit.insert(insertPos, 'abstract ');

    return [makeQuickFix(`Add "abstract" to model ${parentName}`, uri, [edit], diag)];
  }

  // Parent might be in another file in the same schema group
  const group = indexer.getSchemaGroup(uri);
  if (!group) return null;

  for (const [, entry] of indexer.index) {
    if (entry.schemaGroup !== group.name) continue;
    if (!entry.ast) continue;

    for (const model of entry.ast.models) {
      if (model.name !== parentName) continue;

      // We need the document for that file — but it may not be open.
      // Code actions can only edit the current file's document reliably.
      // For cross-file fixes, we'd need to construct the URI and use WorkspaceEdit.
      // For now, only support same-file fixes.
      break;
    }
  }

  return null;
};

/**
 * Fix 9: Suggest existing model names for invalid @model() reference.
 *
 * Diagnostic: `Relation field "X" references non-existent model "Y"`
 * Fix: Offer quick fixes to replace with each existing model name.
 */
const fixSuggestModelName: FixGenerator = (diag, doc, uri, indexer) => {
  if (!diag.message.includes('references non-existent model')) return null;

  // Extract the invalid model name
  const invalidName = extractName(diag.message, /non-existent model "([^"]+)"/);
  if (!invalidName) return null;

  // Collect all model names from the schema group
  const group = indexer.getSchemaGroup(uri);
  const modelNames = new Set<string>();

  if (group) {
    const allASTs = indexer.getAllASTsInGroup(group.name);
    for (const [, ast] of allASTs) {
      for (const model of ast.models) {
        modelNames.add(model.name);
      }
    }
  } else {
    const ast = indexer.getAST(uri);
    if (ast) {
      for (const model of ast.models) {
        modelNames.add(model.name);
      }
    }
  }

  if (!modelNames.size) return null;

  // Find the invalid name in the diagnostic line to know where to replace
  const line = diag.range.start.line;
  const lineText = getLineText(doc, line);

  // Find @model(InvalidName) pattern
  const modelPattern = `@model(${invalidName})`;
  const cols = findInLine(lineText, modelPattern);
  if (!cols) return null;

  // The replacement range is just the name inside @model(...)
  const nameStart = cols[0] + '@model('.length;
  const nameEnd = nameStart + invalidName.length;
  const replaceRange: Range = {
    start: { line, character: nameStart },
    end: { line, character: nameEnd },
  };

  // Score and sort suggestions by similarity
  const suggestions = rankSuggestions(invalidName, [...modelNames]);
  const actions: CodeAction[] = [];

  for (let i = 0; i < Math.min(suggestions.length, 5); i++) {
    const suggestion = suggestions[i]!;
    const edit = TextEdit.replace(replaceRange, suggestion);
    actions.push(makeQuickFix(`Change to @model(${suggestion})`, uri, [edit], diag, i === 0));
  }

  return actions.length ? actions : null;
};

/**
 * Fix 10: Remove @nullable from @id field.
 *
 * Diagnostic: `@nullable is not allowed on @id field 'X' in ...`
 * Fix: Remove `@nullable` from the field line.
 */
const fixRemoveNullableFromIdField: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('@nullable is not allowed on @id field')) return null;

  return removeDecoratorFromLine(diag, doc, uri, '@nullable');
};

/**
 * Fix 11: Remove @nullable from @now field.
 *
 * Diagnostic: `@nullable is not allowed on @now field 'X' in ...`
 * Fix: Remove `@nullable` from the field line.
 */
const fixRemoveNullableFromNowField: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('@nullable is not allowed on @now field')) return null;

  return removeDecoratorFromLine(diag, doc, uri, '@nullable');
};

/**
 * Fix 12: Remove disallowed decorator from tuple element.
 *
 * Diagnostic: `Decorator @X is not allowed on tuple element 'Y' in tuple Z.`
 * Fix: Remove the disallowed decorator from the element line.
 */
const fixRemoveDisallowedTupleDecorator: FixGenerator = (diag, doc, uri) => {
  if (!diag.message.includes('is not allowed on tuple element')) return null;

  const decName = extractName(diag.message, /Decorator @(\w+) is not allowed/);
  if (!decName) return null;

  // Tuple element diagnostics point to the tuple header line.
  // We need to scan the body to find the element with that decorator.
  const elemName = extractName(diag.message, /element '([^']+)'/);
  if (!elemName) return null;

  const startLine = diag.range.start.line;
  const lineCount = doc.lineCount;

  for (let l = startLine + 1; l < lineCount; l++) {
    const lineText = getLineText(doc, l);
    if (lineText.trim() === '}') break;

    // Check if this line has the decorator and matches the element
    if (!lineText.includes(`@${decName}`)) continue;

    const hasElemName = elemName.startsWith('element[') || lineText.trimStart().startsWith(elemName);
    if (!hasElemName && !elemName.startsWith('element[')) continue;

    const removal = removeDecoratorFromLineText(l, lineText, `@${decName}`);
    if (removal) {
      return [makeQuickFix(`Remove @${decName} from tuple element`, uri, [removal], diag)];
    }
  }

  return null;
};

// ---------------------------------------------------------------------------
// Shared removal helper
// ---------------------------------------------------------------------------

/**
 * Remove a decorator (e.g., `@nullable`) from the line indicated by the diagnostic range.
 * Handles `@decorator` with optional leading/trailing whitespace.
 */
function removeDecoratorFromLine(
  diag: Diagnostic,
  doc: TextDocument,
  uri: string,
  decorator: string,
): CodeAction[] | null {
  const line = diag.range.start.line;
  const lineText = getLineText(doc, line);

  const edit = removeDecoratorFromLineText(line, lineText, decorator);
  if (!edit) return null;

  return [makeQuickFix(`Remove ${decorator}`, uri, [edit], diag)];
}

/**
 * Create a TextEdit that removes a decorator token from a line.
 * Removes the decorator and one adjacent space to avoid double spaces.
 */
function removeDecoratorFromLineText(line: number, lineText: string, decorator: string): TextEdit | null {
  const idx = lineText.indexOf(decorator);
  if (idx === -1) return null;

  let removeStart = idx;
  let removeEnd = idx + decorator.length;

  // Remove trailing space if present (avoids double spaces)
  if (removeEnd < lineText.length && lineText[removeEnd] === ' ') {
    removeEnd++;
  } else if (removeStart > 0 && lineText[removeStart - 1] === ' ') {
    // Otherwise remove leading space
    removeStart--;
  }

  const range: Range = {
    start: { line, character: removeStart },
    end: { line, character: removeEnd },
  };

  return TextEdit.del(range);
}

// ---------------------------------------------------------------------------
// Name similarity scoring
// ---------------------------------------------------------------------------

/**
 * Rank model name suggestions by similarity to the invalid name.
 * Uses case-insensitive prefix matching and Levenshtein distance.
 */
function rankSuggestions(invalid: string, candidates: string[]): string[] {
  const lower = invalid.toLowerCase();

  const scored = candidates.map((name) => {
    const nameLower = name.toLowerCase();
    let score = 0;

    // Exact prefix match (case-insensitive)
    if (nameLower.startsWith(lower) || lower.startsWith(nameLower)) {
      score += 100;
    }

    // Shared prefix length
    let shared = 0;
    for (let i = 0; i < Math.min(lower.length, nameLower.length); i++) {
      if (lower[i] === nameLower[i]) shared++;
      else break;
    }
    score += shared * 10;

    // Penalize by length difference
    score -= Math.abs(name.length - invalid.length) * 2;

    // Penalize by simple edit distance approximation
    score -= levenshtein(lower, nameLower);

    return { name, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.name);
}

/**
 * Simple Levenshtein distance for short strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = [];

  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0]![j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }

  return dp[m]![n]!;
}

// ---------------------------------------------------------------------------
// Fix registry
// ---------------------------------------------------------------------------

/** All fix generators, checked in order for each diagnostic */
const FIX_GENERATORS: FixGenerator[] = [
  fixAddIdField,
  fixRemoveNullableFromObjectField,
  fixRemoveNullableFromTupleField,
  fixRemoveOptionalFromAnyField,
  fixReplaceTupleOptionalWithNullable,
  fixAddNullableForDefaultNull,
  fixRemoveConflictingDecorator,
  fixAddAbstractToParent,
  fixSuggestModelName,
  fixRemoveNullableFromIdField,
  fixRemoveNullableFromNowField,
  fixRemoveDisallowedTupleDecorator,
];

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the Code Actions provider on the LSP connection.
 *
 * Iterates diagnostics in the request context and generates QuickFix actions
 * by matching diagnostic message patterns against known fix generators.
 */
export function registerCodeActionsProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onCodeAction((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return [];

    const uri = params.textDocument.uri;
    const actions: CodeAction[] = [];

    for (const diag of params.context.diagnostics) {
      // Only process cerial diagnostics
      if (diag.source !== 'cerial') continue;

      for (const generator of FIX_GENERATORS) {
        const fixes = generator(diag, doc, uri, indexer);
        if (fixes) {
          actions.push(...fixes);
        }
      }
    }

    return actions;
  });
}
