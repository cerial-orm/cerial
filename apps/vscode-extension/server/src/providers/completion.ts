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

/* oxlint-disable eslint/no-template-curly-in-string -- every `${1:name}` here is LSP snippet syntax, meant to stay a plain string */

import * as path from 'node:path';

import {
  type CompletionItem,
  CompletionItemKind,
  type Connection,
  InsertTextFormat,
  type TextDocuments,
} from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import {
  DECORATOR_REGISTRY,
  type DecoratorEntry,
  type DecoratorTarget,
  FIELD_TYPE_REGISTRY,
  getDecoratorEntry,
} from '../../../../orm/src/parser/registry';
import type { ASTField, SchemaAST } from '../../../../orm/src/types';
import { FIELD_TYPE_DETAIL } from '../data/hover-docs';
import type { WorkspaceIndexer } from '../indexer';
import { type BlockContext, findFieldByName, findNodeAtPosition, getBlockContext } from '../utils/ast-location';
import { lspToCerial } from '../utils/position';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback to retrieve the current AST for a document URI. */
export type GetASTCallback = (uri: string) => SchemaAST | null;

/** ID types valid inside Record() parentheses. */
const RECORD_ID_TYPES: readonly string[] = ['int', 'float', 'number', 'string', 'uuid'];

// ---------------------------------------------------------------------------
// Decorator definitions
// ---------------------------------------------------------------------------

/** Registry target for each block kind that holds fields. */
const BLOCK_TARGETS: Readonly<Record<string, DecoratorTarget>> = {
  model: 'modelField',
  object: 'objectField',
  tuple: 'tupleElement',
};

/** Label shown in the completion list: `@id` for a bare decorator, `@default()` for one with arguments. */
function decoratorLabel(entry: DecoratorEntry): string {
  return entry.args.kind === 'none' ? entry.name : `${entry.name}()`;
}

/** Insert text derived from the argument shape. The `${n:...}` placeholders are LSP snippet syntax. */
function decoratorSnippet(entry: DecoratorEntry): string {
  const { args, name } = entry;
  switch (args.kind) {
    case 'none':
      return name;
    case 'choice': {
      // true/false are aliases for asc/desc that the parser accepts; offering them only adds noise
      const offered = args.choices.filter((choice) => choice !== 'true' && choice !== 'false');

      return `${name}(\${1|${offered.join(',')}|})`;
    }
    case 'name': {
      // Model names are PascalCase; field and key names are camelCase
      const word = name.replace(/^@+/, '');
      const placeholder = word === 'model' ? 'ModelName' : `${word}Name`;

      return `${name}(\${1:${placeholder}})`;
    }
    case 'literal':
      return `${name}(\${1:value})`;
    case 'nameAndFields':
      return `${name}(\${1:name}, [\${2:field1}, \${3:field2}])`;
  }
}

/**
 * Decorators restricted to specific field types.
 * If a decorator type appears here, it is ONLY offered when the field's type matches.
 * Decorators NOT listed here are offered regardless of field type.
 */
