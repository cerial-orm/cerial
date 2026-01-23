/**
 * Condition builder - builds WHERE clause conditions
 */

import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import type { FieldMetadata, ModelMetadata, WhereClause } from '../../types';
import { joinFragments } from '../compile/fragment';
import { getOperatorHandler, isRegisteredOperator } from './registry';
import { handleAnd, handleOr, handleNot } from './logical-operators';
import { isObject } from '../../utils/type-utils';

/** Build a condition for a single field with operators */
export function buildFieldCondition(
  ctx: FilterCompileContext,
  field: string,
  operators: Record<string, unknown>,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [op, value] of Object.entries(operators)) {
    if (value === undefined) continue;

    const handler = getOperatorHandler(op);
    if (handler) {
      conditions.push(handler(ctx, field, value, fieldMetadata));
    }
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  // Multiple operators on same field = AND them together
  return handleAnd(conditions);
}

/** Build a condition for a direct value (shorthand for eq) */
export function buildDirectCondition(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
): QueryFragment {
  const handler = getOperatorHandler('eq');
  if (!handler) return { text: '', vars: {} };
  return handler(ctx, field, value, fieldMetadata);
}

/** Check if a value is an operator object */
export function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const keys = Object.keys(value);
  return keys.some((k) => isRegisteredOperator(k));
}

/** Build conditions from a where clause */
export function buildConditions(
  ctx: FilterCompileContext,
  where: WhereClause,
  model: ModelMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) => buildConditions(ctx, w as WhereClause, model));
      conditions.push(handleAnd(andConditions));
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) => buildConditions(ctx, w as WhereClause, model));
      conditions.push(handleOr(orConditions));
      continue;
    }

    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildConditions(ctx, value as WhereClause, model);
      conditions.push(handleNot(notCondition));
      continue;
    }

    // Find field metadata
    const fieldMetadata = model.fields.find((f) => f.name === key);
    if (!fieldMetadata) {
      // Skip unknown fields
      continue;
    }

    // Handle operator object { eq: 5, gt: 3 }
    if (isOperatorObject(value)) {
      conditions.push(buildFieldCondition(ctx, key, value as Record<string, unknown>, fieldMetadata));
      continue;
    }

    // Handle direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, key, value, fieldMetadata));
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  // Multiple field conditions = AND them together
  return joinFragments(conditions, ' AND ');
}
