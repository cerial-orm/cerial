/**
 * Find References provider for .cerial files.
 *
 * Returns all reference locations for:
 * - Type names (model/object/tuple/enum/literal): field type refs, extends refs, @model() args, Record() args
 * - Field names: @field() references within the same model
 * - Decorator argument values: references to the named model/type
 *
 * Searches across all files in the same schema group.
 */

import { pathToFileURL } from 'node:url';

import type { Connection, Location, TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ASTField, ASTLiteral, ASTTuple, SchemaAST, SourceRange } from '../../../../src/types';
import type { WorkspaceIndexer } from '../indexer';
import { findNodeAtPosition, findTypeDefinition, getWordRangeAtPosition } from '../utils/ast-location';
import { cerialRangeToLsp, lspToCerial } from '../utils/position';

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

  if (currentLine === line) {
    return offset + character;
  }

  return source.length;
}

/**
 * Build a Location from a file path and source range.
 */
function makeLocation(filePath: string, range: SourceRange): Location {
  return {
    uri: pathToFileURL(filePath).toString(),
    range: cerialRangeToLsp(range),
  };
}

/**
 * Check if a block defines the given type name (searching all block kinds).
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

// ---------------------------------------------------------------------------
// Reference collectors
// ---------------------------------------------------------------------------

/**
 * Find all references to a type name across all files in the schema group.
 *
 * Searches for:
 * - Field type references (objectName, tupleName, literalName matching the type)
 * - Tuple element type references
 * - Literal variant references (objectRef, tupleRef, literalRef)
 * - Decorator @model() arguments matching the type
 * - Record() ID type parameters referencing the type (e.g., Record(MyObject))
 * - extends references on all block kinds
 */
function findTypeReferences(
  typeName: string,
  allASTs: Map<string, SchemaAST>,
  includeDeclaration: boolean,
): Location[] {
  const locations: Location[] = [];

  for (const [filePath, ast] of allASTs) {
    // Declaration site: the block definition header
    if (includeDeclaration) {
      const def = findTypeDefinition(ast, typeName);
      if (def) {
        locations.push(makeLocation(filePath, def.range));
      }
    }

    // Scan models
    for (const model of ast.models) {
      // extends reference
      if (model.extends === typeName) {
        locations.push(makeLocation(filePath, model.range));
      }

      collectFieldReferences(typeName, model.fields, filePath, locations);
    }

    // Scan objects
    for (const obj of ast.objects) {
      if (obj.extends === typeName) {
        locations.push(makeLocation(filePath, obj.range));
      }

      collectFieldReferences(typeName, obj.fields, filePath, locations);
    }

    // Scan tuples
    for (const tuple of ast.tuples) {
      if (tuple.extends === typeName) {
        locations.push(makeLocation(filePath, tuple.range));
      }

      collectTupleElementReferences(typeName, tuple, filePath, locations);
    }

    // Scan literals
    for (const literal of ast.literals) {
      if (literal.extends === typeName) {
        locations.push(makeLocation(filePath, literal.range));
      }

      collectLiteralVariantReferences(typeName, literal, filePath, locations);
    }

    // Scan enums
    for (const enumDef of ast.enums) {
      if (enumDef.extends === typeName) {
        locations.push(makeLocation(filePath, enumDef.range));
      }
    }
  }

  return locations;
}

/**
 * Collect references to `typeName` from a field list (model or object fields).
 */
function collectFieldReferences(
  typeName: string,
  fields: readonly ASTField[],
  filePath: string,
  locations: Location[],
): void {
  for (const field of fields) {
    // Object/tuple/literal type reference (enum fields also use literalName)
    if (field.objectName === typeName || field.tupleName === typeName || field.literalName === typeName) {
      locations.push(makeLocation(filePath, field.range));
      continue;
    }

    // @model(TypeName) decorator reference
    // @field(fieldName) — handled separately in findFieldNameReferences
    for (const decorator of field.decorators) {
      if (decorator.type === 'model' && decorator.value === typeName) {
        locations.push(makeLocation(filePath, decorator.range));
      }
    }

    // Record(TypeName) in recordIdTypes — e.g., Record(MyObject) or union Record(int, MyTuple)
    if (field.recordIdTypes?.includes(typeName)) {
      locations.push(makeLocation(filePath, field.range));
    }
  }
}

