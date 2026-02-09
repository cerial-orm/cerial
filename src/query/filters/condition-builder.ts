/**
 * Condition builder - builds WHERE clause conditions
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { FieldMetadata, ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import { CerialId, type RecordIdInput } from '../../utils/cerial-id';
import { isObject } from '../../utils/type-utils';
import { joinFragments } from '../compile/fragment';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { transformOrValidateRecordId } from '../transformers';
import { handleAnd, handleNot, handleOr } from './logical-operators';
import { buildNestedCondition, isNestedRelationCondition } from './nested-condition-builder';
import { getOperatorHandler, isRegisteredOperator } from './registry';

/** Find target table for a Record field by looking at paired Relation field */
function findRecordTargetTable(fieldName: string, model: ModelMetadata): string | undefined {
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === fieldName);

  return pairedRelation?.relationInfo?.targetTable;
}

/** Check if a value is a RecordIdInput type */
function isRecordIdInput(value: unknown): value is RecordIdInput {
  return (
    CerialId.is(value) || value instanceof RecordId || value instanceof StringRecordId || typeof value === 'string'
  );
}

/** Transform value for ID or Record fields - handles all RecordIdInput types */
function transformFieldValue(value: unknown, fieldMetadata: FieldMetadata, model: ModelMetadata): unknown {
  // Transform ID field values to RecordId
  if (fieldMetadata.isId) {
    if (isRecordIdInput(value)) {
      return transformOrValidateRecordId(model.tableName, value);
    }
    // Handle arrays of IDs (for in/notIn operators)
    if (Array.isArray(value)) {
      return value.map((v) => (isRecordIdInput(v) ? transformOrValidateRecordId(model.tableName, v) : v));
    }
  }

  // Transform Record field values to RecordId
  if (fieldMetadata.type === 'record') {
    const targetTable = findRecordTargetTable(fieldMetadata.name, model);
    if (targetTable) {
      if (isRecordIdInput(value)) {
        return transformOrValidateRecordId(targetTable, value);
      }
      // Handle arrays of values (for in/notIn, hasAll, hasAny operators)
      if (Array.isArray(value)) {
        return value.map((v) => (isRecordIdInput(v) ? transformOrValidateRecordId(targetTable, v) : v));
      }
    }
  }

  return value;
}

/** Build a condition for a single field with operators */
export function buildFieldCondition(
  ctx: FilterCompileContext,
  field: string,
  operators: Record<string, unknown>,
  fieldMetadata: FieldMetadata,
  model: ModelMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [op, value] of Object.entries(operators)) {
    if (value === undefined) continue;

    const handler = getOperatorHandler(op);
    if (handler) {
      // Transform ID/Record field values to RecordId
      const transformedValue = transformFieldValue(value, fieldMetadata, model);
      conditions.push(handler(ctx, field, transformedValue, fieldMetadata));
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
  model: ModelMetadata,
): QueryFragment {
  const handler = getOperatorHandler('eq');
  if (!handler) return { text: '', vars: {} };
  // Transform ID/Record field values to RecordId
  const transformedValue = transformFieldValue(value, fieldMetadata, model);
  return handler(ctx, field, transformedValue, fieldMetadata);
}

/** Check if a value is an operator object */
export function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  // RecordIdInput types (CerialId, RecordId, StringRecordId) are direct values, not operator objects
  if (isRecordIdInput(value)) return false;
  const keys = Object.keys(value);
  return keys.some((k) => isRegisteredOperator(k));
}

/** Build conditions from a where clause */
export function buildConditions(
  ctx: FilterCompileContext,
  where: WhereClause,
  model: ModelMetadata,
  registry?: ModelRegistry,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) => buildConditions(ctx, w as WhereClause, model, registry));
      conditions.push(handleAnd(andConditions));
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) => buildConditions(ctx, w as WhereClause, model, registry));
      conditions.push(handleOr(orConditions));
      continue;
    }

    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildConditions(ctx, value as WhereClause, model, registry);
      conditions.push(handleNot(notCondition));
      continue;
    }

    // Find field metadata
    const fieldMetadata = model.fields.find((f) => f.name === key);
    if (!fieldMetadata) {
      // Skip unknown fields
      continue;
    }

    // Handle relation fields with null value - translate to underlying record field
    // e.g., { user: null } becomes { userId: null } for a forward relation with @field(userId)
    if (fieldMetadata.type === 'relation' && value === null) {
      const fieldRef = fieldMetadata.relationInfo?.fieldRef;
      if (fieldRef) {
        // Find the underlying record field and use it
        const recordField = model.fields.find((f) => f.name === fieldRef);
        if (recordField) {
          conditions.push(buildDirectCondition(ctx, fieldRef, null, recordField, model));
          continue;
        }
      }
      // For reverse relations, filtering by null is not directly supported
      continue;
    }

    // Handle nested relation conditions (e.g., profile: { bio: { contains: 'x' } })
    if (registry && isNestedRelationCondition(fieldMetadata, value)) {
      const nestedCondition = buildNestedCondition(ctx, fieldMetadata, value, model, registry);
      if (nestedCondition.text) {
        conditions.push(nestedCondition);
      }
      continue;
    }

    // Handle operator object { eq: 5, gt: 3 }
    if (isOperatorObject(value)) {
      conditions.push(buildFieldCondition(ctx, key, value as Record<string, unknown>, fieldMetadata, model));
      continue;
    }

    // Handle direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, key, value, fieldMetadata, model));
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