export const DECORATOR_TYPE_RESTRICTIONS: Readonly<Record<string, ReadonlySet<string>>> = {
  // Timestamp decorators — Date fields only
  createdAt: new Set(['date']),
  updatedAt: new Set(['date']),
  now: new Set(['date']),
  // UUID auto-generation — Uuid fields only
  uuid: new Set(['uuid']),
  uuid4: new Set(['uuid']),
  uuid7: new Set(['uuid']),
  // Geometry subtypes — Geometry fields only
  point: new Set(['geometry']),
  line: new Set(['geometry']),
  polygon: new Set(['geometry']),
  multipoint: new Set(['geometry']),
  multiline: new Set(['geometry']),
  multipolygon: new Set(['geometry']),
  geoCollection: new Set(['geometry']),
  // Relation decorators — Relation fields only
  field: new Set(['relation']),
  model: new Set(['relation']),
  onDelete: new Set(['relation']),
  key: new Set(['relation']),
  // @flexible — object-typed fields only
  flexible: new Set(['object']),
  // Array modifiers — array fields only
  set: new Set(['array']),
  distinct: new Set(['array']),
  sort: new Set(['array']),
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

export function getFieldTypeCompletions(
  ast: SchemaAST | null,
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  const items: CompletionItem[] = [];

  // Built-in types from the registry, then their array variants (e.g. String[], Int[]).
  // Relation[] is valid syntax, so it is kept.
  const builtIns = [...FIELD_TYPE_REGISTRY.values()].map((entry) => {
    const detail = FIELD_TYPE_DETAIL[entry.name];

    return {
      label: entry.name,
      detail: detail ? `${detail.tsType} (SurrealDB: ${detail.surrealType})` : entry.description,
      documentation: entry.description,
    };
  });
  for (const type of builtIns) {
    items.push({ ...type, kind: CompletionItemKind.TypeParameter });
  }
  for (const type of builtIns) {
    items.push({
      ...type,
      label: `${type.label}[]`,
      kind: CompletionItemKind.TypeParameter,
      detail: `${type.detail} (array)`,
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
 * Check if the cursor is inside `extends Parent[...]` brackets.
 * Returns the parent name if true, null otherwise.
 */
export function getExtendsBracketContext(lineText: string, character: number): string | null {
  const beforeCursor = lineText.slice(0, character);
  // Match: extends ParentName[ with optional content inside brackets
  const match = beforeCursor.match(/extends\s+(\w+)\s*\[([^\]]*)$/);
  if (!match) return null;

  return match[1];
}

/**
 * Get field/value completions for inside extends brackets (pick/omit syntax).
 * Resolves the parent type and offers its fields/values, excluding already-listed ones.
 */
export function getExtendsBracketCompletions(
  parentName: string,
  lineText: string,
  character: number,
  blockContext: BlockContext,
  ast: SchemaAST | null,
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  if (!blockContext.blockType) return [];

  const items: CompletionItem[] = [];
  const offered = new Set<string>();

  // Extract already-listed fields in the brackets to exclude them
  const beforeCursor = lineText.slice(0, character);
  const bracketMatch = beforeCursor.match(/\[([^\]]*)$/);
  let mode: 'pick' | 'omit' | 'both' = 'both';
  if (bracketMatch) {
    const insideBracket = bracketMatch[1];
    // Parse existing field names (with or without ! prefix)
    const existing = insideBracket.split(',').map((s) => s.trim().replace(/^!/, ''));
    for (const name of existing) {
      if (name) offered.add(name);
    }
    // Detect pick/omit mode from raw existing items
    const rawItems = insideBracket
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (rawItems.length > 0) {
      const hasOmit = rawItems.some((s) => s.startsWith('!'));
      const hasPick = rawItems.some((s) => !s.startsWith('!'));
      mode = hasOmit ? 'omit' : hasPick ? 'pick' : 'both';
    }
  }

  // Search for the parent type in all ASTs (local + cross-file)
  const asts: Array<{ filename: string | null; ast: SchemaAST }> = [];
  if (ast) asts.push({ filename: null, ast });
  const crossFileASTs = getCrossFileASTs(uri, indexer);
  for (const entry of crossFileASTs) {
    asts.push(entry);
  }

  for (const { ast: searchAST } of asts) {
    switch (blockContext.blockType) {
      case 'model':
        for (const model of searchAST.models) {
          if (model.name !== parentName) continue;
          for (const field of model.fields) {
            if (offered.has(field.name)) continue;
            offered.add(field.name);
            if (mode === 'pick' || mode === 'both') {
              items.push({
                label: field.name,
                kind: CompletionItemKind.Field,
                detail: `${field.type}${field.isOptional ? '?' : ''} field`,
                sortText: mode === 'both' ? `0${field.name}` : undefined,
              });
            }
            if (mode === 'omit' || mode === 'both') {
              items.push({
                label: `!${field.name}`,
                kind: CompletionItemKind.Field,
                detail: `Omit ${field.type}${field.isOptional ? '?' : ''} field`,
                insertText: `!${field.name}`,
                sortText: mode === 'both' ? `1!${field.name}` : undefined,
              });
            }
          }
        }
        break;
      case 'object':
        for (const obj of searchAST.objects) {
          if (obj.name !== parentName) continue;
          for (const field of obj.fields) {
            if (offered.has(field.name)) continue;
            offered.add(field.name);
            if (mode === 'pick' || mode === 'both') {
              items.push({
                label: field.name,
                kind: CompletionItemKind.Field,
                detail: `${field.type}${field.isOptional ? '?' : ''} field`,
                sortText: mode === 'both' ? `0${field.name}` : undefined,
              });
            }
            if (mode === 'omit' || mode === 'both') {
              items.push({
                label: `!${field.name}`,
                kind: CompletionItemKind.Field,
                detail: `Omit ${field.type}${field.isOptional ? '?' : ''} field`,
                insertText: `!${field.name}`,
                sortText: mode === 'both' ? `1!${field.name}` : undefined,
              });
            }
          }
        }
        break;
      case 'tuple':
        for (const tup of searchAST.tuples) {
          if (tup.name !== parentName) continue;
          for (let i = 0; i < tup.elements.length; i++) {
            const el = tup.elements[i]!;
            const name = el.name ?? `element${i}`;
            if (offered.has(name)) continue;
            offered.add(name);
            if (mode === 'pick' || mode === 'both') {
              items.push({
                label: name,
                kind: CompletionItemKind.Field,
                detail: `${el.type} element`,
                sortText: mode === 'both' ? `0${name}` : undefined,
              });
            }
            if (mode === 'omit' || mode === 'both') {
              items.push({
                label: `!${name}`,
                kind: CompletionItemKind.Field,
                detail: `Omit ${el.type} element`,
                insertText: `!${name}`,
                sortText: mode === 'both' ? `1!${name}` : undefined,
              });
            }
          }
        }
        break;
      case 'enum':
        for (const en of searchAST.enums) {
          if (en.name !== parentName) continue;
          for (const val of en.values) {
            if (offered.has(val)) continue;
            offered.add(val);
            if (mode === 'pick' || mode === 'both') {
              items.push({
                label: val,
                kind: CompletionItemKind.EnumMember,
                detail: 'enum value',
                sortText: mode === 'both' ? `0${val}` : undefined,
              });
            }
            if (mode === 'omit' || mode === 'both') {
              items.push({
                label: `!${val}`,
                kind: CompletionItemKind.EnumMember,
                detail: 'Omit enum value',
                insertText: `!${val}`,
                sortText: mode === 'both' ? `1!${val}` : undefined,
              });
            }
          }
        }
        break;
      case 'literal':
        for (const lit of searchAST.literals) {
          if (lit.name !== parentName) continue;
          for (const v of lit.variants) {
            let label: string;
            switch (v.kind) {
              case 'string':
                label = v.value;
                break;
              case 'int':
              case 'float':
                label = String(v.value);
                break;
              case 'bool':
                label = String(v.value);
                break;
              default:
                continue;
            }
            if (offered.has(label)) continue;
            offered.add(label);
            if (mode === 'pick' || mode === 'both') {
              items.push({
                label,
                kind: CompletionItemKind.Value,
                detail: 'literal variant',
                sortText: mode === 'both' ? `0${label}` : undefined,
              });
            }
            if (mode === 'omit' || mode === 'both') {
              items.push({
                label: `!${label}`,
                kind: CompletionItemKind.Value,
                detail: 'Omit literal variant',
                insertText: `!${label}`,
                sortText: mode === 'both' ? `1!${label}` : undefined,
              });
            }
          }
        }
        break;
    }
  }

  return items;
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

/**
 * Check if the cursor is inside `@default(...)` or `@defaultAlways(...)` parentheses.
 * Returns true when the line contains `@default(` or `@defaultAlways(` before the cursor
 * with no closing `)` before the cursor position.
 */
export function isInsideDefaultParens(lineText: string, character: number): boolean {
  const beforeCursor = lineText.slice(0, character);
  const defaultIdx = beforeCursor.lastIndexOf('@default(');
  const defaultAlwaysIdx = beforeCursor.lastIndexOf('@defaultAlways(');
  const idx = Math.max(defaultIdx, defaultAlwaysIdx);
  if (idx === -1) return false;

  const parenOffset = defaultAlwaysIdx > defaultIdx ? '@defaultAlways('.length : '@default('.length;
  const afterParen = beforeCursor.slice(idx + parenOffset);

  return !afterParen.includes(')');
}

// ---------------------------------------------------------------------------
// Decorator option completions: @unique(nullsNotDistinct), @@unique(name, [a, b], nullsNotDistinct)
// ---------------------------------------------------------------------------

/**
 * Offer the words a decorator's argument list accepts when the cursor is inside it: the registry's
 * `choice` words, or a `nameAndFields` entry's `options` once the field list has closed and a comma follows.
 * Returns null when the cursor is not in such a position, so other contexts keep handling the line.
 */
export function getDecoratorOptionCompletions(lineText: string, character: number): CompletionItem[] | null {
  const beforeCursor = lineText.slice(0, character);
  const match = /(@@?[A-Za-z]+)\(([^)]*)$/.exec(beforeCursor);
  if (!match) return null;
  const entry = getDecoratorEntry(match[1]!);
  if (!entry) return null;
  const inside = match[2]!;
  let words: readonly string[] = [];
  if (entry.args.kind === 'choice') words = entry.args.choices.filter((c) => c !== 'true' && c !== 'false');
  else if (entry.args.kind === 'nameAndFields' && /\]\s*,\s*[A-Za-z]*$/.test(inside)) words = entry.args.options ?? [];
  if (!words.length) return null;

  return words.map((word) => ({
    label: word,
    kind: CompletionItemKind.EnumMember,
    detail: entry.description,
    insertText: word,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
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
  for (let match = regex.exec(lineText); match !== null; match = regex.exec(lineText)) {
    names.push(match[1]);
  }

  return names;
}

/**
 * Compute decorator names (with sigil) excluded by the registry's mutual-exclusivity rules. The rules
 * are read in both directions, so a decorator is hidden when an applied one excludes it or when it
 * excludes an applied one.
 */
function getConflictExclusions(existing: readonly string[]): Set<string> {
  const applied = new Set(existing.map((name) => `@${name}`));
  const excluded = new Set<string>();
  for (const entry of DECORATOR_REGISTRY.values()) {
    for (const other of entry.excludes) {
      if (applied.has(entry.name)) excluded.add(other);
      if (applied.has(other)) excluded.add(entry.name);
    }
  }

  return excluded;
}

/**
 * Resolve the current field's ASTField from context.
 * Returns the field if it can be determined from AST, null otherwise.
 */
export function getCurrentField(
  ast: SchemaAST | null,
  blockContext: BlockContext,
  cerialPos: { line: number; column: number; offset: number },
  lineText: string,
): ASTField | null {
  if (!ast || !blockContext.blockName) return null;

  const nodeInfo = findNodeAtPosition(ast, cerialPos);
  if (!nodeInfo) return null;

  let fieldName: string | null = null;
  if (nodeInfo.kind === 'field') {
    fieldName = nodeInfo.name;
  } else if (nodeInfo.kind === 'decorator' && nodeInfo.parent) {
    fieldName = nodeInfo.parent.name;
  }

  if (fieldName) {
    return findFieldByName(ast, blockContext.blockName, fieldName);
  }

  // Fallback: extract first word from the line as field name
  const trimmed = lineText.trimStart();
  const nameMatch = trimmed.match(/^([a-zA-Z_]\w*)/);
  if (nameMatch) {
    return findFieldByName(ast, blockContext.blockName, nameMatch[1]);
  }

  return null;
}

/**
 * Check if a decorator is allowed for the given field type.
 * Returns true if the decorator has no type restrictions or the field type matches.
 */
export function isDecoratorAllowedForFieldType(decoratorType: string, field: ASTField | null): boolean {
  const restrictions = DECORATOR_TYPE_RESTRICTIONS[decoratorType];
  if (!restrictions) return true; // No restriction — always allowed
  if (!field) return true; // Can't determine field type — don't filter

  // Check if the field type matches any allowed type
  if (restrictions.has(field.type)) return true;

  // Special case: array fields match 'array' restriction
  if (field.isArray && restrictions.has('array')) return true;

  // Special case: object-typed fields (have objectName set)
  if (field.objectName && restrictions.has('object')) return true;

  return false;
}

/**
 * Look up enum/literal values for a field, searching local and cross-file ASTs.
 * Returns the values as string[] for enum fields, or formatted variant strings for literal fields.
 * Returns null if the field is not enum/literal or values can't be resolved.
 */
export function resolveEnumLiteralValues(
  field: ASTField | null,
  ast: SchemaAST | null,
  uri: string,
  indexer: WorkspaceIndexer | null,
): string[] | null {
  if (!field || field.type !== 'literal' || !field.literalName) return null;

  const name = field.literalName;
  const asts: SchemaAST[] = [];
  if (ast) asts.push(ast);

  // Also search cross-file ASTs
  const crossFileASTs = getCrossFileASTs(uri, indexer);
  for (const { ast: otherAST } of crossFileASTs) {
    asts.push(otherAST);
  }

  // Check enums first (enum fields use type: 'literal' internally)
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
 * Get value completions for inside @default() or @defaultAlways() parentheses.
 * Returns enum/literal values for enum/literal fields, type-appropriate hints for primitives.
 */
export function getDefaultArgCompletions(
  ast: SchemaAST | null,
  blockContext: BlockContext,
  lineText: string,
  cerialPos: { line: number; column: number; offset: number },
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  const field = getCurrentField(ast, blockContext, cerialPos, lineText);
  if (!field) return [];

  const items: CompletionItem[] = [];

  // Check for enum/literal values
  const enumLiteralValues = resolveEnumLiteralValues(field, ast, uri, indexer);
  if (enumLiteralValues?.length) {
    for (const value of enumLiteralValues) {
      items.push({
        label: value,
        kind: CompletionItemKind.EnumMember,
      });
    }
    return items;
  }

  // Type-appropriate hints for primitives
  switch (field.type) {
    case 'bool':
      items.push({ label: 'true', kind: CompletionItemKind.Value }, { label: 'false', kind: CompletionItemKind.Value });
      break;
    case 'string':
    case 'email':
      items.push({
        label: "''",
        kind: CompletionItemKind.Value,
      });
      break;
    case 'int':
    case 'float':
    case 'number':
      items.push({
        label: '0',
        kind: CompletionItemKind.Value,
      });
      break;
    case 'date':
      items.push({
        label: 'null',
        kind: CompletionItemKind.Value,
      });
      break;
  }

  return items;
}

/**
 * Build decorator CompletionItems for the current block context.
 * Filters by registry target, field type, excludes already-applied, excludes conflicts.
 * For enum/literal fields, provides smart @default/@defaultAlways snippets with valid values.
 */
export function getDecoratorCompletions(
  ast: SchemaAST | null,
  blockContext: BlockContext,
  lineText: string,
  cerialPos: { line: number; column: number; offset: number },
  uri: string,
  indexer: WorkspaceIndexer | null,
): CompletionItem[] {
  if (!blockContext.blockType) return [];

  const target = BLOCK_TARGETS[blockContext.blockType];
  if (!target) return [];

  const existing = getExistingDecoratorNames(ast, blockContext, lineText, cerialPos);
  const existingSet = new Set(existing);
  const conflictExclusions = getConflictExclusions(existing);
  const field = getCurrentField(ast, blockContext, cerialPos, lineText);

  // Resolve enum/literal values for smart @default snippets
  const enumLiteralValues = resolveEnumLiteralValues(field, ast, uri, indexer);

  const items: CompletionItem[] = [];

  for (const entry of DECORATOR_REGISTRY.values()) {
    // Model-level directives (@@unique, @@index) are offered in model blocks and skip the per-field filters
    if (entry.targets.includes('model')) {
      if (blockContext.blockType !== 'model') continue;
      items.push({
        label: decoratorLabel(entry),
        kind: CompletionItemKind.Property,
        detail: entry.description,
        insertText: decoratorSnippet(entry),
        insertTextFormat: InsertTextFormat.Snippet,
      });
      continue;
    }

    const type = entry.name.slice(1);
    if (!entry.targets.includes(target)) continue;
    if (existingSet.has(type)) continue;
    if (conflictExclusions.has(entry.name)) continue;
    if (!isDecoratorAllowedForFieldType(type, field)) continue;

    // Smart @default/@defaultAlways for enum/literal fields
    if ((type === 'default' || type === 'defaultAlways') && enumLiteralValues?.length) {
      items.push({
        label: decoratorLabel(entry),
        kind: CompletionItemKind.Property,
        detail: entry.description,
        insertText: `${entry.name}(\${1|${enumLiteralValues.join(',')}|})`,
        insertTextFormat: InsertTextFormat.Snippet,
      });
      continue;
    }

    // A decorator whose argument is optional is offered bare as well, since the bare form is the common one
    if (entry.args.kind === 'choice' && entry.args.optional) {
      items.push({
        label: entry.name,
        kind: CompletionItemKind.Property,
        detail: entry.description,
        insertText: entry.name,
        insertTextFormat: InsertTextFormat.PlainText,
      });
    }

    items.push({
      label: decoratorLabel(entry),
      kind: CompletionItemKind.Property,
      detail: entry.description,
      insertText: decoratorSnippet(entry),
      insertTextFormat: entry.args.kind === 'none' ? InsertTextFormat.PlainText : InsertTextFormat.Snippet,
    });
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

    // 2.5. Inside a decorator whose arguments are a fixed set of words
    const optionItems = getDecoratorOptionCompletions(lineText, params.position.character);
    if (optionItems) return optionItems;

    // 3. Inside Record() parentheses
    if (isInsideRecordParens(lineText, params.position.character)) {
      return getRecordIdCompletions(ast);
    }

    // 3.5. Inside @default() or @defaultAlways() parentheses — offer value completions
    if (isInsideDefaultParens(lineText, params.position.character)) {
      return getDefaultArgCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);
    }

    // 4a. Inside extends Parent[...] brackets — offer parent fields for pick/omit
    const extendsParent = getExtendsBracketContext(lineText, params.position.character);
    if (extendsParent) {
      return getExtendsBracketCompletions(
        extendsParent,
        lineText,
        params.position.character,
        blockContext,
        ast,
        uri,
        indexer,
      );
    }

    // 4b. After extends keyword (no brackets yet)
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
      return getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);
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

/* oxlint-enable eslint/no-template-curly-in-string */