/**
 * Collect references to `typeName` from tuple elements.
 */
function collectTupleElementReferences(
  typeName: string,
  tuple: ASTTuple,
  filePath: string,
  locations: Location[],
): void {
  for (const element of tuple.elements) {
    if (element.objectName === typeName || element.tupleName === typeName || element.literalName === typeName) {
      // Tuple elements don't have individual SourceRanges — use the tuple's range
      locations.push(makeLocation(filePath, tuple.range));
      break; // One location per tuple is sufficient
    }
  }
}

/**
 * Collect references to `typeName` from literal variants.
 */
function collectLiteralVariantReferences(
  typeName: string,
  literal: ASTLiteral,
  filePath: string,
  locations: Location[],
): void {
  for (const variant of literal.variants) {
    if (
      (variant.kind === 'objectRef' && variant.objectName === typeName) ||
      (variant.kind === 'tupleRef' && variant.tupleName === typeName) ||
      (variant.kind === 'literalRef' && variant.literalName === typeName)
    ) {
      locations.push(makeLocation(filePath, literal.range));
      break; // One location per literal is sufficient
    }
  }
}

/**
 * Find all @field() references to a field name within the same model.
 *
 * When a user does "Find References" on a field name like `authorId`,
 * this finds `@field(authorId)` decorators on other fields in the same model.
 */
