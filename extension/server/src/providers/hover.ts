/**
 * Hover provider for .cerial files.
 *
 * Shows rich Markdown documentation when hovering over:
 * - Field types (String, Int, Record, etc.)
 * - Decorators (@default, @unique, @createdAt, etc.)
 * - Model/object/tuple/enum/literal names
 * - Field names (with type info, optionality, nullable status)
 */

import { type Connection, type Hover, MarkupKind, type TextDocuments } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ASTDecorator, ASTEnum, ASTField, ASTLiteral, ASTModel, ASTObject, ASTTuple } from '../../../../src/types';
import { DECORATOR_DOCS, FIELD_TYPE_DOCS } from '../data/hover-docs';
import type { WorkspaceIndexer } from '../indexer';
import { findNodeAtPosition, getWordRangeAtPosition } from '../utils/ast-location';
import { lspToCerial } from '../utils/position';

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
 * Capitalize the first letter of a field type for lookup in FIELD_TYPE_DOCS.
 * e.g. 'string' → 'String', 'record' → 'Record'
 */
function capitalizeType(type: string): string {
  if (!type.length) return type;

  return type[0]!.toUpperCase() + type.slice(1);
}

/**
 * Build a decorator signature string from an ASTField's decorators list.
 */
function formatFieldDecorators(decorators: ASTDecorator[]): string {
  return decorators
    .map((d) => {
      if (d.value !== undefined) return `@${d.type}(${String(d.value)})`;

      return `@${d.type}`;
    })
    .join(' ');
}

/**
 * Build a full field signature string: `name Type? @dec1 @dec2`
 */
function formatFieldSignature(field: ASTField): string {
  const parts: string[] = [];

  // Type name (capitalized)
  let typePart = capitalizeType(field.type);

  // Array suffix
  if (field.isArray) typePart += '[]';

  // Object/tuple/literal name hint
  if (field.objectName) typePart = field.objectName;
  if (field.tupleName) typePart = field.tupleName;
  if (field.literalName) typePart = field.literalName;
  if (field.isArray) {
    if (field.objectName) typePart = `${field.objectName}[]`;
    else if (field.tupleName) typePart = `${field.tupleName}[]`;
    else if (field.literalName) typePart = `${field.literalName}[]`;
  }

  // Record(Type) hint
  if (field.type === 'record' && field.recordIdTypes?.length) {
    typePart = `Record(${field.recordIdTypes.join(', ')})`;
    if (field.isArray) typePart += '[]';
  }

  // Optional marker
  if (field.isOptional) typePart += '?';

  parts.push(typePart);

  // Decorators
  const decoStr = formatFieldDecorators(field.decorators);
  if (decoStr) parts.push(decoStr);

  return parts.join(' ');
}

/**
 * Get the TypeScript type string for a field type (from FIELD_TYPE_DOCS).
 */
function getTsType(field: ASTField): string {
  if (field.objectName) return field.objectName;
  if (field.tupleName) return `${field.tupleName} (tuple)`;
  if (field.literalName) return `${field.literalName} (literal)`;

  const doc = FIELD_TYPE_DOCS[capitalizeType(field.type)];
  if (!doc) return field.type;

  let ts = doc.tsType;
  if (field.isArray) ts += '[]';

  return ts;
}

// ---------------------------------------------------------------------------
// Hover content builders
// ---------------------------------------------------------------------------

function buildFieldTypeHover(word: string): string | null {
  const doc = FIELD_TYPE_DOCS[word];
  if (!doc) return null;

  const lines = [
    `**${word}** — ${doc.description}`,
    '',
    '| TypeScript | SurrealDB |',
    '|---|---|',
    `| \`${doc.tsType}\` | \`${doc.surrealType}\` |`,
  ];

  return lines.join('\n');
}

function buildDecoratorHover(name: string): string | null {
  // Strip leading @ if present
  const key = name.startsWith('@') ? name.slice(1) : name;
  const doc = DECORATOR_DOCS[key];
  if (!doc) return null;

  const lines = [`**${doc.signature}**`, '', doc.description];

  if (doc.example) {
    lines.push('', '```cerial', doc.example, '```');
  }

  if (doc.constraints) {
    lines.push('', `*${doc.constraints}*`);
  }

  return lines.join('\n');
}

function buildBlockHover(kind: string, node: ASTModel | ASTObject | ASTTuple | ASTLiteral | ASTEnum): string {
  const lines: string[] = [];

  // Kind badge + name
  let kindLabel = kind;
  if (kind === 'model' && 'abstract' in node && node.abstract) {
    kindLabel = 'abstract model';
  }
  lines.push(`**${kindLabel}** \`${node.name}\``);

  // Extends info
  if ('extends' in node && node.extends) {
    lines.push('', `Extends: \`${node.extends}\``);
  }

  // Content details based on kind
  if (kind === 'model' || kind === 'object') {
    const block = node as ASTModel | ASTObject;
    const fieldCount = block.fields.length;
    const relationCount = kind === 'model' ? block.fields.filter((f) => f.type === 'relation').length : 0;

    const details = [`Fields: ${fieldCount}`];
    if (relationCount > 0) details.push(`Relations: ${relationCount}`);
    lines.push('', details.join(' | '));

    if (kind === 'model') {
      lines.push(`Table: \`${node.name}\``);
    }
  } else if (kind === 'tuple') {
    const tuple = node as ASTTuple;
    lines.push('', `Elements: ${tuple.elements.length}`);
  } else if (kind === 'enum') {
    const enumNode = node as ASTEnum;
    const preview = enumNode.values.slice(0, 5).join(', ');
    const suffix = enumNode.values.length > 5 ? `, ... (+${enumNode.values.length - 5})` : '';
    lines.push('', `Values: ${preview}${suffix}`);
  } else if (kind === 'literal') {
    const literal = node as ASTLiteral;
    lines.push('', `Variants: ${literal.variants.length}`);
  }

  return lines.join('\n');
}

