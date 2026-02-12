/**
 * Condition builder - builds WHERE clause conditions
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { FieldMetadata, ModelMetadata, ModelRegistry, ObjectFieldMetadata, WhereClause } from '../../types';
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

/** Build conditions for a single/optional object field using dot notation */
export function buildObjectCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    // Handle logical operators within object where
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) =>
        buildObjectCondition(ctx, fieldPath, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleAnd(andConditions));
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) =>
        buildObjectCondition(ctx, fieldPath, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleOr(orConditions));
      continue;
    }
    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildObjectCondition(ctx, fieldPath, value as Record<string, unknown>, objectInfo);
      conditions.push(handleNot(notCondition));
      continue;
    }

    // Find sub-field metadata
    const subField = objectInfo.fields.find((f) => f.name === key);

    const subPath = `${fieldPath}.${key}`;

    // Unknown field (not in metadata) — pass through for @flexible objects
    if (!subField) {
      if (isOperatorObject(value)) {
        // Build operator conditions with a synthetic field (type 'string' as fallback)
        const syntheticField: FieldMetadata = {
          name: key,
          type: 'string',
          isId: false,
          isUnique: false,
          isRequired: false,
        };
        conditions.push(
          buildFieldCondition(ctx, subPath, value as Record<string, unknown>, syntheticField, {} as ModelMetadata),
        );
      } else {
        // Direct value (shorthand for eq)
        const binding = ctx.bind(subPath, 'eq', value, 'string');
        conditions.push({ text: `${subPath} = ${binding.placeholder}`, vars: binding.vars });
      }
      continue;
    }

    // Nested object sub-field
    if (subField.type === 'object' && subField.objectInfo && isObject(value)) {
      if (subField.isArray) {
        // Array of nested objects: some/every/none
        conditions.push(buildArrayObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo));
      } else {
        // Single nested object: recursive dot notation
        conditions.push(buildObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo));
      }
      continue;
    }

    // Primitive sub-field with operators
    if (isOperatorObject(value)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, subField, {} as ModelMetadata),
      );
      continue;
    }

    // Direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, subPath, value, subField, {} as ModelMetadata));
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/** Build conditions for an array-of-objects field using closure syntax */
export function buildArrayObjectCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [quantifier, subWhere] of Object.entries(whereValue)) {
    if (!isObject(subWhere)) continue;

    // Build inner conditions using closure variable $v
    const innerCondition = buildObjectConditionForClosure(ctx, '$v', subWhere as Record<string, unknown>, objectInfo);
    if (!innerCondition.text) continue;

    if (quantifier === 'some') {
      conditions.push({ text: `${fieldPath}.any(|$v| ${innerCondition.text})`, vars: innerCondition.vars });
    } else if (quantifier === 'every') {
      conditions.push({ text: `${fieldPath}.all(|$v| ${innerCondition.text})`, vars: innerCondition.vars });
    } else if (quantifier === 'none') {
      conditions.push({ text: `!(${fieldPath}.any(|$v| ${innerCondition.text}))`, vars: innerCondition.vars });
    }
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/** Build object conditions for closure context (uses $v.field instead of fieldPath.field) */
function buildObjectConditionForClosure(
  ctx: FilterCompileContext,
  closureVar: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) =>
        buildObjectConditionForClosure(ctx, closureVar, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleAnd(andConditions));
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) =>
        buildObjectConditionForClosure(ctx, closureVar, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleOr(orConditions));
      continue;
    }
    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildObjectConditionForClosure(
        ctx,
        closureVar,
        value as Record<string, unknown>,
        objectInfo,
      );
      conditions.push(handleNot(notCondition));
      continue;
    }

    const subField = objectInfo.fields.find((f) => f.name === key);

    const subPath = `${closureVar}.${key}`;

    // Unknown field (not in metadata) — pass through for @flexible objects
    if (!subField) {
      if (isOperatorObject(value)) {
        const syntheticField: FieldMetadata = {
          name: key,
          type: 'string',
          isId: false,
          isUnique: false,
          isRequired: false,
        };
        conditions.push(
          buildFieldCondition(ctx, subPath, value as Record<string, unknown>, syntheticField, {} as ModelMetadata),
        );
      } else {
        const binding = ctx.bind(subPath, 'eq', value, 'string');
        conditions.push({ text: `${subPath} = ${binding.placeholder}`, vars: binding.vars });
      }
      continue;
    }

    // Nested object
    if (subField.type === 'object' && subField.objectInfo && isObject(value)) {
      if (subField.isArray) {
        conditions.push(buildArrayObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo));
      } else {
        conditions.push(
          buildObjectConditionForClosure(ctx, subPath, value as Record<string, unknown>, subField.objectInfo),
        );
      }
      continue;
    }

    if (isOperatorObject(value)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, subField, {} as ModelMetadata),
      );
      continue;
    }

    conditions.push(buildDirectCondition(ctx, subPath, value, subField, {} as ModelMetadata));
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/**
 * Resolve a dot-notation field path to a FieldMetadata.
 * For example, "address.city" resolves through the "address" object field to its "city" sub-field.
 * Returns the leaf field metadata if found, or undefined if the path is invalid.
 */
function resolveDotNotationField(dotPath: string, model: ModelMetadata): FieldMetadata | undefined {
  const parts = dotPath.split('.');
  if (parts.length < 2) return undefined;

  // Find the root field
  const rootField = model.fields.find((f) => f.name === parts[0]);
  if (!rootField || rootField.type !== 'object' || !rootField.objectInfo) return undefined;

  // Walk the object info tree
  let currentObjectInfo: ObjectFieldMetadata | undefined = rootField.objectInfo;
  let resolvedField: FieldMetadata | undefined;

  for (let i = 1; i < parts.length; i++) {
    if (!currentObjectInfo) return undefined;

    const subField: FieldMetadata | undefined = currentObjectInfo.fields.find((f) => f.name === parts[i]);
    if (!subField) return undefined;

    if (i === parts.length - 1) {
      // Last part: this is the target field
      resolvedField = subField;
    } else {
      // Intermediate: must be an object field
      if (subField.type !== 'object' || !subField.objectInfo) return undefined;
      currentObjectInfo = subField.objectInfo;
    }
  }

  return resolvedField;
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
    let fieldMetadata = model.fields.find((f) => f.name === key);

    // Handle dot-notation keys from expanded composite directives (e.g., "address.city")
    if (!fieldMetadata && key.includes('.')) {
      const resolvedField = resolveDotNotationField(key, model);
      if (resolvedField) {
        // Build a direct equality condition using the dot-notation path as the field name
        conditions.push(buildDirectCondition(ctx, key, value, resolvedField, model));
        continue;
      }
    }

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

    // Handle object field conditions (e.g., address: { city: 'NYC' })
    if (fieldMetadata.type === 'object' && fieldMetadata.objectInfo && isObject(value)) {
      if (fieldMetadata.isArray) {
        // Array of objects: { some: ..., every: ..., none: ... }
        const objCondition = buildArrayObjectCondition(
          ctx,
          key,
          value as Record<string, unknown>,
          fieldMetadata.objectInfo,
        );
        if (objCondition.text) conditions.push(objCondition);
      } else {
        // Single/optional object: dot notation
        const objCondition = buildObjectCondition(ctx, key, value as Record<string, unknown>, fieldMetadata.objectInfo);
        if (objCondition.text) conditions.push(objCondition);
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
