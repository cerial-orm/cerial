/**
 * AST location utilities for the cerial language server.
 *
 * Provides functions to find AST nodes at a given position,
 * determine cursor context, and support hover/goto/completion features.
 */

import type {
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTModel,
  ASTObject,
  ASTTuple,
  SchemaAST,
  SourcePosition,
  SourceRange,
} from '../../../../orm/src/types';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/** Block kinds in the AST */
export type BlockKind = 'model' | 'object' | 'tuple' | 'enum' | 'literal';

/** Node kinds that can be located */
export type NodeKind = BlockKind | 'field' | 'decorator';

/** Information about an AST node at a given position */
export interface ASTNodeInfo {
  kind: NodeKind;
  name: string;
  node: ASTModel | ASTObject | ASTTuple | ASTLiteral | ASTEnum | ASTField | ASTDecorator;
  parent?: { kind: string; name: string };
}

/** Cursor context within a block */
export interface BlockContext {
  blockType: BlockKind | null;
  blockName: string | null;
  fieldContext: 'name' | 'type' | 'decorator' | null;
}

/** Result of a type-definition lookup */
export interface TypeDefinitionResult {
  kind: string;
  node: ASTModel | ASTObject | ASTTuple | ASTLiteral | ASTEnum;
  range: SourceRange;
}

