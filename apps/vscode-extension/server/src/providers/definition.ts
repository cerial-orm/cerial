/**
 * Go-to-Definition provider for .cerial files.
 *
 * Supports Ctrl+Click / F12 navigation to:
 * - Type references (field type position): `address Address` → Address definition
 * - Model references (`@model(User)`): → User model definition
 * - Field references (`@field(authorId)`): → authorId field in current model
 * - Extends references (`extends BaseModel`): → BaseModel definition
 * - Record type refs (`Record(MyTuple)`): → MyTuple definition
 *
 * Searches current file first, then all files in the same schema group.
 * Returns null for primitive types and self-definitions.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';

import type { Connection, DefinitionLink, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ASTField, ASTModel, ASTObject, SchemaAST } from '../../../../orm/src/types';
import type { WorkspaceIndexer } from '../indexer';
import { findNodeAtPosition, findTypeDefinition, getWordRangeAtPosition } from '../utils/ast-location';
import { cerialRangeToLsp, lspToCerial } from '../utils/position';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Primitive type names that have no navigable definition */
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
  // Lowercase variants (as stored in AST field.type)
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the byte offset in `source` for a given 0-indexed line and character.
 */
function computeOffset(source: string, line: number, character: number): number {
  let offset = 0;
  let currentLine = 0;

  for (let i = 0; i < source.length; i++) {
    if (currentLine === line) {
      return offset + character;
    }
    if (source[i] === '\n') {
      currentLine++;
      offset = i + 1;
    }
  }

  // Cursor is on the last line
  if (currentLine === line) {
    return offset + character;
  }

  return source.length;
}

/**
 * Build an LSP DefinitionLink from a type definition found in a file.
 */
function buildDefinitionLink(
  filePath: string,
  targetRange: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  },
  originSelectionRange: { start: { line: number; character: number }; end: { line: number; character: number } },
): DefinitionLink {
  const lspRange = cerialRangeToLsp(targetRange);

  return {
    targetUri: pathToFileURL(filePath).toString(),
    targetRange: lspRange,
    targetSelectionRange: lspRange,
    originSelectionRange,
  };
}

/**
 * Compute the LSP range for a word at the given byte offset boundaries.
 */
