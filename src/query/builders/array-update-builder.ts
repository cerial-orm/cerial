/**
 * Array update builder - handles push/unset operations for Record[] fields
 */

import type { FieldMetadata } from '../../types';
import type { FilterCompileContext } from '../compile/var-allocator';

/** Array update operations */
export interface ArrayUpdateOps {
  push?: unknown;
  unset?: unknown;
}

/** Check if a value is an array update operation */
export function isArrayUpdateOps(value: unknown): value is ArrayUpdateOps {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const ops = value as Record<string, unknown>;
  return 'push' in ops || 'unset' in ops;
}

/** Build push operation (SET field += value) */
export function buildPushOperation(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): { clause: string; vars: Record<string, unknown> } {
  // SurrealDB sets don't support += — use set::union instead
  if (fieldMetadata.isSet) {
    const pushValue = Array.isArray(value) ? value : [value];
    const varBinding = ctx.bind(field, 'push', pushValue, fieldMetadata.type);

    return {
      clause: `${field} = set::union(${field}, <set>${varBinding.placeholder})`,
      vars: varBinding.vars,
    };
  }

  const varBinding = ctx.bind(field, 'push', value, fieldMetadata.type);

  return {
    clause: `${field} += ${varBinding.placeholder}`,
    vars: varBinding.vars,
  };
}

/** Build unset operation (SET field -= value) */
export function buildUnsetOperation(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): { clause: string; vars: Record<string, unknown> } {
  // SurrealDB sets don't support -= — use set::difference instead
  if (fieldMetadata.isSet) {
    const unsetValue = Array.isArray(value) ? value : [value];
    const varBinding = ctx.bind(field, 'unset', unsetValue, fieldMetadata.type);

    return {
      clause: `${field} = set::difference(${field}, <set>${varBinding.placeholder})`,
      vars: varBinding.vars,
    };
  }

  const varBinding = ctx.bind(field, 'unset', value, fieldMetadata.type);

  return {
    clause: `${field} -= ${varBinding.placeholder}`,
    vars: varBinding.vars,
  };
}

/** Build array update clause for a field
 * Handles push, unset, or direct assignment
 */
export function buildArrayUpdateClause(
  ctx: FilterCompileContext,
  field: string,
  value: unknown[] | ArrayUpdateOps,
  fieldMetadata: FieldMetadata,
): { clause: string; vars: Record<string, unknown> } {
  // Direct array assignment (overwrite)
  if (Array.isArray(value)) {
    const varBinding = ctx.bind(field, 'set', value, fieldMetadata.type);
    const placeholder = fieldMetadata.isSet ? `<set>${varBinding.placeholder}` : varBinding.placeholder;

    return {
      clause: `${field} = ${placeholder}`,
      vars: varBinding.vars,
    };
  }

  // Handle push/unset operations
  const clauses: string[] = [];
  const vars: Record<string, unknown> = {};

  if (value.push !== undefined) {
    const pushResult = buildPushOperation(ctx, field, value.push, fieldMetadata);
    clauses.push(pushResult.clause);
    Object.assign(vars, pushResult.vars);
  }

  if (value.unset !== undefined) {
    const unsetResult = buildUnsetOperation(ctx, field, value.unset, fieldMetadata);
    clauses.push(unsetResult.clause);
    Object.assign(vars, unsetResult.vars);
  }

  return {
    clause: clauses.join(', '),
    vars,
  };
}

/** Check if a field value needs array update handling */
export function isArrayField(field: FieldMetadata): boolean {
  return !!field.isArray;
}