/** Word extracted at a byte offset */
export interface WordRange {
  word: string;
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Check whether `pos` falls inside `range` (inclusive on both endpoints).
 *
 * Compares by line/column because LSP-converted positions have `offset: 0`.
 */
function isPositionInRange(pos: SourcePosition, range: SourceRange): boolean {
  const { start, end } = range;

  // Before the range start
  if (pos.line < start.line) return false;
  if (pos.line === start.line && pos.column < start.column) return false;

  // After the range end
  if (pos.line > end.line) return false;
  if (pos.line === end.line && pos.column > end.column) return false;

  return true;
}

/**
 * Discriminated union for iterating all AST block types uniformly.
 * The `kind` tag enables proper narrowing without `as any`.
 */
type BlockEntry =
  | { kind: 'model'; block: ASTModel }
  | { kind: 'object'; block: ASTObject }
  | { kind: 'tuple'; block: ASTTuple }
  | { kind: 'enum'; block: ASTEnum }
  | { kind: 'literal'; block: ASTLiteral };

/** Yield every block in the AST with its kind tag. */
function* allBlocks(ast: SchemaAST): Generator<BlockEntry> {
  for (const m of ast.models) yield { kind: 'model', block: m };
  for (const o of ast.objects) yield { kind: 'object', block: o };
  for (const t of ast.tuples) yield { kind: 'tuple', block: t };
  for (const e of ast.enums) yield { kind: 'enum', block: e };
  for (const l of ast.literals) yield { kind: 'literal', block: l };
}

/**
 * Return the fields array for blocks that have them (model, object).
 * Tuples, enums, and literals have different sub-structures without
 * per-element `SourceRange`, so we return an empty array for those.
 */
function getBlockFields(entry: BlockEntry): readonly ASTField[] {
  if (entry.kind === 'model' || entry.kind === 'object') {
    return entry.block.fields;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Find the most specific AST node at `pos`.
 *
 * Resolution order: block → field → decorator (most specific wins).
 * Returns `null` when the position is outside every block or the AST is empty.
 */
export function findNodeAtPosition(ast: SchemaAST, pos: SourcePosition): ASTNodeInfo | null {
  for (const entry of allBlocks(ast)) {
    if (!isPositionInRange(pos, entry.block.range)) continue;

    // Models and objects: narrow to field, then decorator
    const fields = getBlockFields(entry);
    for (const field of fields) {
      if (!isPositionInRange(pos, field.range)) continue;

      for (const decorator of field.decorators) {
        if (isPositionInRange(pos, decorator.range)) {
          return {
            kind: 'decorator',
            name: decorator.type,
            node: decorator,
            parent: { kind: 'field', name: field.name },
          };
        }
      }

      return {
        kind: 'field',
        name: field.name,
        node: field,
        parent: { kind: entry.kind, name: entry.block.name },
      };
    }

    // Position is inside the block but not on a specific field
    return {
      kind: entry.kind,
      name: entry.block.name,
      node: entry.block,
    };
  }

  return null;
}

/**
 * Find a field by its parent block name and field name.
 *
 * Searches models and objects (the only block types with `ASTField[]`).
 * Returns `null` when the block or field is not found.
 */
export function findFieldByName(ast: SchemaAST, blockName: string, fieldName: string): ASTField | null {
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
 * Look up a type definition by name across every block kind.
 *
 * Returns the matched block node and its source range, or `null`
 * if no definition with `typeName` exists in the AST.
 */
export function findTypeDefinition(ast: SchemaAST, typeName: string): TypeDefinitionResult | null {
  for (const entry of allBlocks(ast)) {
    if (entry.block.name !== typeName) continue;

    return {
      kind: entry.kind,
      node: entry.block,
      range: entry.block.range,
    };
  }

  return null;
}

/**
 * Extract the word under the cursor at `offset` in the source string.
 *
 * Word characters: `[a-zA-Z0-9_@!]` — includes `@` for decorator names
 * and `!` for the `!!private` marker.
 *
 * Returns `null` when `offset` is out of bounds or sits on a non-word char.
 */
export function getWordRangeAtPosition(source: string, offset: number): WordRange | null {
  if (offset < 0 || offset >= source.length) return null;

  const isWordChar = (ch: string): boolean => /[a-zA-Z0-9_@!]/.test(ch);

  if (!isWordChar(source[offset])) return null;

  // Scan backward to the first non-word character
  let start = offset;
  while (start > 0 && isWordChar(source[start - 1])) {
    start--;
  }

  // Scan forward to the first non-word character
  let end = offset;
  while (end < source.length && isWordChar(source[end])) {
    end++;
  }

  const word = source.slice(start, end);
  if (!word.length) return null;

  return { word, start, end };
}

/**
 * Check whether `pos` falls inside any block body.
 */
export function isInsideBlock(ast: SchemaAST, pos: SourcePosition): boolean {
  for (const entry of allBlocks(ast)) {
    if (isPositionInRange(pos, entry.block.range)) return true;
  }

  return false;
}

/**
 * Determine the cursor context at a given position.
 *
 * - Outside all blocks → `{ blockType: null, blockName: null, fieldContext: null }`
 * - Inside a block, not on a field → `{ blockType, blockName, fieldContext: null }`
 * - On a field line → `fieldContext` is one of `'name'`, `'type'`, or `'decorator'`
 *
 * The name/type/decorator distinction uses a simple heuristic:
 * if the cursor column is within the field-name span → `'name'`;
 * if on a decorator range → `'decorator'`; otherwise → `'type'`.
 */
export function getBlockContext(ast: SchemaAST, pos: SourcePosition): BlockContext {
  const nullContext: BlockContext = { blockType: null, blockName: null, fieldContext: null };

  for (const entry of allBlocks(ast)) {
    if (!isPositionInRange(pos, entry.block.range)) continue;

    const fields = getBlockFields(entry);
    for (const field of fields) {
      if (!isPositionInRange(pos, field.range)) continue;

      // Check decorators first (most specific)
      for (const decorator of field.decorators) {
        if (isPositionInRange(pos, decorator.range)) {
          return { blockType: entry.kind, blockName: entry.block.name, fieldContext: 'decorator' };
        }
      }

      // Heuristic: cursor within [field.start.column .. start.column + name.length)
      // on the same line as the field start → field name position
      if (
        pos.line === field.range.start.line &&
        pos.column >= field.range.start.column &&
        pos.column < field.range.start.column + field.name.length
      ) {
        return { blockType: entry.kind, blockName: entry.block.name, fieldContext: 'name' };
      }

      // Default: cursor is in the type portion of the field line
      return { blockType: entry.kind, blockName: entry.block.name, fieldContext: 'type' };
    }

    // Inside block body but not on any field line
    return { blockType: entry.kind, blockName: entry.block.name, fieldContext: null };
  }

  return nullContext;
}