function computeWordLspRange(
  source: string,
  wordStart: number,
  wordEnd: number,
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  let line = 0;
  let lineStart = 0;

  for (let i = 0; i < wordStart; i++) {
    if (source[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }

  const startChar = wordStart - lineStart;
  const endChar = wordEnd - lineStart;

  return {
    start: { line, character: startChar },
    end: { line, character: endChar },
  };
}

/**
 * Search for a type definition across all files in a schema group.
 * Returns the file path and definition result, or null.
 */
function findDefinitionInGroup(
  indexer: WorkspaceIndexer,
  uri: string,
  typeName: string,
): {
  filePath: string;
  kind: string;
  range: {
    start: { line: number; column: number; offset: number };
    end: { line: number; column: number; offset: number };
  };
} | null {
  const group = indexer.getSchemaGroup(uri);
  if (!group) return null;

  const currentFilePath = filePathFromUri(uri);
  const allASTs = indexer.getAllASTsInGroup(group.name);

  // Priority 1: Search the current file first
  const currentAST = allASTs.get(currentFilePath);
  if (currentAST) {
    const result = findTypeDefinition(currentAST, typeName);
    if (result) {
      return { filePath: currentFilePath, kind: result.kind, range: result.range };
    }
  }

  // Priority 2: Search other files in the group
  for (const [filePath, fileAST] of allASTs) {
    if (filePath === currentFilePath) continue;
    const result = findTypeDefinition(fileAST, typeName);
    if (result) {
      return { filePath, kind: result.kind, range: result.range };
    }
  }

  return null;
}

/**
 * Find a field definition within a model or object in the current file AST.
 */
function findFieldInBlock(ast: SchemaAST, blockName: string, fieldName: string): ASTField | null {
  for (const model of ast.models) {
    if (model.name !== blockName) continue;
    const field = model.fields.find((f) => f.name === fieldName);
    if (field) return field;
  }

  for (const obj of ast.objects) {
    if (obj.name !== blockName) continue;
    const field = obj.fields.find((f) => f.name === fieldName);
    if (field) return field;
  }

  return null;
}

/**
 * Check if the word under cursor is the name at the declaration site of a block.
 * If so, the user is on the definition itself — return true to suppress navigation.
 */
function isAtDeclarationName(ast: SchemaAST, word: string, cerialLine: number): boolean {
  const blocks: ReadonlyArray<
    | ASTModel
    | ASTObject
    | {
        name: string;
        range: {
          start: { line: number; column: number; offset: number };
          end: { line: number; column: number; offset: number };
        };
      }
  > = [...ast.models, ...ast.objects, ...ast.tuples, ...ast.enums, ...ast.literals];

  for (const block of blocks) {
    if (block.name !== word) continue;

    // The block name is on the same line as range.start (e.g., "model User {")
    // The name follows the keyword, so it's on the start line.
    if (cerialLine === block.range.start.line) {
      return true;
    }
  }

  return false;
}

/**
 * Extract the type reference name from a field.
 * Returns the object/tuple/literal/enum name if the field references a custom type.
 */
function getFieldTypeRefName(field: ASTField): string | null {
  return field.objectName ?? field.tupleName ?? field.literalName ?? null;
}

/**
 * Get the model name from a @model decorator on a field.
 */
function getModelDecoratorValue(field: ASTField): string | null {
  const modelDec = field.decorators.find((d) => d.type === 'model');
  if (modelDec?.value && typeof modelDec.value === 'string') {
    return modelDec.value;
  }

  return null;
}

/**
 * Get the field name from a @field decorator on a field.
 */
function getFieldDecoratorValue(field: ASTField): string | null {
  const fieldDec = field.decorators.find((d) => d.type === 'field');
  if (fieldDec?.value && typeof fieldDec.value === 'string') {
    return fieldDec.value;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the Go-to-Definition provider on the LSP connection.
 *
 * Supports navigation to type definitions, model references, field references,
 * extends parents, and Record() type parameters.
 */
export function registerDefinitionProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onDefinition((params): DefinitionLink[] | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const source = doc.getText();
    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return null;

    // Convert LSP position to cerial position for AST lookup
    const cerialPos = lspToCerial(params.position);

    // Compute byte offset for word extraction
    const offset = computeOffset(source, params.position.line, params.position.character);
    const wordRange = getWordRangeAtPosition(source, offset);
    if (!wordRange) return null;

    const { word, start: wordStart, end: wordEnd } = wordRange;

    // Skip primitive types
    if (PRIMITIVE_TYPES.has(word)) return null;

    // Compute origin selection range (the word under cursor)
    const originRange = computeWordLspRange(source, wordStart, wordEnd);

    // Skip self-definitions (cursor is on the declaration name itself)
    if (isAtDeclarationName(ast, word, cerialPos.line)) return null;

    // Find AST node at position for context-aware navigation
    const nodeInfo = findNodeAtPosition(ast, cerialPos);

    // 1. Decorator context — handle @model(Name) and @field(name)
    if (nodeInfo?.kind === 'decorator') {
      const decoratorName = nodeInfo.name;

      if (decoratorName === 'model') {
        // @model(User) — navigate to User model
        const result = findDefinitionInGroup(indexer, params.textDocument.uri, word);
        if (result) {
          return [buildDefinitionLink(result.filePath, result.range, originRange)];
        }
      }

      if (decoratorName === 'field' && nodeInfo.parent) {
        // @field(authorId) — navigate to the field in the current model
        // Find the parent model/object that contains this field
        const parentName = nodeInfo.parent.name;

        // The @field decorator is on a field that's inside a model/object.
        // We need the grandparent block. The parent is the field, so we need
        // the block containing that field.
        // nodeInfo.parent for a decorator is { kind: 'field', name: fieldName }
        // We need to find which model contains this field.
        const fieldWithDecorator = findFieldInCurrentFileByName(ast, parentName);
        if (fieldWithDecorator) {
          // Find the model containing this field
          const containingBlock = findContainingBlock(ast, parentName);
          if (containingBlock) {
            const targetField = findFieldInBlock(ast, containingBlock.name, word);
            if (targetField) {
              return [buildDefinitionLink(filePathFromUri(params.textDocument.uri), targetField.range, originRange)];
            }
          }
        }
      }
    }

    // 2. Field context — handle type references, @model, @field on the field
    if (nodeInfo?.kind === 'field') {
      const field = nodeInfo.node as ASTField;

      // If word matches a type reference name on this field
      const typeRefName = getFieldTypeRefName(field);
      if (typeRefName && word === typeRefName) {
        const result = findDefinitionInGroup(indexer, params.textDocument.uri, typeRefName);
        if (result) {
          return [buildDefinitionLink(result.filePath, result.range, originRange)];
        }
      }

      // If word matches @model(value) on this field
      const modelName = getModelDecoratorValue(field);
      if (modelName && word === modelName) {
        const result = findDefinitionInGroup(indexer, params.textDocument.uri, modelName);
        if (result) {
          return [buildDefinitionLink(result.filePath, result.range, originRange)];
        }
      }

      // If word matches @field(value) — navigate to field in parent block
      const fieldRefName = getFieldDecoratorValue(field);
      if (fieldRefName && word === fieldRefName && nodeInfo.parent) {
        const parentBlockName = nodeInfo.parent.name;
        const targetField = findFieldInBlock(ast, parentBlockName, fieldRefName);
        if (targetField) {
          return [buildDefinitionLink(filePathFromUri(params.textDocument.uri), targetField.range, originRange)];
        }
      }

      // If word matches a Record(Type) parameter
      if (field.recordIdTypes?.length) {
        for (const idType of field.recordIdTypes) {
          if (word === idType && !PRIMITIVE_TYPES.has(word)) {
            const result = findDefinitionInGroup(indexer, params.textDocument.uri, idType);
            if (result) {
              return [buildDefinitionLink(result.filePath, result.range, originRange)];
            }
          }
        }
      }
    }

    // 3. Block context — handle extends reference
    if (
      nodeInfo &&
      (nodeInfo.kind === 'model' ||
        nodeInfo.kind === 'object' ||
        nodeInfo.kind === 'tuple' ||
        nodeInfo.kind === 'enum' ||
        nodeInfo.kind === 'literal')
    ) {
      const block = nodeInfo.node as ASTModel | ASTObject;
      if ('extends' in block && block.extends && word === block.extends) {
        const result = findDefinitionInGroup(indexer, params.textDocument.uri, block.extends);
        if (result) {
          return [buildDefinitionLink(result.filePath, result.range, originRange)];
        }
      }
    }

    // 4. Fallback — try to find any type definition matching the word in the schema group
    const result = findDefinitionInGroup(indexer, params.textDocument.uri, word);
    if (result) {
      return [buildDefinitionLink(result.filePath, result.range, originRange)];
    }

    return null;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a `file://` URI to a normalized file path.
 */
function filePathFromUri(uri: string): string {
  return fileURLToPath(uri);
}

/**
 * Find a field anywhere in the current file AST by field name.
 */
function findFieldInCurrentFileByName(ast: SchemaAST, fieldName: string): ASTField | null {
  for (const model of ast.models) {
    const field = model.fields.find((f) => f.name === fieldName);
    if (field) return field;
  }
  for (const obj of ast.objects) {
    const field = obj.fields.find((f) => f.name === fieldName);
    if (field) return field;
  }

  return null;
}

/**
 * Find the block (model/object) that contains a field with the given name.
 */
function findContainingBlock(ast: SchemaAST, fieldName: string): ASTModel | ASTObject | null {
  for (const model of ast.models) {
    if (model.fields.some((f) => f.name === fieldName)) return model;
  }
  for (const obj of ast.objects) {
    if (obj.fields.some((f) => f.name === fieldName)) return obj;
  }

  return null;
}