function buildFieldHover(field: ASTField): string {
  const signature = formatFieldSignature(field);
  const tsType = getTsType(field);
  const isOptional = field.isOptional ? 'Yes' : 'No';
  const isNullable = field.isNullable ? 'Yes' : 'No';

  const lines = [
    `**${field.name}** \`${signature}\``,
    '',
    `TypeScript: \`${tsType}\``,
    `Optional: ${isOptional} | Nullable: ${isNullable}`,
  ];

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the hover provider on the LSP connection.
 *
 * Uses AST lookup to determine context at cursor position,
 * then returns appropriate Markdown documentation.
 */
export function registerHoverProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  indexer: WorkspaceIndexer,
): void {
  connection.onHover((params): Hover | null => {
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

    const { word } = wordRange;

    // Find AST node at position
    const nodeInfo = findNodeAtPosition(ast, cerialPos);

    // 1. Decorator hover — AST says we're on a decorator, or word matches @decorator
    if (nodeInfo?.kind === 'decorator') {
      const content = buildDecoratorHover(nodeInfo.name);
      if (content) {
        return { contents: { kind: MarkupKind.Markdown, value: content } };
      }
    }

    // Word starts with @ — try decorator lookup even if AST didn't pin it
    if (word.startsWith('@')) {
      const content = buildDecoratorHover(word);
      if (content) {
        return { contents: { kind: MarkupKind.Markdown, value: content } };
      }
    }

    // 2. Block name hover (model, object, tuple, enum, literal)
    if (
      nodeInfo &&
      (nodeInfo.kind === 'model' ||
        nodeInfo.kind === 'object' ||
        nodeInfo.kind === 'tuple' ||
        nodeInfo.kind === 'enum' ||
        nodeInfo.kind === 'literal')
    ) {
      // Only show block hover if the word matches the block name
      if (word === nodeInfo.name) {
        const content = buildBlockHover(
          nodeInfo.kind,
          nodeInfo.node as ASTModel | ASTObject | ASTTuple | ASTLiteral | ASTEnum,
        );

        return { contents: { kind: MarkupKind.Markdown, value: content } };
      }

      // Cursor is inside the block but on the keyword (e.g. "model")
      // — fall through to type check below
    }

    // 3. Field hover — show full field info
    if (nodeInfo?.kind === 'field') {
      const field = nodeInfo.node as ASTField;

      // If the word matches the field name, show field hover
      if (word === field.name) {
        const content = buildFieldHover(field);

        return { contents: { kind: MarkupKind.Markdown, value: content } };
      }

      // If the word matches a known field type, show type hover
      const typeDoc = FIELD_TYPE_DOCS[word];
      if (typeDoc) {
        const content = buildFieldTypeHover(word);
        if (content) {
          return { contents: { kind: MarkupKind.Markdown, value: content } };
        }
      }

      // If the word matches a referenced type name (objectName, tupleName, literalName),
      // look it up across the schema group
      const refName = field.objectName ?? field.tupleName ?? field.literalName;
      if (refName && word === refName) {
        const refHover = findTypeHoverInGroup(indexer, params.textDocument.uri, refName);
        if (refHover) {
          return { contents: { kind: MarkupKind.Markdown, value: refHover } };
        }
      }
    }

    // 4. Field type hover — word matches a known type name (outside field context too)
    const typeHover = buildFieldTypeHover(word);
    if (typeHover) {
      return { contents: { kind: MarkupKind.Markdown, value: typeHover } };
    }

    // 5. Cross-file type reference hover (word matches a type name in the schema group)
    const crossFileHover = findTypeHoverInGroup(indexer, params.textDocument.uri, word);
    if (crossFileHover) {
      return { contents: { kind: MarkupKind.Markdown, value: crossFileHover } };
    }

    return null;
  });
}

// ---------------------------------------------------------------------------
// Cross-file type lookup
// ---------------------------------------------------------------------------

/**
 * Search the schema group for a type definition by name and return hover content.
 */
function findTypeHoverInGroup(indexer: WorkspaceIndexer, uri: string, typeName: string): string | null {
  const group = indexer.getSchemaGroup(uri);
  if (!group) return null;

  const allASTs = indexer.getAllASTsInGroup(group.name);

  for (const [, fileAST] of allASTs) {
    for (const model of fileAST.models) {
      if (model.name === typeName) return buildBlockHover('model', model);
    }
    for (const obj of fileAST.objects) {
      if (obj.name === typeName) return buildBlockHover('object', obj);
    }
    for (const tuple of fileAST.tuples) {
      if (tuple.name === typeName) return buildBlockHover('tuple', tuple);
    }
    for (const literal of fileAST.literals) {
      if (literal.name === typeName) return buildBlockHover('literal', literal);
    }
    for (const enumDef of fileAST.enums) {
      if (enumDef.name === typeName) return buildBlockHover('enum', enumDef);
    }
  }

  return null;
}
