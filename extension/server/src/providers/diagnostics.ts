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
  validateFieldNames,
  validateModelNames,
  validateNullableDecorator,
  validateNullableOnObjectFields,
  validateNullableOnTupleElements,
  validateRecordIdTypes,
  validateRelationRules,
  validateSchema,
  validateTupleElementDecorators,
  validateUuidFields,
} from '../../../../src/cli/validators';
import type { ParseError, SchemaAST, SourceRange } from '../../../../src/types';
import type { WorkspaceIndexer } from '../indexer';
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
  _documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.languages.diagnostics.on(async (params): Promise<DocumentDiagnosticReport> => {
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

    // All remaining validators return SchemaValidationError[] directly
    validationErrors.push(...validateFieldNames(validationAST));
    validationErrors.push(...validateModelNames(validationAST));
    validationErrors.push(...validateRelationRules(validationAST));
    validationErrors.push(...validateRecordIdTypes(validationAST));
    validationErrors.push(...validateExtends(validationAST));
    validationErrors.push(...validateNullableDecorator(validationAST));
    validationErrors.push(...validateNullableOnObjectFields(validationAST));
    validationErrors.push(...validateNullableOnTupleElements(validationAST));
    validationErrors.push(...validateTupleElementDecorators(validationAST));
    validationErrors.push(...validateUuidFields(validationAST));

    // Step 5: Filter to current file
    const fileErrors = filterErrorsToFile(validationErrors, fileAST);

    // Step 6: Convert to LSP Diagnostics
    for (const error of fileErrors) {
      diagnostics.push(validationErrorToDiagnostic(error, fileAST));
    }

    return {
      kind: DocumentDiagnosticReportKind.Full,
      items: diagnostics,
    };
  });
}
