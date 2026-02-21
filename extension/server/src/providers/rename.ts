/**
 * Rename Symbol provider for .cerial files.
 *
 * Supports renaming:
 * - Type names (model/object/tuple/enum/literal): updates declaration + all references
 *   across the schema group (field types, @model() args, extends, Record() args,
 *   tuple element types, literal variant refs)
 * - Field names: updates declaration + all @field() references within the same model
 *
 * Validates that renames are only allowed for user-defined symbols
 * (not primitives, keywords, or decorators).
 */

import { pathToFileURL } from 'node:url';

import type { Connection, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type {
  ASTDecorator,
  ASTField,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  SchemaAST,
} from '../../../../src/types';
import type { WorkspaceIndexer } from '../indexer';
import { findNodeAtPosition, findTypeDefinition, getWordRangeAtPosition } from '../utils/ast-location';
import { lspToCerial } from '../utils/position';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** LSP-compatible range (0-indexed line and character) */
interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

/** LSP-compatible text edit */
interface LspTextEdit {
  range: LspRange;
  newText: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primitive type names that cannot be renamed */
const PRIMITIVE_TYPES = new Set([
  'String',
  'Int',
  'Float',
  'Bool',
  'Date',
  'Email',
  'Record',
  'Relation',
  'Uuid',
  'Duration',
  'Decimal',
  'Bytes',
  'Geometry',
  'Any',
  'Number',
  'string',
  'int',
  'float',
  'bool',
  'date',
  'email',
  'record',
  'relation',
  'uuid',
  'duration',
  'decimal',
  'bytes',
  'geometry',
  'any',
  'number',
]);

/** Schema keywords that cannot be renamed */
const KEYWORDS = new Set(['model', 'object', 'tuple', 'enum', 'literal', 'abstract', 'extends', 'true', 'false']);

// ---------------------------------------------------------------------------
// Position / Range Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the byte offset in `source` for a given 0-indexed line and character.
 */
function computeOffset(source: string, line: number, character: number): number {
  let offset = 0;
  let currentLine = 0;

  for (let i = 0; i < source.length; i++) {
    if (currentLine === line) return offset + character;
    if (source[i] === '\n') {
      currentLine++;
      offset = i + 1;
    }
  }

  if (currentLine === line) return offset + character;

  return source.length;
}

/**
 * Convert a byte offset to a 0-indexed LSP position.
 */
function offsetToLspPosition(source: string, offset: number): { line: number; character: number } {
  let line = 0;
  let lineStart = 0;

  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }

  return { line, character: offset - lineStart };
}

/**
 * Compute the LSP range for a word at the given byte offset boundaries.
 */
function computeWordLspRange(source: string, wordStart: number, wordEnd: number): LspRange {
  let line = 0;
  let lineStart = 0;

  for (let i = 0; i < wordStart; i++) {
    if (source[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }

  return {
    start: { line, character: wordStart - lineStart },
    end: { line, character: wordEnd - lineStart },
  };
}

// ---------------------------------------------------------------------------
// Source Text Search Helpers
// ---------------------------------------------------------------------------

/**
 * Find ALL word-boundary occurrences of `name` within a byte-offset range in `source`.
 *
 * Performs word-boundary matching to avoid partial matches (e.g., "User" won't
 * match inside "UserProfile").
 */
function findAllNameRangesInSource(source: string, name: string, fromOffset: number, toOffset: number): LspRange[] {
  const ranges: LspRange[] = [];
  let searchIdx = fromOffset;

  while (searchIdx < toOffset) {
    const found = source.indexOf(name, searchIdx);
    if (found === -1 || found >= toOffset) break;
    if (found + name.length > toOffset) break;

    // Word boundary check
    const before = found > 0 ? source[found - 1] : '';
    const after = found + name.length < source.length ? source[found + name.length] : '';
    const isWordStart = !before || !/[a-zA-Z0-9_]/.test(before);
    const isWordEnd = !after || !/[a-zA-Z0-9_]/.test(after);

    if (isWordStart && isWordEnd) {
      const start = offsetToLspPosition(source, found);
      ranges.push({
        start,
        end: { line: start.line, character: start.character + name.length },
      });
    }

    searchIdx = found + 1;
  }

  return ranges;
}

/**
 * Find the first word-boundary occurrence of `name` within a byte-offset range.
 * Returns null if not found.
 */
function findNameRangeInSource(source: string, name: string, fromOffset: number, toOffset: number): LspRange | null {
  const ranges = findAllNameRangesInSource(source, name, fromOffset, toOffset);

  return ranges.length > 0 ? ranges[0]! : null;
}

/**
 * Find the end offset of the block header (up to the first '{').
 * Used to limit declaration/extends name search to the header line only.
 */
function headerEndOffset(source: string, blockStartOffset: number): number {
  const braceIdx = source.indexOf('{', blockStartOffset);

  return braceIdx !== -1 ? braceIdx : Math.min(blockStartOffset + 300, source.length);
}

// ---------------------------------------------------------------------------
// AST Helpers
// ---------------------------------------------------------------------------

/**
 * Check if a type name is defined in the given AST.
 */
function isTypeDefinedInAST(ast: SchemaAST, typeName: string): boolean {
  return (
    ast.models.some((m) => m.name === typeName) ||
    ast.objects.some((o) => o.name === typeName) ||
    ast.tuples.some((t) => t.name === typeName) ||
    ast.literals.some((l) => l.name === typeName) ||
    ast.enums.some((e) => e.name === typeName)
  );
}

/**
 * Check if a type name is defined anywhere in the schema group.
 */
function isTypeDefinedInGroup(allASTs: Map<string, SchemaAST>, typeName: string): boolean {
  for (const [, ast] of allASTs) {
    if (isTypeDefinedInAST(ast, typeName)) return true;
  }

  return false;
}

/**
 * Get the file content from the indexer for a given file path.
 */
function getFileContent(indexer: WorkspaceIndexer, filePath: string): string | null {
  return indexer.index.get(filePath)?.content ?? null;
}

/**
 * Find the model name that contains a field with the given name.
 */
function findContainingModelName(ast: SchemaAST, fieldName: string | undefined): string | null {
  if (!fieldName) return null;

  for (const model of ast.models) {
    if (model.fields.some((f) => f.name === fieldName)) return model.name;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Edit Map Helpers
// ---------------------------------------------------------------------------

/**
 * Add a TextEdit to the edits map, grouped by URI.
 */
function addEdit(edits: Map<string, LspTextEdit[]>, uri: string, range: LspRange, newName: string): void {
  let fileEdits = edits.get(uri);
  if (!fileEdits) {
    fileEdits = [];
    edits.set(uri, fileEdits);
  }
  fileEdits.push({ range, newText: newName });
}

// ---------------------------------------------------------------------------
// Type Rename — Sub-collectors
// ---------------------------------------------------------------------------

/**
 * Add edit for the declaration site of a type name (block header).
 */
function addDeclarationEdits(
  content: string,
  ast: SchemaAST,
  oldName: string,
  newName: string,
  uri: string,
  edits: Map<string, LspTextEdit[]>,
): void {
  const def = findTypeDefinition(ast, oldName);
  if (!def) return;

  const endOff = headerEndOffset(content, def.range.start.offset);
  const range = findNameRangeInSource(content, oldName, def.range.start.offset, endOff);
  if (range) {
    addEdit(edits, uri, range, newName);
  }
}

/**
 * Add edits for field type references and @model()/@field() decorator arguments.
 *
 * Scans both model and object fields for:
 * - objectName/tupleName/literalName matching the type
 * - @model(TypeName) decorator arguments
 * - Record(TypeName) ID type parameters
 */
function addFieldTypeEdits(
  content: string,
  blocks: readonly (ASTModel | ASTObject)[],
  oldName: string,
  newName: string,
  uri: string,
  edits: Map<string, LspTextEdit[]>,
): void {
  for (const block of blocks) {
    for (const field of block.fields) {
      // Field type reference (objectName, tupleName, literalName — enums use literalName)
      if (field.objectName === oldName || field.tupleName === oldName || field.literalName === oldName) {
        // Search after the field name to avoid matching the field name itself
        const searchFrom = field.range.start.offset + field.name.length;
        const range = findNameRangeInSource(content, oldName, searchFrom, field.range.end.offset);
        if (range) {
          addEdit(edits, uri, range, newName);
        }
      }

      for (const decorator of field.decorators) {
        // @model(TypeName) decorator
        if (decorator.type === 'model' && decorator.value === oldName) {
          const range = findNameRangeInSource(
            content,
            oldName,
            decorator.range.start.offset,
            decorator.range.end.offset,
          );
          if (range) {
            addEdit(edits, uri, range, newName);
          }
        }
      }

      // Record(TypeName) in recordIdTypes
      if (field.recordIdTypes?.includes(oldName)) {
        const searchFrom = field.range.start.offset + field.name.length;
        const range = findNameRangeInSource(content, oldName, searchFrom, field.range.end.offset);
        if (range) {
          addEdit(edits, uri, range, newName);
        }
      }
    }
  }
}

/**
 * Add edits for extends references on all block kinds.
 * Searches only the block header (before '{') to avoid matching body content.
 */
function addExtendsEdits(
  content: string,
  ast: SchemaAST,
  oldName: string,
  newName: string,
  uri: string,
  edits: Map<string, LspTextEdit[]>,
): void {
  const allBlocks = [...ast.models, ...ast.objects, ...ast.tuples, ...ast.literals, ...ast.enums];

  for (const block of allBlocks) {
    if (block.extends !== oldName) continue;

    const endOff = headerEndOffset(content, block.range.start.offset);
    const range = findNameRangeInSource(content, oldName, block.range.start.offset, endOff);
    if (range) {
      addEdit(edits, uri, range, newName);
    }
  }
}

/**
 * Add edits for tuple element type references.
 * Searches within the tuple body (after '{') for all occurrences.
 */
function addTupleElementEdits(
  content: string,
  tuples: readonly ASTTuple[],
  oldName: string,
  newName: string,
  uri: string,
  edits: Map<string, LspTextEdit[]>,
): void {
  for (const tuple of tuples) {
    const hasRef = tuple.elements.some(
      (e) => e.objectName === oldName || e.tupleName === oldName || e.literalName === oldName,
    );
    if (!hasRef) continue;

    // Search within the body (after '{') to avoid matching the tuple's own name
    const braceOffset = content.indexOf('{', tuple.range.start.offset);
    if (braceOffset === -1) continue;

    const ranges = findAllNameRangesInSource(content, oldName, braceOffset + 1, tuple.range.end.offset);
    for (const range of ranges) {
      addEdit(edits, uri, range, newName);
    }
  }
}

/**
 * Add edits for literal variant type references (objectRef, tupleRef, literalRef).
 * Searches within the literal body (after '{') for all occurrences.
 */
function addLiteralVariantEdits(
  content: string,
  literals: readonly ASTLiteral[],
  oldName: string,
  newName: string,
  uri: string,
  edits: Map<string, LspTextEdit[]>,
): void {
  for (const literal of literals) {
    const hasRef = literal.variants.some((v) => {
      if (v.kind === 'objectRef' && v.objectName === oldName) return true;
      if (v.kind === 'tupleRef' && v.tupleName === oldName) return true;
      if (v.kind === 'literalRef' && v.literalName === oldName) return true;

      return false;
    });
    if (!hasRef) continue;

    // Search within the body (after '{')
    const braceOffset = content.indexOf('{', literal.range.start.offset);
    if (braceOffset === -1) continue;

    const ranges = findAllNameRangesInSource(content, oldName, braceOffset + 1, literal.range.end.offset);
    for (const range of ranges) {
      addEdit(edits, uri, range, newName);
    }
  }
}

// ---------------------------------------------------------------------------
// Rename Edit Collectors
// ---------------------------------------------------------------------------

/**
 * Collect all TextEdits needed to rename a type across the schema group.
 *
 * Finds: declaration sites, field type references, @model() decorator arguments,
 * Record() ID type parameters, extends references, tuple element references,
 * and literal variant references.
 */
function collectTypeRenameEdits(
  oldName: string,
  newName: string,
  allASTs: Map<string, SchemaAST>,
  indexer: WorkspaceIndexer,
): Map<string, LspTextEdit[]> {
  const edits = new Map<string, LspTextEdit[]>();

  for (const [filePath, ast] of allASTs) {
    const content = getFileContent(indexer, filePath);
    if (!content) continue;

    const uri = pathToFileURL(filePath).toString();

    // 1. Declaration site (block header name)
    addDeclarationEdits(content, ast, oldName, newName, uri, edits);

    // 2. Field type references + @model() decorators + Record() params (models + objects)
    addFieldTypeEdits(content, [...ast.models, ...ast.objects], oldName, newName, uri, edits);

    // 3. extends references on all block kinds
    addExtendsEdits(content, ast, oldName, newName, uri, edits);

    // 4. Tuple element type references
    addTupleElementEdits(content, ast.tuples, oldName, newName, uri, edits);

    // 5. Literal variant type references
    addLiteralVariantEdits(content, ast.literals, oldName, newName, uri, edits);
  }

  return edits;
}

/**
 * Collect all TextEdits needed to rename a field within a model.
 *
 * Finds: the field declaration itself + all @field(oldName) decorator references
 * on other fields in the same model.
 */
function collectFieldRenameEdits(
  oldName: string,
  newName: string,
  blockName: string,
  blockKind: string,
  allASTs: Map<string, SchemaAST>,
  indexer: WorkspaceIndexer,
): Map<string, LspTextEdit[]> {
  const edits = new Map<string, LspTextEdit[]>();

  for (const [filePath, ast] of allASTs) {
    const content = getFileContent(indexer, filePath);
    if (!content) continue;

    const uri = pathToFileURL(filePath).toString();

    // Get the blocks to search based on kind
    const blocks: readonly (ASTModel | ASTObject)[] = blockKind === 'object' ? ast.objects : ast.models;

    for (const block of blocks) {
      if (block.name !== blockName) continue;

      for (const field of block.fields) {
        // Field declaration: rename the field name itself
        if (field.name === oldName) {
          const range = findNameRangeInSource(
            content,
            oldName,
            field.range.start.offset,
            field.range.start.offset + oldName.length + 1,
          );
          if (range) {
            addEdit(edits, uri, range, newName);
          }
        }

        // @field(oldName) decorator on other fields in the same model
        for (const decorator of field.decorators) {
          if (decorator.type === 'field' && decorator.value === oldName) {
            const range = findNameRangeInSource(
              content,
              oldName,
              decorator.range.start.offset,
              decorator.range.end.offset,
            );
            if (range) {
              addEdit(edits, uri, range, newName);
            }
          }
        }
      }
    }
  }

  return edits;
}

// ---------------------------------------------------------------------------
// Provider Registration
// ---------------------------------------------------------------------------

/**
 * Register the Rename Symbol provider on the LSP connection.
 *
 * Provides:
 * - `textDocument/prepareRename`: validates the symbol under cursor is renameable
 * - `textDocument/rename`: computes all edits across the schema group
 */
export function registerRenameProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  // ── Prepare Rename ────────────────────────────────────────────────────
  connection.onPrepareRename((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const source = doc.getText();
    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return null;

    const group = indexer.getSchemaGroup(params.textDocument.uri);
    if (!group) return null;

    const allASTs = indexer.getAllASTsInGroup(group.name);
    if (!allASTs.size) return null;

    // Extract word under cursor
    const offset = computeOffset(source, params.position.line, params.position.character);
    const wordRange = getWordRangeAtPosition(source, offset);
    if (!wordRange) return null;

    const { word, start: wordStart, end: wordEnd } = wordRange;

    // Reject non-renameable symbols
    if (PRIMITIVE_TYPES.has(word)) return null;
    if (KEYWORDS.has(word)) return null;
    if (word.startsWith('@') || word.startsWith('!')) return null;

    const lspRange = computeWordLspRange(source, wordStart, wordEnd);

    // Allow if it's a known type name in the schema group
    if (isTypeDefinedInGroup(allASTs, word)) {
      return { range: lspRange, placeholder: word };
    }

    // Allow if it's a field name
    const cerialPos = lspToCerial(params.position);
    const nodeInfo = findNodeAtPosition(ast, cerialPos);

    if (nodeInfo?.kind === 'field') {
      const field = nodeInfo.node as ASTField;
      if (word === field.name && nodeInfo.parent) {
        return { range: lspRange, placeholder: word };
      }
    }

    // Allow if cursor is on a @field() decorator value (references a field name)
    if (nodeInfo?.kind === 'decorator') {
      const decorator = nodeInfo.node as ASTDecorator;
      if (decorator.type === 'field' && typeof decorator.value === 'string' && decorator.value === word) {
        return { range: lspRange, placeholder: word };
      }
    }

    return null;
  });

  // ── Rename Request ────────────────────────────────────────────────────
  connection.onRenameRequest((params) => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const source = doc.getText();
    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return null;

    const group = indexer.getSchemaGroup(params.textDocument.uri);
    if (!group) return null;

    const allASTs = indexer.getAllASTsInGroup(group.name);
    if (!allASTs.size) return null;

    // Extract word under cursor
    const offset = computeOffset(source, params.position.line, params.position.character);
    const wordRange = getWordRangeAtPosition(source, offset);
    if (!wordRange) return null;

    const { word } = wordRange;
    const newName = params.newName;

    // Validate new name
    if (!newName || newName === word) return null;
    if (PRIMITIVE_TYPES.has(newName) || KEYWORDS.has(newName)) return null;
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) return null;

    const cerialPos = lspToCerial(params.position);
    const nodeInfo = findNodeAtPosition(ast, cerialPos);

    let edits: Map<string, LspTextEdit[]> | null = null;

    // ── Case 1: Decorator context ──
    if (nodeInfo?.kind === 'decorator') {
      const decorator = nodeInfo.node as ASTDecorator;

      if (decorator.type === 'model' && typeof decorator.value === 'string' && decorator.value === word) {
        // @model(TypeName) → type rename
        if (/^[a-z]/.test(newName)) return null; // Type names must start uppercase
        edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
      } else if (decorator.type === 'field' && typeof decorator.value === 'string' && decorator.value === word) {
        // @field(fieldName) → field rename
        const modelName = findContainingModelName(ast, nodeInfo.parent?.name);
        if (modelName) {
          edits = collectFieldRenameEdits(word, newName, modelName, 'model', allASTs, indexer);
        }
      }
    }

    // ── Case 2: Block name (declaration or extends) ──
    if (
      !edits &&
      nodeInfo &&
      (nodeInfo.kind === 'model' ||
        nodeInfo.kind === 'object' ||
        nodeInfo.kind === 'tuple' ||
        nodeInfo.kind === 'enum' ||
        nodeInfo.kind === 'literal')
    ) {
      // Cast is safe: all block types have name and extends
      const block = nodeInfo.node as ASTModel | ASTObject | ASTTuple | ASTLiteral;

      if (word === nodeInfo.name) {
        // Renaming the block's own name
        if (/^[a-z]/.test(newName)) return null; // Type names must start uppercase
        edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
      } else if (block.extends === word) {
        // Renaming the extends parent reference
        if (/^[a-z]/.test(newName)) return null;
        edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
      }
    }

    // ── Case 3: Field context ──
    if (!edits && nodeInfo?.kind === 'field') {
      const field = nodeInfo.node as ASTField;

      if (word === field.name && nodeInfo.parent) {
        // Renaming the field name
        edits = collectFieldRenameEdits(word, newName, nodeInfo.parent.name, nodeInfo.parent.kind, allASTs, indexer);
      } else {
        // Check if word matches a type reference on this field
        const refTypeName = field.objectName ?? field.tupleName ?? field.literalName;
        if (refTypeName && word === refTypeName) {
          if (/^[a-z]/.test(newName)) return null;
          edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
        }

        // Check @model decorator value
        if (!edits) {
          for (const dec of field.decorators) {
            if (dec.type === 'model' && dec.value === word) {
              if (/^[a-z]/.test(newName)) return null;
              edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
              break;
            }
          }
        }

        // Check Record(TypeName) parameter
        if (!edits && field.recordIdTypes?.includes(word)) {
          if (/^[a-z]/.test(newName)) return null;
          edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
        }
      }
    }

    // ── Case 4: Fallback — word is a known type name ──
    if (!edits && isTypeDefinedInGroup(allASTs, word)) {
      if (/^[a-z]/.test(newName)) return null;
      edits = collectTypeRenameEdits(word, newName, allASTs, indexer);
    }

    if (!edits || edits.size === 0) return null;

    // Build WorkspaceEdit
    const changes: Record<string, LspTextEdit[]> = {};
    for (const [uri, fileEdits] of edits) {
      changes[uri] = fileEdits;
    }

    return { changes };
  });
}
