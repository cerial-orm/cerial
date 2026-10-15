/**
 * Reserved-keyword validator - refuses SurrealDB reserved words as declaration and field names
 */

import type { ASTField, SchemaAST } from '../../types';
import type { SchemaValidationError } from './schema-validator';

/**
 * Names refused as a model, object, tuple, enum or field name. Matching is case-insensitive, as
 * SurrealDB's own keyword sets are.
 *
 * Pinned to SurrealDB 3.3.0: the 44 `RESERVED_KEYWORD` entries of `common/src/keywords.rs`, the 55
 * words the project guide used to list, `and` (measured unusable bare, absent from the source set) and
 * `access` (a statement starter the source omits). The set changed between 2.6.5 and 3.3.0, so re-diff
 * it against the parser source on every SurrealDB bump.
 */
export const RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
  'access',
  'after',
  'all',
  'alter',
  'and',
  'as',
  'before',
  'begin',
  'break',
  'by',
  'cancel',
  'commit',
  'contains',
  'content',
  'continue',
  'create',
  'define',
  'delete',
  'diff',
  'else',
  'end',
  'false',
  'fetch',
  'field',
  'for',
  'from',
  'full',
  'function',
  'group',
  'if',
  'in',
  'index',
  'info',
  'insert',
  'inside',
  'intersects',
  'is',
  'kill',
  'let',
  'limit',
  'live',
  'merge',
  'none',
  'not',
  'null',
  'on',
  'only',
  'option',
  'or',
  'order',
  'outside',
  'parallel',
  'patch',
  'rand',
  'rebuild',
  'relate',
  'remove',
  'return',
  'select',
  'sequence',
  'set',
  'show',
  'sleep',
  'start',
  'table',
  'tb',
  'then',
  'throw',
  'timeout',
  'true',
  'type',
  'update',
  'upsert',
  'use',
  'value',
  'where',
]);

export function isReservedKeyword(name: string): boolean {
  return RESERVED_KEYWORDS.has(name.toLowerCase());
}

function reservedError(
  kind: string,
  name: string,
  line: number,
  model?: string,
  field?: string,
): SchemaValidationError {
  return {
    message: `Reserved keyword: ${kind} name '${name}' is a SurrealDB reserved word and cannot be used. Rename it.`,
    model,
    field,
    line,
  };
}

function checkFields(owner: string, kind: string, fields: ASTField[]): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const field of fields) {
    if (isReservedKeyword(field.name)) {
      errors.push(reservedError(`field (on ${kind} ${owner})`, field.name, field.range.start.line, owner, field.name));
    }
  }

  return errors;
}

/** Reject reserved words used as model, object, tuple or enum names, or as field names on a model or object */
export function validateReservedKeywords(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    if (isReservedKeyword(model.name))
      errors.push(reservedError('model', model.name, model.range.start.line, model.name));
    errors.push(...checkFields(model.name, 'model', model.fields));
  }

  for (const object of ast.objects) {
    if (isReservedKeyword(object.name)) errors.push(reservedError('object', object.name, object.range.start.line));
    errors.push(...checkFields(object.name, 'object', object.fields));
  }

  for (const tuple of ast.tuples) {
    if (isReservedKeyword(tuple.name)) errors.push(reservedError('tuple', tuple.name, tuple.range.start.line));
  }

  for (const enumDef of ast.enums) {
    if (isReservedKeyword(enumDef.name)) errors.push(reservedError('enum', enumDef.name, enumDef.range.start.line));
  }

  return errors;
}