function findFieldNameReferences(
  fieldName: string,
  modelName: string,
  allASTs: Map<string, SchemaAST>,
  includeDeclaration: boolean,
  originFilePath: string,
  originFieldRange: SourceRange,
): Location[] {
  const locations: Location[] = [];

  // Include the field definition itself
  if (includeDeclaration) {
    locations.push(makeLocation(originFilePath, originFieldRange));
  }

  // Search for @field(fieldName) in the same model across all files
  for (const [filePath, ast] of allASTs) {
    for (const model of ast.models) {
      if (model.name !== modelName) continue;

      for (const field of model.fields) {
        // Skip the definition field itself (already added if includeDeclaration)
        if (field.name === fieldName) continue;

        for (const decorator of field.decorators) {
          if (decorator.type === 'field' && decorator.value === fieldName) {
            locations.push(makeLocation(filePath, decorator.range));
          }
        }
      }
    }
  }

  return locations;
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the Find References provider on the LSP connection.
 *
 * Determines what the user is referencing (type name, field name, or decorator argument),
 * then searches across the schema group for all matching references.
 */
export function registerReferencesProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onReferences((params): Location[] | null => {
    const doc = documents.get(params.textDocument.uri);
    if (!doc) return null;

    const source = doc.getText();
    const ast = indexer.getAST(params.textDocument.uri);
    if (!ast) return null;

    // Get schema group for cross-file search
    const group = indexer.getSchemaGroup(params.textDocument.uri);
    if (!group) return null;

    const allASTs = indexer.getAllASTsInGroup(group.name);
    if (!allASTs.size) return null;

    const includeDeclaration = params.context.includeDeclaration;

    // Convert LSP position to cerial position for AST lookup
    const cerialPos = lspToCerial(params.position);

    // Compute byte offset for word extraction
    const offset = computeOffset(source, params.position.line, params.position.character);
    const wordRange = getWordRangeAtPosition(source, offset);
    if (!wordRange) return null;

    const { word } = wordRange;

    // Find AST node at cursor position
    const nodeInfo = findNodeAtPosition(ast, cerialPos);
    if (!nodeInfo) return null;

    // ── Case 1: Cursor is on a decorator — check if its value is a type reference ──
    if (nodeInfo.kind === 'decorator') {
      const decorator = nodeInfo.node as import('../../../../src/types').ASTDecorator;

      // @model(TypeName) — find all references to that model/type
      if (decorator.type === 'model' && typeof decorator.value === 'string') {
        return findTypeReferences(decorator.value, allASTs, includeDeclaration);
      }

      // @field(fieldName) — find the field definition and other @field() refs in the same model
      if (decorator.type === 'field' && typeof decorator.value === 'string' && nodeInfo.parent) {
        // We need to find the model this field belongs to
        const modelName = findParentModelName(ast, nodeInfo.parent.name);
        if (modelName) {
          // Find the referenced field's range
          const referencedField = findFieldInModel(ast, modelName, decorator.value as string);
          if (referencedField) {
            return findFieldNameReferences(
              decorator.value as string,
              modelName,
              allASTs,
              includeDeclaration,
              getFilePathForAST(allASTs, ast),
              referencedField.range,
            );
          }
        }
      }

      return null;
    }

    // ── Case 2: Cursor is on a block name (model/object/tuple/enum/literal) ──
    if (
      nodeInfo.kind === 'model' ||
      nodeInfo.kind === 'object' ||
      nodeInfo.kind === 'tuple' ||
      nodeInfo.kind === 'enum' ||
      nodeInfo.kind === 'literal'
    ) {
      if (word === nodeInfo.name) {
        return findTypeReferences(word, allASTs, includeDeclaration);
      }
    }

    // ── Case 3: Cursor is on a field ──
    if (nodeInfo.kind === 'field') {
      const field = nodeInfo.node as ASTField;

      // If the word matches the field name, find @field() references
      if (word === field.name && nodeInfo.parent) {
        const modelName = nodeInfo.parent.name;
        const currentFilePath = getFilePathForAST(allASTs, ast);

        return findFieldNameReferences(word, modelName, allASTs, includeDeclaration, currentFilePath, field.range);
      }

      // If the word matches a referenced type (objectName, tupleName, literalName)
      const refTypeName = field.objectName ?? field.tupleName ?? field.literalName;
      if (refTypeName && word === refTypeName) {
        return findTypeReferences(refTypeName, allASTs, includeDeclaration);
      }

      // If the word matches a model name referenced via @model decorator
      for (const decorator of field.decorators) {
        if (decorator.type === 'model' && decorator.value === word) {
          return findTypeReferences(word, allASTs, includeDeclaration);
        }
      }

      // If the word matches a Record() type parameter
      if (field.recordIdTypes?.includes(word)) {
        // Check if the word is a known type name (not a primitive like int/string)
        for (const [, fileAST] of allASTs) {
          if (isTypeDefinedInAST(fileAST, word)) {
            return findTypeReferences(word, allASTs, includeDeclaration);
          }
        }
      }
    }

    // ── Case 4: Word matches a type name in the schema group (fallback) ──
    for (const [, fileAST] of allASTs) {
      if (isTypeDefinedInAST(fileAST, word)) {
        return findTypeReferences(word, allASTs, includeDeclaration);
      }
    }

    return null;
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the model name that contains a field with the given name.
 * Used to resolve the parent model for @field() decorator references.
 */
function findParentModelName(ast: SchemaAST, fieldName: string): string | null {
  for (const model of ast.models) {
    if (model.fields.some((f) => f.name === fieldName)) {
      return model.name;
    }
  }

  return null;
}

/**
 * Find a field within a specific model by name.
 */
function findFieldInModel(ast: SchemaAST, modelName: string, fieldName: string): ASTField | null {
  for (const model of ast.models) {
    if (model.name !== modelName) continue;
    const field = model.fields.find((f) => f.name === fieldName);
    if (field) return field;
  }

  return null;
}

/**
 * Find the file path key for a given AST in the allASTs map.
 * Needed to construct Location URIs for the current file.
 */
function getFilePathForAST(allASTs: Map<string, SchemaAST>, targetAST: SchemaAST): string {
  for (const [filePath, ast] of allASTs) {
    if (ast === targetAST) return filePath;
  }

  // Fallback: shouldn't happen, but return empty to avoid crash
  return '';
}
