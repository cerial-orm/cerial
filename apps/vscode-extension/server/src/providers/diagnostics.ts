/**
 * Pull-based diagnostics provider for .cerial files.
 *
 * Converts cerial parser errors and schema validation errors into LSP Diagnostics.
 * Uses the pull diagnostics pattern: VS Code requests diagnostics per document,
 * we respond with the current errors.
 *
 * Pipeline:
 * 1. Parse errors from indexer (always Error severity)
 * 2. Schema validation errors from validators (run on resolved AST for cross-file validation)
 * 3. Filter validation errors to only those relevant to the current file
 * 4. Convert all errors to LSP Diagnostics with precise source ranges
 */

import {
  type Connection,
  type Diagnostic,
  DiagnosticSeverity,
  type DocumentDiagnosticReport,
  DocumentDiagnosticReportKind,
  type TextDocuments,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  type SchemaValidationError,
  validateExtends,
  validateSchema,
} from '../../../../orm/src/cli/validators';
import type { ASTField, ParseError, SchemaAST, SourceRange } from '../../../../orm/src/types';
import type { WorkspaceIndexer } from '../indexer';
import type { CerialSettings } from '../server';
import { findFieldByName } from '../utils/ast-location';
import { cerialRangeToLsp, cerialToLsp } from '../utils/position';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collect all type names defined in a file's own AST.
 * Used for filtering validation errors to the current file.
 */
function collectFileTypeNames(ast: SchemaAST): Set<string> {
  const names = new Set<string>();
  for (const m of ast.models) names.add(m.name);
  for (const o of ast.objects) names.add(o.name);
  for (const t of ast.tuples) names.add(t.name);
  for (const e of ast.enums) names.add(e.name);
  for (const l of ast.literals) names.add(l.name);

  return names;
}

/**
 * Check if a 1-indexed line number falls within any block range in the file AST.
 */
function isLineInFileAST(ast: SchemaAST, line: number): boolean {
  const blocks = [...ast.models, ...ast.objects, ...ast.tuples, ...ast.enums, ...ast.literals];

  for (const block of blocks) {
    if (line >= block.range.start.line && line <= block.range.end.line) return true;
  }

  return false;
}

/**
 * Find a block (model/object/tuple/enum/literal) by name in the file AST.
 * Returns the block's source range, or null if not found.
 */
function findBlockByName(ast: SchemaAST, name: string): SourceRange | null {
  for (const m of ast.models) if (m.name === name) return m.range;
  for (const o of ast.objects) if (o.name === name) return o.range;
  for (const t of ast.tuples) if (t.name === name) return t.range;
  for (const e of ast.enums) if (e.name === name) return e.range;
  for (const l of ast.literals) if (l.name === name) return l.range;

  return null;
}

// ---------------------------------------------------------------------------
// Range helpers
// ---------------------------------------------------------------------------

/** Create a full-line range from a 1-indexed cerial line number. */
function lineRange(line: number): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  return {
    start: { line: line - 1, character: 0 },
    end: { line: line - 1, character: Number.MAX_SAFE_INTEGER },
  };
}

/** Create a zero-position range (fallback for errors with no location). */
function zeroRange(): {
  start: { line: number; character: number };
  end: { line: number; character: number };
} {
  return {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 0 },
  };
}

// ---------------------------------------------------------------------------
// Error → Diagnostic converters
// ---------------------------------------------------------------------------

/**
 * Convert a ParseError to an LSP Diagnostic.
 * Parse errors are always Error severity.
 */
function parseErrorToDiagnostic(error: ParseError): Diagnostic {
  const range = error.range
    ? cerialRangeToLsp(error.range)
    : {
        start: cerialToLsp(error.position),
        end: { line: error.position.line - 1, character: Number.MAX_SAFE_INTEGER },
      };

  return {
    range,
    message: error.message,
    severity: DiagnosticSeverity.Error,
    source: 'cerial',
  };
}

/**
 * Convert a SchemaValidationError to an LSP Diagnostic.
 * Uses the file AST to locate precise ranges for errors.
 *
 * Range resolution priority:
 * 1. model + field → findFieldByName for exact field range
 * 2. model only → block header line
 * 3. line only → full line highlight
 * 4. no location → line 0, col 0-0
 */
