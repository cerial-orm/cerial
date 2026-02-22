/**
 * Completion provider for .cerial files.
 *
 * Offers context-aware completions:
 * - Top-level: block keywords (model, object, tuple, enum, literal, abstract model)
 * - Field type position: 15 primitive types + array variants + user-defined types (cross-file)
 * - Inside Record(): ID types (int, float, number, string, uuid) + object/tuple refs
 * - After extends: same-kind type names from current file + cross-file ASTs
 * - @model() argument: model names from same schema group
 * - @field() argument: Record-type field names from current model
 * - Decorator position: context-filtered decorators with conflict exclusion and snippets
 */

import * as path from 'node:path';

import {
  type CompletionItem,
  CompletionItemKind,
  type Connection,
  InsertTextFormat,
  type TextDocuments,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { SchemaAST } from '../../../../src/types';
import type { WorkspaceIndexer } from '../indexer';
import { type BlockContext, findFieldByName, findNodeAtPosition, getBlockContext } from '../utils/ast-location';
import { lspToCerial } from '../utils/position';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback to retrieve the current AST for a document URI. */
export type GetASTCallback = (uri: string) => SchemaAST | null;

// ---------------------------------------------------------------------------
// Primitive type definitions
// ---------------------------------------------------------------------------

interface PrimitiveTypeInfo {
  label: string;
  detail: string;
}

const PRIMITIVE_TYPES: readonly PrimitiveTypeInfo[] = [
  { label: 'String', detail: 'string (SurrealDB: string)' },
  { label: 'Int', detail: 'number (SurrealDB: int)' },
  { label: 'Float', detail: 'number (SurrealDB: float)' },
  { label: 'Bool', detail: 'boolean (SurrealDB: bool)' },
  { label: 'Date', detail: 'Date (SurrealDB: datetime)' },
  { label: 'Email', detail: 'string (SurrealDB: string, validated)' },
  { label: 'Record', detail: 'CerialId (SurrealDB: record)' },
  { label: 'Relation', detail: 'virtual relation field' },
  { label: 'Uuid', detail: 'CerialUuid (SurrealDB: uuid)' },
  { label: 'Duration', detail: 'CerialDuration (SurrealDB: duration)' },
  { label: 'Decimal', detail: 'CerialDecimal (SurrealDB: decimal)' },
  { label: 'Bytes', detail: 'CerialBytes (SurrealDB: bytes)' },
  { label: 'Geometry', detail: 'CerialGeometry (SurrealDB: geometry)' },
  { label: 'Any', detail: 'CerialAny (SurrealDB: any)' },
  { label: 'Number', detail: 'number (SurrealDB: number, auto-detect)' },
] as const;

/** ID types valid inside Record() parentheses. */
const RECORD_ID_TYPES: readonly string[] = ['int', 'float', 'number', 'string', 'uuid'];

// ---------------------------------------------------------------------------
// Decorator definitions
// ---------------------------------------------------------------------------

/** Definition of a field-level decorator for completion. */
interface DecoratorDef {
  /** Decorator type name (matches SchemaDecorator, e.g. 'id', 'default') */
  type: string;
  /** Display label in completion list (e.g. '@id', '@default()') */
  label: string;
  /** Insert text — includes @ prefix, may use snippet syntax */
  insertText: string;
  /** Whether insertText uses snippet format */
  isSnippet: boolean;
  /** Short description */
  detail: string;
}

const FIELD_DECORATOR_DEFS: readonly DecoratorDef[] = [
  // Identity & constraints
  { type: 'id', label: '@id', insertText: '@id', isSnippet: false, detail: 'Primary key field' },
  { type: 'unique', label: '@unique', insertText: '@unique', isSnippet: false, detail: 'Unique constraint' },
  { type: 'index', label: '@index', insertText: '@index', isSnippet: false, detail: 'Index on field' },
  // Defaults & timestamps
  {
    type: 'default',
    label: '@default()',
    insertText: '@default(${1:value})',
    isSnippet: true,
    detail: 'Default value',
  },
  {
    type: 'defaultAlways',
    label: '@defaultAlways()',
    insertText: '@defaultAlways(${1:value})',
    isSnippet: true,
    detail: 'Default value (reset on every write)',
  },
  {
    type: 'createdAt',
    label: '@createdAt',
    insertText: '@createdAt',
    isSnippet: false,
    detail: 'Set to current time on creation',
  },
  {
    type: 'updatedAt',
    label: '@updatedAt',
    insertText: '@updatedAt',
    isSnippet: false,
    detail: 'Set to current time on every update',
  },
  {
    type: 'now',
    label: '@now',
    insertText: '@now',
    isSnippet: false,
    detail: 'Computed time::now() (model fields only)',
  },
  // Modifiers
  { type: 'nullable', label: '@nullable', insertText: '@nullable', isSnippet: false, detail: 'Field can hold null' },
  {
    type: 'readonly',
    label: '@readonly',
    insertText: '@readonly',
    isSnippet: false,
    detail: 'Write-once (immutable after create)',
  },
  {
    type: 'flexible',
    label: '@flexible',
    insertText: '@flexible',
    isSnippet: false,
    detail: 'Allow extra keys on object field',
  },
  // Array modifiers
  { type: 'set', label: '@set', insertText: '@set', isSnippet: false, detail: 'Auto-deduplicated sorted array' },
  {
    type: 'distinct',
    label: '@distinct',
    insertText: '@distinct',
    isSnippet: false,
    detail: 'Deduplicate array elements',
  },
  {
    type: 'sort',
    label: '@sort()',
    insertText: '@sort(${1|asc,desc|})',
    isSnippet: true,
    detail: 'Sort array elements',
  },
  // Relations (model fields only)
  {
    type: 'field',
    label: '@field()',
    insertText: '@field(${1:fieldName})',
    isSnippet: true,
    detail: 'FK field name for forward relation',
  },
  {
    type: 'model',
    label: '@model()',
    insertText: '@model(${1:ModelName})',
    isSnippet: true,
    detail: 'Target model for relation',
  },
  {
    type: 'onDelete',
    label: '@onDelete()',
    insertText: '@onDelete(${1|Cascade,SetNull,SetNone,Restrict,NoAction|})',
    isSnippet: true,
    detail: 'Delete behavior for optional relation',
  },
  {
    type: 'key',
    label: '@key()',
    insertText: '@key(${1:keyName})',
    isSnippet: true,
    detail: 'Compound key name for N:N relation',
  },
  // UUID auto-generation (model fields only)
  { type: 'uuid', label: '@uuid', insertText: '@uuid', isSnippet: false, detail: 'Auto-generate UUID (v7 default)' },
  { type: 'uuid4', label: '@uuid4', insertText: '@uuid4', isSnippet: false, detail: 'Auto-generate UUID v4' },
  { type: 'uuid7', label: '@uuid7', insertText: '@uuid7', isSnippet: false, detail: 'Auto-generate UUID v7' },
  // Geometry subtypes
  { type: 'point', label: '@point', insertText: '@point', isSnippet: false, detail: 'Geometry: point' },
  { type: 'line', label: '@line', insertText: '@line', isSnippet: false, detail: 'Geometry: line' },
  { type: 'polygon', label: '@polygon', insertText: '@polygon', isSnippet: false, detail: 'Geometry: polygon' },
  {
    type: 'multipoint',
    label: '@multipoint',
    insertText: '@multipoint',
    isSnippet: false,
    detail: 'Geometry: multipoint',
  },
  { type: 'multiline', label: '@multiline', insertText: '@multiline', isSnippet: false, detail: 'Geometry: multiline' },
  {
    type: 'multipolygon',
    label: '@multipolygon',
    insertText: '@multipolygon',
    isSnippet: false,
    detail: 'Geometry: multipolygon',
  },
  {
    type: 'geoCollection',
    label: '@geoCollection',
    insertText: '@geoCollection',
    isSnippet: false,
    detail: 'Geometry: collection',
  },
];

/** Model-level composite directive (@@unique, @@index). */
interface CompositeDirectiveDef {
  label: string;
  insertText: string;
  detail: string;
}

const COMPOSITE_DIRECTIVE_DEFS: readonly CompositeDirectiveDef[] = [
  {
    label: '@@unique()',
    insertText: '@@unique(${1:name}, [${2:field1}, ${3:field2}])',
    detail: 'Composite unique constraint on multiple fields',
  },
  {
    label: '@@index()',
    insertText: '@@index(${1:name}, [${2:field1}, ${3:field2}])',
    detail: 'Composite index on multiple fields',
  },
];

/** Decorators allowed on model fields (all decorators). */
const MODEL_FIELD_DECORATORS: ReadonlySet<string> = new Set([
  'id',
  'unique',
  'index',
  'default',
  'defaultAlways',
  'nullable',
  'readonly',
  'flexible',
  'set',
  'distinct',
  'sort',
  'createdAt',
  'updatedAt',
  'now',
  'field',
  'model',
  'onDelete',
  'key',
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

/** Decorators allowed on object fields (subset — no @id, @now, relation/UUID decorators). */
const OBJECT_FIELD_DECORATORS: ReadonlySet<string> = new Set([
  'default',
  'defaultAlways',
  'nullable',
  'readonly',
  'flexible',
  'createdAt',
  'updatedAt',
  'set',
  'distinct',
  'sort',
  'index',
  'unique',
  'point',
  'line',
  'polygon',
  'multipoint',
  'multiline',
  'multipolygon',
  'geoCollection',
]);

/** Decorators allowed on tuple elements (minimal subset). */
const TUPLE_ELEMENT_DECORATORS: ReadonlySet<string> = new Set([
  'nullable',
  'default',
  'defaultAlways',
  'createdAt',
  'updatedAt',
]);

/** Mutual exclusivity: if a decorator is present, these cannot be added. */
const DECORATOR_CONFLICTS: Readonly<Record<string, readonly string[]>> = {
  default: ['defaultAlways', 'createdAt', 'updatedAt', 'now', 'uuid', 'uuid4', 'uuid7'],
  defaultAlways: ['default', 'createdAt', 'updatedAt', 'now', 'uuid', 'uuid4', 'uuid7'],
  createdAt: ['default', 'defaultAlways', 'updatedAt', 'now', 'uuid', 'uuid4', 'uuid7'],
  updatedAt: ['default', 'defaultAlways', 'createdAt', 'now', 'uuid', 'uuid4', 'uuid7'],
  now: ['default', 'defaultAlways', 'createdAt', 'updatedAt', 'readonly', 'uuid', 'uuid4', 'uuid7'],
  uuid: ['default', 'defaultAlways', 'createdAt', 'updatedAt', 'now', 'uuid4', 'uuid7'],
  uuid4: ['default', 'defaultAlways', 'createdAt', 'updatedAt', 'now', 'uuid', 'uuid7'],
  uuid7: ['default', 'defaultAlways', 'createdAt', 'updatedAt', 'now', 'uuid', 'uuid4'],
  id: ['nullable', 'readonly'],
  set: ['distinct', 'sort'],
  distinct: ['set'],
  sort: ['set'],
};

// ---------------------------------------------------------------------------
// Block keyword snippets
// ---------------------------------------------------------------------------

function getTopLevelCompletions(): CompletionItem[] {
  return [
    {
      label: 'model',
      kind: CompletionItemKind.Keyword,
      insertText: 'model ${1:Name} {\n\t$0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'Define a model (database table)',
    },
    {
      label: 'abstract model',
      kind: CompletionItemKind.Keyword,
      insertText: 'abstract model ${1:Name} {\n\t$0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'Define an abstract model (no table generated)',
      // Override filterText so typing "abstract" still matches
      filterText: 'abstract model',
    },
    {
      label: 'object',
      kind: CompletionItemKind.Keyword,
      insertText: 'object ${1:Name} {\n\t$0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'Define an embedded object type',
    },
    {
      label: 'tuple',
      kind: CompletionItemKind.Keyword,
      insertText: 'tuple ${1:Name} {\n\t$0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'Define a fixed-length typed array',
    },
    {
      label: 'enum',
      kind: CompletionItemKind.Keyword,
      insertText: 'enum ${1:Name} {\n\t$0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'Define a string enum type',
    },
    {
      label: 'literal',
      kind: CompletionItemKind.Keyword,
      insertText: 'literal ${1:Name} {\n\t$0\n}',
      insertTextFormat: InsertTextFormat.Snippet,
      detail: 'Define a union literal type',
    },
  ];
}

// ---------------------------------------------------------------------------
// Cross-file type collection helpers
// ---------------------------------------------------------------------------

/** Names already defined in the current file's AST (used to deduplicate). */
interface LocalNames {
  models: Set<string>;
  objects: Set<string>;
  tuples: Set<string>;
  enums: Set<string>;
  literals: Set<string>;
}

function collectLocalNames(ast: SchemaAST | null): LocalNames {
  const names: LocalNames = {
    models: new Set(),
    objects: new Set(),
    tuples: new Set(),
    enums: new Set(),
    literals: new Set(),
  };
  if (!ast) return names;

  for (const m of ast.models) names.models.add(m.name);
  for (const o of ast.objects) names.objects.add(o.name);
  for (const t of ast.tuples) names.tuples.add(t.name);
  for (const e of ast.enums) names.enums.add(e.name);
  for (const l of ast.literals) names.literals.add(l.name);

  return names;
}

/**
 * Get all ASTs from the same schema group as the given URI, excluding the current file.
 * Returns an array of [filename, ast] pairs for detail text.
 */
function getCrossFileASTs(uri: string, indexer: WorkspaceIndexer | null): Array<{ filename: string; ast: SchemaAST }> {
  if (!indexer) return [];

  const group = indexer.getSchemaGroup(uri);
  if (!group) return [];

  const allASTs = indexer.getAllASTsInGroup(group.name);
  const results: Array<{ filename: string; ast: SchemaAST }> = [];
  const currentAST = indexer.getAST(uri);

  for (const [filePath, ast] of allASTs) {
    // Skip current file (match by reference identity from the indexer)
    if (currentAST === ast) continue;

    results.push({
      filename: path.basename(filePath),
      ast,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Field type completions
// ---------------------------------------------------------------------------

function getFieldTypeCompletions(
  ast: SchemaAST | null,
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Primitive types
  for (const pt of PRIMITIVE_TYPES) {
    items.push({
      label: pt.label,
      kind: CompletionItemKind.TypeParameter,
      detail: pt.detail,
    });
  }

  // Array variants (e.g. String[], Int[])
  for (const pt of PRIMITIVE_TYPES) {
    // Skip Relation[] as standalone type suggestion — relations use Relation @model
    // but Relation[] is valid syntax, so keep it
    items.push({
      label: `${pt.label}[]`,
      kind: CompletionItemKind.TypeParameter,
      detail: `${pt.detail} (array)`,
    });
  }

  // User-defined types from current file's AST
  if (ast) {
    for (const obj of ast.objects) {
      items.push({
        label: obj.name,
        kind: CompletionItemKind.Struct,
        detail: 'object type',
      });
      items.push({
        label: `${obj.name}[]`,
        kind: CompletionItemKind.Struct,
        detail: 'object type (array)',
      });
    }
    for (const tup of ast.tuples) {
      items.push({
        label: tup.name,
        kind: CompletionItemKind.Struct,
        detail: 'tuple type',
      });
      items.push({
        label: `${tup.name}[]`,
        kind: CompletionItemKind.Struct,
        detail: 'tuple type (array)',
      });
    }
    for (const en of ast.enums) {
      items.push({
        label: en.name,
        kind: CompletionItemKind.Enum,
        detail: 'enum type',
      });
    }
    for (const lit of ast.literals) {
      items.push({
        label: lit.name,
        kind: CompletionItemKind.TypeParameter,
        detail: 'literal type',
      });
    }
  }

  // Cross-file types from the same schema group (deduplicated against local names)
  const localNames = collectLocalNames(ast);
  const crossFileASTs = getCrossFileASTs(uri, indexer);

  for (const { filename, ast: otherAST } of crossFileASTs) {
    const fromDetail = `(from ${filename})`;

    for (const model of otherAST.models) {
      if (localNames.models.has(model.name)) continue;
      items.push({
        label: model.name,
        kind: CompletionItemKind.Class,
        detail: `model ${fromDetail}`,
      });
    }
    for (const obj of otherAST.objects) {
      if (localNames.objects.has(obj.name)) continue;
      items.push({
        label: obj.name,
        kind: CompletionItemKind.Struct,
        detail: `object type ${fromDetail}`,
      });
      items.push({
        label: `${obj.name}[]`,
        kind: CompletionItemKind.Struct,
        detail: `object type (array) ${fromDetail}`,
      });
    }
    for (const tup of otherAST.tuples) {
      if (localNames.tuples.has(tup.name)) continue;
      items.push({
        label: tup.name,
        kind: CompletionItemKind.Struct,
        detail: `tuple type ${fromDetail}`,
      });
      items.push({
        label: `${tup.name}[]`,
        kind: CompletionItemKind.Struct,
        detail: `tuple type (array) ${fromDetail}`,
      });
    }
    for (const en of otherAST.enums) {
      if (localNames.enums.has(en.name)) continue;
      items.push({
        label: en.name,
        kind: CompletionItemKind.Enum,
        detail: `enum type ${fromDetail}`,
      });
    }
    for (const lit of otherAST.literals) {
      if (localNames.literals.has(lit.name)) continue;
      items.push({
        label: lit.name,
        kind: CompletionItemKind.TypeParameter,
        detail: `literal type ${fromDetail}`,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Record() ID type completions
// ---------------------------------------------------------------------------

function getRecordIdCompletions(ast: SchemaAST | null): CompletionItem[] {
  const items: CompletionItem[] = [];

  for (const idType of RECORD_ID_TYPES) {
    items.push({
      label: idType,
      kind: CompletionItemKind.TypeParameter,
      detail: `Record ID type: ${idType}`,
    });
  }

  // Object/tuple names from AST (valid as Record ID types)
  if (ast) {
    for (const obj of ast.objects) {
      items.push({
        label: obj.name,
        kind: CompletionItemKind.Struct,
        detail: 'object type (Record ID)',
      });
    }
    for (const tup of ast.tuples) {
      items.push({
        label: tup.name,
        kind: CompletionItemKind.Struct,
        detail: 'tuple type (Record ID)',
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Extends completions
// ---------------------------------------------------------------------------

function getExtendsCompletions(
  ast: SchemaAST | null,
  blockContext: BlockContext,
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  if (!blockContext.blockType) return [];

  const items: CompletionItem[] = [];
  const offered = new Set<string>();

  // Helper to add items with dedup
  const addItem = (name: string, kind: CompletionItemKind, detail: string): void => {
    if (offered.has(name)) return;
    offered.add(name);
    items.push({ label: name, kind, detail });
  };

  // Local AST completions
  if (ast) {
    switch (blockContext.blockType) {
      case 'model':
        for (const model of ast.models) {
          if (model.abstract && model.name !== blockContext.blockName) {
            addItem(model.name, CompletionItemKind.Class, 'abstract model');
          }
        }
        break;
      case 'object':
        for (const obj of ast.objects) {
          if (obj.name !== blockContext.blockName) {
            addItem(obj.name, CompletionItemKind.Struct, 'object type');
          }
        }
        break;
      case 'tuple':
        for (const tup of ast.tuples) {
          if (tup.name !== blockContext.blockName) {
            addItem(tup.name, CompletionItemKind.Struct, 'tuple type');
          }
        }
        break;
      case 'enum':
        for (const en of ast.enums) {
          if (en.name !== blockContext.blockName) {
            addItem(en.name, CompletionItemKind.Enum, 'enum type');
          }
        }
        break;
      case 'literal':
        for (const lit of ast.literals) {
          if (lit.name !== blockContext.blockName) {
            addItem(lit.name, CompletionItemKind.TypeParameter, 'literal type');
          }
        }
        break;
    }
  }

  // Cross-file extends completions (same kind only)
  const crossFileASTs = getCrossFileASTs(uri, indexer);
  for (const { filename, ast: otherAST } of crossFileASTs) {
    const fromDetail = `(from ${filename})`;

    switch (blockContext.blockType) {
      case 'model':
        // Models can only extend abstract models
        for (const model of otherAST.models) {
          if (model.abstract && model.name !== blockContext.blockName) {
            addItem(model.name, CompletionItemKind.Class, `abstract model ${fromDetail}`);
          }
        }
        break;
      case 'object':
        for (const obj of otherAST.objects) {
          if (obj.name !== blockContext.blockName) {
            addItem(obj.name, CompletionItemKind.Struct, `object type ${fromDetail}`);
          }
        }
        break;
      case 'tuple':
        for (const tup of otherAST.tuples) {
          if (tup.name !== blockContext.blockName) {
            addItem(tup.name, CompletionItemKind.Struct, `tuple type ${fromDetail}`);
          }
        }
        break;
      case 'enum':
        for (const en of otherAST.enums) {
          if (en.name !== blockContext.blockName) {
            addItem(en.name, CompletionItemKind.Enum, `enum type ${fromDetail}`);
          }
        }
        break;
      case 'literal':
        for (const lit of otherAST.literals) {
          if (lit.name !== blockContext.blockName) {
            addItem(lit.name, CompletionItemKind.TypeParameter, `literal type ${fromDetail}`);
          }
        }
        break;
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Context detection helpers
// ---------------------------------------------------------------------------

/**
 * Check if the cursor is inside `Record(...)` parentheses on the current line.
 * Returns true when the line contains `Record(` before the cursor position
 * and the corresponding `)` has not been closed before the cursor.
 */
function isInsideRecordParens(lineText: string, character: number): boolean {
  const beforeCursor = lineText.slice(0, character);
  const recordIdx = beforeCursor.lastIndexOf('Record(');
  if (recordIdx === -1) return false;

  // Check that the closing paren hasn't appeared between Record( and cursor
  const afterRecord = beforeCursor.slice(recordIdx + 'Record('.length);

  return !afterRecord.includes(')');
}

/**
 * Check if the word immediately before the cursor is `extends`.
 */
function isAfterExtends(lineText: string, character: number): boolean {
  const beforeCursor = lineText.slice(0, character).trimEnd();

  return beforeCursor.endsWith('extends');
}

/**
 * Check if the cursor is inside `@model(...)` parentheses.
 * Returns true when the line contains `@model(` before the cursor
 * with no closing `)` before the cursor position.
 */
function isInsideModelParens(lineText: string, character: number): boolean {
  const beforeCursor = lineText.slice(0, character);
  const idx = beforeCursor.lastIndexOf('@model(');
  if (idx === -1) return false;

  const afterModel = beforeCursor.slice(idx + '@model('.length);

  return !afterModel.includes(')');
}

/**
 * Check if the cursor is inside `@field(...)` parentheses.
 * Returns true when the line contains `@field(` before the cursor
 * with no closing `)` before the cursor position.
 */
function isInsideFieldParens(lineText: string, character: number): boolean {
  const beforeCursor = lineText.slice(0, character);
  const idx = beforeCursor.lastIndexOf('@field(');
  if (idx === -1) return false;

  const afterField = beforeCursor.slice(idx + '@field('.length);

  return !afterField.includes(')');
}

// ---------------------------------------------------------------------------
// @model() argument completions
// ---------------------------------------------------------------------------

/**
 * Get model names from the same schema group for @model() argument position.
 * Includes both local and cross-file models.
 */
function getModelArgCompletions(
  ast: SchemaAST | null,
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  const items: CompletionItem[] = [];
  const offered = new Set<string>();

  // Local models
  if (ast) {
    for (const model of ast.models) {
      if (model.abstract) continue; // Abstract models can't be relation targets
      offered.add(model.name);
      items.push({
        label: model.name,
        kind: CompletionItemKind.Class,
        detail: 'model',
      });
    }
  }

  // Cross-file models
  const crossFileASTs = getCrossFileASTs(uri, indexer);
  for (const { filename, ast: otherAST } of crossFileASTs) {
    for (const model of otherAST.models) {
      if (model.abstract) continue;
      if (offered.has(model.name)) continue;
      offered.add(model.name);
      items.push({
        label: model.name,
        kind: CompletionItemKind.Class,
        detail: `model (from ${filename})`,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// @field() argument completions
// ---------------------------------------------------------------------------

/**
 * Get Record-type field names from the current model for @field() argument position.
 * Only offers fields typed as Record (FK fields) from the same model.
 */
function getFieldArgCompletions(ast: SchemaAST | null, blockContext: BlockContext): CompletionItem[] {
  if (!ast || !blockContext.blockName || blockContext.blockType !== 'model') return [];

  const items: CompletionItem[] = [];

  for (const model of ast.models) {
    if (model.name !== blockContext.blockName) continue;

    for (const field of model.fields) {
      // Only offer Record-type fields (FK candidates)
      if (field.type === 'record') {
        items.push({
          label: field.name,
          kind: CompletionItemKind.Field,
          detail: 'Record field',
        });
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Decorator completion helpers
// ---------------------------------------------------------------------------

/**
 * Get the set of allowed decorator type names for a given block kind.
 * Returns null for enum/literal (no decorators allowed).
 */
function getAllowedDecorators(blockType: BlockContext['blockType']): ReadonlySet<string> | null {
  switch (blockType) {
    case 'model':
      return MODEL_FIELD_DECORATORS;
    case 'object':
      return OBJECT_FIELD_DECORATORS;
    case 'tuple':
      return TUPLE_ELEMENT_DECORATORS;
    default:
      return null;
  }
}

/**
 * Check whether the cursor is at a position where decorator completions apply.
 * Combines AST-based detection (fieldContext === 'decorator') with line-text
 * detection (@ character before cursor followed by optional word characters).
 */
function isDecoratorPosition(lineText: string, character: number, blockContext: BlockContext): boolean {
  // No decorators outside blocks or in enum/literal blocks
  if (!blockContext.blockType || blockContext.blockType === 'enum' || blockContext.blockType === 'literal') {
    return false;
  }

  // AST-based: cursor is on an existing decorator range
  if (blockContext.fieldContext === 'decorator') return true;

  // Line-text-based: @ before cursor followed by optional word characters
  const beforeCursor = lineText.slice(0, character);

  return /@[a-zA-Z0-9]*$/.test(beforeCursor);
}

/**
 * Extract decorator type names already present on the current field.
 * Prefers AST-based detection; falls back to line text parsing.
 */
function getExistingDecoratorNames(
  ast: SchemaAST | null,
  blockContext: BlockContext,
  lineText: string,
  cerialPos: { line: number; column: number; offset: number },
): string[] {
  if (ast && blockContext.blockName) {
    const nodeInfo = findNodeAtPosition(ast, cerialPos);
    if (nodeInfo) {
      let fieldName: string | null = null;
      if (nodeInfo.kind === 'field') {
        fieldName = nodeInfo.name;
      } else if (nodeInfo.kind === 'decorator' && nodeInfo.parent) {
        fieldName = nodeInfo.parent.name;
      }
      if (fieldName) {
        const field = findFieldByName(ast, blockContext.blockName, fieldName);
        if (field) {
          return field.decorators.map((d) => d.type);
        }
      }
    }
  }

  // Fallback: extract @word patterns from the line
  return parseLineDecorators(lineText);
}

/**
 * Parse decorator names from line text (fallback when AST is unavailable).
 * Returns decorator type names without the @ prefix.
 */
function parseLineDecorators(lineText: string): string[] {
  const names: string[] = [];
  const regex = /@([a-zA-Z]\w*)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(lineText)) !== null) {
    names.push(match[1]);
  }

  return names;
}

/**
 * Compute decorator names excluded by mutual-exclusivity rules.
 */
function getConflictExclusions(existing: readonly string[]): Set<string> {
  const excluded = new Set<string>();
  for (const dec of existing) {
    const conflicts = DECORATOR_CONFLICTS[dec];
    if (conflicts) {
      for (const c of conflicts) excluded.add(c);
    }
  }

  return excluded;
}

/**
 * Build decorator CompletionItems for the current block context.
 * Filters by block type, excludes already-applied, excludes conflicts.
 */
function getDecoratorCompletions(
  ast: SchemaAST | null,
  blockContext: BlockContext,
  lineText: string,
  cerialPos: { line: number; column: number; offset: number },
): CompletionItem[] {
  if (!blockContext.blockType) return [];

  const allowed = getAllowedDecorators(blockContext.blockType);
  if (!allowed) return [];

  const existing = getExistingDecoratorNames(ast, blockContext, lineText, cerialPos);
  const existingSet = new Set(existing);
  const conflictExclusions = getConflictExclusions(existing);

  const items: CompletionItem[] = [];

  for (const def of FIELD_DECORATOR_DEFS) {
    if (!allowed.has(def.type)) continue;
    if (existingSet.has(def.type)) continue;
    if (conflictExclusions.has(def.type)) continue;

    items.push({
      label: def.label,
      kind: CompletionItemKind.Property,
      detail: def.detail,
      insertText: def.insertText,
      insertTextFormat: def.isSnippet ? InsertTextFormat.Snippet : InsertTextFormat.PlainText,
    });
  }

  // Composite directives (model blocks only)
  if (blockContext.blockType === 'model') {
    for (const def of COMPOSITE_DIRECTIVE_DEFS) {
      items.push({
        label: def.label,
        kind: CompletionItemKind.Property,
        detail: def.detail,
        insertText: def.insertText,
        insertTextFormat: InsertTextFormat.Snippet,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// Provider registration
// ---------------------------------------------------------------------------

/**
 * Register the completion provider on the LSP connection.
 *
 * @param connection - LSP connection
 * @param documents - Text document manager
 * @param getAST - Callback to retrieve parsed AST for a document URI
 * @param indexer - Workspace indexer for cross-file type resolution (optional for tests)
 */
export function registerCompletionProvider(
  connection: Connection,
  documents: TextDocuments<TextDocument>,
  getAST: GetASTCallback,
  indexer: WorkspaceIndexer | null = null,
): void {
  connection.onCompletion((params): CompletionItem[] => {
    const document = documents.get(params.textDocument.uri);
    if (!document) return [];

    const uri = params.textDocument.uri;
    const source = document.getText();
    const ast = getAST(uri);

    // Get the current line text for context detection
    const lines = source.split('\n');
    const lineText = lines[params.position.line] ?? '';

    // Check special contexts first (these override block context)

    // 1. Inside @model() parentheses — offer model names from same schema group
    if (isInsideModelParens(lineText, params.position.character)) {
      return getModelArgCompletions(ast, uri, indexer);
    }

    // 2. Inside @field() parentheses — offer Record-type field names from current model
    const cerialPos = lspToCerial(params.position);
    const blockContext = ast
      ? getBlockContext(ast, cerialPos)
      : { blockType: null, blockName: null, fieldContext: null };

    if (isInsideFieldParens(lineText, params.position.character)) {
      return getFieldArgCompletions(ast, blockContext);
    }

    // 3. Inside Record() parentheses
    if (isInsideRecordParens(lineText, params.position.character)) {
      return getRecordIdCompletions(ast);
    }

    // 4. After extends keyword
    if (isAfterExtends(lineText, params.position.character)) {
      return getExtendsCompletions(ast, blockContext, uri, indexer);
    }

    // 5. Use block context from AST for standard completions
    // Outside all blocks → top-level keywords
    if (!blockContext.blockType) {
      return getTopLevelCompletions();
    }

    // 6. Decorator position → context-filtered decorator completions
    if (isDecoratorPosition(lineText, params.position.character, blockContext)) {
      return getDecoratorCompletions(ast, blockContext, lineText, cerialPos);
    }

    // 7. Inside a block on a field type or empty line → field type completions
    // fieldContext null means we're on an empty/new line inside a block — offer field types
    // fieldContext 'type' means we're in the type position of a field
    if (
      (blockContext.blockType === 'model' || blockContext.blockType === 'object') &&
      (blockContext.fieldContext === 'type' || blockContext.fieldContext === null)
    ) {
      return getFieldTypeCompletions(ast, uri, indexer);
    }

    return [];
  });
}