function validationErrorToDiagnostic(error: SchemaValidationError, fileAST: SchemaAST): Diagnostic {
  let range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };

  if (error.model && error.field) {
    // Try to find the exact field range via AST lookup
    const field = findFieldByName(fileAST, error.model, error.field);
    if (field) {
      range = cerialRangeToLsp(field.range);
    } else if (error.line) {
      range = lineRange(error.line);
    } else {
      range = zeroRange();
    }
  } else if (error.model) {
    // Find the block and highlight its header line
    const blockRange = findBlockByName(fileAST, error.model);
    if (blockRange) {
      range = {
        start: cerialToLsp(blockRange.start),
        end: { line: blockRange.start.line - 1, character: Number.MAX_SAFE_INTEGER },
      };
    } else if (error.line) {
      range = lineRange(error.line);
    } else {
      range = zeroRange();
    }
  } else if (error.line) {
    range = lineRange(error.line);
  } else {
    range = zeroRange();
  }

  // Heuristic: messages starting with "Warning:" get Warning severity
  const severity = error.message.startsWith('Warning:') ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error;

  return {
    range,
    message: error.message,
    severity,
    source: 'cerial',
  };
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/**
 * Filter validation errors to only those relevant to the current file.
 *
 * Strategy:
 * - Errors with `model` field → keep if model/type name is defined in this file's AST
 * - Errors with only `line` → keep if line falls within a block range in this file
 * - Errors with no location → skip (can't attribute to any file)
 */
function filterErrorsToFile(errors: SchemaValidationError[], fileAST: SchemaAST): SchemaValidationError[] {
  const fileTypeNames = collectFileTypeNames(fileAST);

  return errors.filter((error) => {
    if (error.model) {
      return fileTypeNames.has(error.model);
    }

    if (error.line) {
      return isLineInFileAST(fileAST, error.line);
    }

    return false;
  });
}

// ---------------------------------------------------------------------------
// Extension-level diagnostics (not from ORM validators)
// ---------------------------------------------------------------------------

/** All valid decorator names (used to validate tokens after field type). */
const VALID_DECORATOR_NAMES = new Set([
  'id',
  'unique',
  'index',
  'now',
  'createdAt',
  'updatedAt',
  'default',
  'field',
  'model',
  'onDelete',
  'key',
  'distinct',
  'sort',
  'set',
  'defaultAlways',
  'flexible',
  'readonly',
  'nullable',
  'uuid',
  'uuid4',
  'uuid7',
  'point',
  'line',
  'polygon',
  'multipoint',
  'multiline',
  'multipolygon',
  'geoCollection',
]);

/**
 * Check if a line represents a composite directive (@@index, @@unique).
 */
function isCompositeDirectiveLine(trimmed: string): boolean {
  return trimmed.startsWith('@@');
}

/**
 * Detect invalid tokens after the field type on field lines.
 * Returns diagnostics for any token that is not a valid decorator, `?`, `[]`,
 * `!!private`, or a comment.
 *
 * Strategy: For each field in the AST, get its source line and scan for
 * unrecognized tokens after the type position.
 */
export function getInvalidTokenDiagnostics(fileAST: SchemaAST, sourceLines: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const processField = (field: ASTField): void => {
    // Field range uses 1-indexed lines
    const lineIdx = field.range.start.line - 1;
    if (lineIdx < 0 || lineIdx >= sourceLines.length) return;

    const line = sourceLines[lineIdx]!;

    // Strip comments (// and # style)
    const commentIdx = findCommentStart(line);
    const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const trimmed = codePart.trimStart();
    if (!trimmed) return;

    // Skip composite directives
    if (isCompositeDirectiveLine(trimmed)) return;

    // Tokenize the code part after stripping field name and type
    // Pattern: fieldName Type[?][[]] [decorators...] [!!private]
    // We need to find the position after the type token

    // Match: fieldName Type, optionally followed by ? and/or []
    // Also handle Record(int, string) and Record(int) patterns
    const fieldLinePattern = /^(\s*)(\w+)\s+(\w+)(\([^)]*\))?/;
    const match = trimmed.match(fieldLinePattern);
    if (!match) return;

    // Calculate offset of the part after the type (and optional parens)
    const leadingSpaces = codePart.length - codePart.trimStart().length;
    let afterTypeOffset = leadingSpaces + match[0].length;

    // The remaining portion of the code line after the type + optional parens
    let remaining = codePart.slice(afterTypeOffset);

    // Skip over `?`, `[]`, and whitespace that follow the type
    const modifierPattern = /^(\s*\??\s*(?:\[\])?\s*)/;
    const modMatch = remaining.match(modifierPattern);
    if (modMatch) {
      afterTypeOffset += modMatch[0].length;
      remaining = codePart.slice(afterTypeOffset);
    }

    if (!remaining.trim()) return;

    // Scan remaining tokens
    const tokenPattern = /(@\w+(?:\([^)]*\))?|!!private|\S+)/g;
    for (
      let tokenMatch = tokenPattern.exec(remaining);
      tokenMatch !== null;
      tokenMatch = tokenPattern.exec(remaining)
    ) {
      const token = tokenMatch[0];
      const tokenStart = afterTypeOffset + tokenMatch.index;

      // Valid: decorator (@word with optional parens)
      if (token.startsWith('@')) {
        const decName = token.match(/^@(\w+)/)?.[1];
        if (decName && VALID_DECORATOR_NAMES.has(decName)) continue;
        // Unknown decorator — flag it
        diagnostics.push({
          range: {
            start: { line: lineIdx, character: tokenStart },
            end: { line: lineIdx, character: tokenStart + token.length },
          },
          message: `Unknown decorator '${token}'. Expected a valid decorator (e.g., @default, @unique, @nullable).`,
          severity: DiagnosticSeverity.Warning,
          source: 'cerial',
        });
        continue;
      }

      // Valid: !!private
      if (token === '!!private') continue;

      // Everything else is invalid
      diagnostics.push({
        range: {
          start: { line: lineIdx, character: tokenStart },
          end: { line: lineIdx, character: tokenStart + token.length },
        },
        message: `Unexpected token '${token}'. Only decorators (e.g., @default) or '!!private' are allowed after the field type.`,
        severity: DiagnosticSeverity.Warning,
        source: 'cerial',
      });
    }
  };

  // Process all fields in models and objects
  for (const model of fileAST.models) {
    for (const field of model.fields) {
      processField(field);
    }
  }
  for (const obj of fileAST.objects) {
    for (const field of obj.fields) {
      processField(field);
    }
  }

  return diagnostics;
}

/**
 * Find the start index of a comment in a line.
 * Handles `//` and `#` comment styles.
 * Returns -1 if no comment found.
 */
function findCommentStart(line: string): number {
  // Check for // and # comments (not inside strings)
  let inString: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inString) {
      if (ch === inString && line[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') return i;
    if (ch === '#') return i;
  }

  return -1;
}

/**
 * Map a SchemaFieldType to acceptable @default/@defaultAlways value types.
 * Returns a set of allowed value descriptions or null if any value is acceptable.
 */
type DefaultValueCheck =
  | {
      kind: 'type';
      allowed: Set<string>;
      description: string;
    }
  | {
      kind: 'values';
      allowed: Set<string>;
      description: string;
    }
  | null;

function getDefaultValueCheck(
  field: ASTField,
  fileAST: SchemaAST,
  uri: string,
  indexer: WorkspaceIndexer | null,
): DefaultValueCheck {
  switch (field.type) {
    case 'int':
      return { kind: 'type', allowed: new Set(['number']), description: 'an integer' };
    case 'float':
    case 'number':
      return { kind: 'type', allowed: new Set(['number']), description: 'a number' };
    case 'bool':
      return { kind: 'type', allowed: new Set(['boolean']), description: 'true or false' };
    case 'string':
    case 'email':
      return { kind: 'type', allowed: new Set(['string']), description: 'a string' };
    case 'date':
      return { kind: 'type', allowed: new Set(['string']), description: 'a date string' };
    case 'literal': {
      // Resolve the enum/literal values
      const values = resolveEnumLiteralValuesForDiagnostics(field, fileAST, uri, indexer);
      if (values) {
        return {
          kind: 'values',
          allowed: new Set(values),
          description: `one of: ${values.join(', ')}`,
        };
      }

      return null;
    }
    default:
      return null; // No validation for other types
  }
}

/**
 * Resolve enum/literal values from the file AST and cross-file ASTs.
 * Returns string representations of valid values, or null if unresolvable.
 */
function resolveEnumLiteralValuesForDiagnostics(
  field: ASTField,
  fileAST: SchemaAST,
  uri: string,
  indexer: WorkspaceIndexer | null,
): string[] | null {
  if (field.type !== 'literal' || !field.literalName) return null;

  const name = field.literalName;
  const asts: SchemaAST[] = [fileAST];

  // Cross-file resolution
  if (indexer) {
    const group = indexer.getSchemaGroup(uri);
    if (group) {
      const allASTs = indexer.getAllASTsInGroup(group.name);
      for (const [, ast] of allASTs) {
        if (ast !== fileAST) asts.push(ast);
      }
    }
  }

  // Check enums first
  for (const searchAST of asts) {
    for (const en of searchAST.enums) {
      if (en.name === name) return en.values;
    }
  }

  // Check literals
  for (const searchAST of asts) {
    for (const lit of searchAST.literals) {
      if (lit.name !== name) continue;
      const values: string[] = [];
      for (const v of lit.variants) {
        switch (v.kind) {
          case 'string':
            values.push(v.value);
            break;
          case 'int':
          case 'float':
            values.push(String(v.value));
            break;
          case 'bool':
            values.push(String(v.value));
            break;
        }
      }
      if (values.length) return values;
    }
  }

  return null;
}

/**
 * Detect @default/@defaultAlways value type mismatches.
 * For example, `age Int @default(hello)` should warn that 'hello' is not a valid integer.
 *
 * Skips null values (handled by existing nullable validator).
 */
export function getDefaultTypeMismatchDiagnostics(
  fileAST: SchemaAST,
  uri: string,
  indexer: WorkspaceIndexer | null,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const processField = (field: ASTField): void => {
    for (const dec of field.decorators) {
      if (dec.type !== 'default' && dec.type !== 'defaultAlways') continue;
      if (dec.value === undefined || dec.value === null) continue; // null handled by nullable validator

      const check = getDefaultValueCheck(field, fileAST, uri, indexer);
      if (!check) continue; // No validation available for this type

      const value = dec.value;

      if (check.kind === 'type') {
        const valueType = typeof value;
        if (!check.allowed.has(valueType)) {
          diagnostics.push({
            range: cerialRangeToLsp(dec.range),
            message: `Default value type mismatch: expected ${check.description}, got ${valueType} '${String(value)}'.`,
            severity: DiagnosticSeverity.Warning,
            source: 'cerial',
          });
        }
      } else if (check.kind === 'values') {
        const strValue = String(value);
        if (!check.allowed.has(strValue)) {
          diagnostics.push({
            range: cerialRangeToLsp(dec.range),
            message: `Default value '${strValue}' is not a valid value for ${field.literalName ?? field.type}. Expected ${check.description}.`,
            severity: DiagnosticSeverity.Warning,
            source: 'cerial',
          });
        }
      }
    }
  };

  for (const model of fileAST.models) {
    for (const field of model.fields) {
      processField(field);
    }
  }
  for (const obj of fileAST.objects) {
    for (const field of obj.fields) {
      processField(field);
    }
  }

  return diagnostics;
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the pull-based diagnostics provider on the LSP connection.
 *
 * Pipeline for each document:
 * 1. Get parse errors from indexer (always Error severity)
 * 2. Get file AST — if null, return parse errors only
 * 3. Get resolved AST for cross-file validation
 * 4. Run validators on resolved AST
 * 5. Filter validation errors to current file
 * 6. Convert all errors to LSP Diagnostics
 */
export function registerDiagnosticsProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
  getSettings: () => CerialSettings,
): void {
  connection.languages.diagnostics.on(async (params): Promise<DocumentDiagnosticReport> => {
    // When diagnostics are disabled, return an empty report
    if (!getSettings().diagnostics.enabled) {
      return {
        kind: DocumentDiagnosticReportKind.Full,
        items: [],
      };
    }

    const uri = params.textDocument.uri;
    const diagnostics: Diagnostic[] = [];

    // Step 1: Parse errors (always Error severity)
    const parseErrors = indexer.getErrors(uri);
    for (const error of parseErrors) {
      diagnostics.push(parseErrorToDiagnostic(error));
    }

    // Step 2: Get file AST — if null, return parse errors only
    const fileAST = indexer.getAST(uri);
    if (!fileAST) {
      return {
        kind: DocumentDiagnosticReportKind.Full,
        items: diagnostics,
      };
    }

    // Step 3: Get resolved AST for cross-file validation
    let validationAST: SchemaAST;
    const group = indexer.getSchemaGroup(uri);

    try {
      if (group) {
        // File belongs to a schema group — validate against the full resolved AST
        validationAST = indexer.getResolvedAST(group.name);
      } else {
        // Standalone file — validate against its own AST
        validationAST = fileAST;
      }
    } catch {
      // Inheritance resolution failed (e.g., circular extends) — fall back to file AST
      validationAST = fileAST;
    }

    // Step 4: Run ALL validators on resolved AST
    const validationErrors: SchemaValidationError[] = [];

    // validateSchema returns { valid, errors } — different shape, extract .errors
    const schemaResult = validateSchema(validationAST);
    validationErrors.push(...schemaResult.errors);

    validationErrors.push(...validateExtends(validationAST));

    // Step 5: Filter to current file
    const fileErrors = filterErrorsToFile(validationErrors, fileAST);

    // Step 6: Convert to LSP Diagnostics
    for (const error of fileErrors) {
      diagnostics.push(validationErrorToDiagnostic(error, fileAST));
    }

    // Step 7: Extension-level diagnostics (not from ORM validators)
    // These run on the file AST + source text directly
    const document = documents.get(uri);
    if (document) {
      const sourceLines = document.getText().split('\n');
      diagnostics.push(...getInvalidTokenDiagnostics(fileAST, sourceLines));
    }
    diagnostics.push(...getDefaultTypeMismatchDiagnostics(fileAST, uri, indexer));
    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: diagnostics,
    };
  });
}
