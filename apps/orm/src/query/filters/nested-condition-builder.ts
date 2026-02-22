/**
 * Nested condition builder - handles nested WHERE conditions for relations
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import { joinFragments } from '../compile/fragment';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { isOperatorObject } from './condition-builder';
import { handleAnd } from './logical-operators';
import { getOperatorHandler } from './registry';

/** Relation filter operators for array relations */
type RelationFilterOperator = 'some' | 'every' | 'none';

/** Check if a key is a relation filter operator */
function isRelationFilterOperator(key: string): key is RelationFilterOperator {
  return key === 'some' || key === 'every' || key === 'none';
}

/**
 * Find the foreign key field in the target model that points back to the source model
 */
function findForeignKeyField(sourceModel: ModelMetadata, targetModel: ModelMetadata): string | undefined {
  // Look for a Relation field in target that points to source and has a fieldRef
  for (const field of targetModel.fields) {
    if (field.type !== 'relation' || field.relationInfo?.isReverse) continue;
    if (field.relationInfo?.targetModel === sourceModel.name && field.relationInfo?.fieldRef) {
      return field.relationInfo.fieldRef;
    }
  }

  return undefined;
}

/**
 * Build conditions from a nested where clause for use in subqueries
 */
function buildSubqueryConditions(
  ctx: FilterCompileContext,
  nestedWhere: WhereClause,
  targetModel: ModelMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [fieldName, value] of Object.entries(nestedWhere)) {
    if (value === undefined) continue;

    // Find field metadata
    const fieldMetadata = targetModel.fields.find((f) => f.name === fieldName);
    if (!fieldMetadata) continue;

    // Handle operator object
    if (isOperatorObject(value)) {
      const operatorConditions: QueryFragment[] = [];

      for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
        if (opValue === undefined) continue;

        const handler = getOperatorHandler(op);
        if (handler) {
          operatorConditions.push(handler(ctx, fieldName, opValue, fieldMetadata));
        }
      }

      if (operatorConditions.length > 0) {
        conditions.push(operatorConditions.length === 1 ? operatorConditions[0]! : handleAnd(operatorConditions));
      }
    } else {
      // Direct value (shorthand for eq)
      const handler = getOperatorHandler('eq');
      if (handler) {
        conditions.push(handler(ctx, fieldName, value, fieldMetadata));
      }
    }
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  return joinFragments(conditions, ' AND ');
}

/**
 * Build a nested condition for a forward relation field
 *
 * Forward relation uses dot notation: fieldRef.nestedField OPERATOR $value
 * Example: profileId.bio CONTAINS $bio_contains_0
 *
 * @param ctx - Compile context for variable binding
 * @param relationField - The Relation type field
 * @param nestedWhere - Where clause for the related model
 * @param model - Current model metadata
 * @param registry - Full model registry
 */
export function buildForwardNestedCondition(
  ctx: FilterCompileContext,
  relationField: FieldMetadata,
  nestedWhere: WhereClause,
  _model: ModelMetadata,
  registry: ModelRegistry,
): QueryFragment {
  if (!relationField.relationInfo || relationField.relationInfo.isReverse) {
    return { text: '', vars: {} };
  }

  const fieldRef = relationField.relationInfo.fieldRef;
  if (!fieldRef) {
    return { text: '', vars: {} };
  }

  // Get target model metadata
  const targetModel = registry[relationField.relationInfo.targetModel];
  if (!targetModel) {
    return { text: '', vars: {} };
  }

  const conditions: QueryFragment[] = [];

  // Build conditions for each nested field
  for (const [nestedField, value] of Object.entries(nestedWhere)) {
    if (value === undefined) continue;

    // Skip logical operators for now (AND, OR, NOT)
    if (nestedField === 'AND' || nestedField === 'OR' || nestedField === 'NOT') {
      continue;
    }

    // Find nested field metadata
    const nestedFieldMetadata = targetModel.fields.find((f) => f.name === nestedField);
    if (!nestedFieldMetadata) continue;

    // Build the dot-notation field name
    const dotField = `${fieldRef}.${nestedField}`;

    // Handle operator object
    if (isOperatorObject(value)) {
      const operatorConditions: QueryFragment[] = [];

      for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
        if (opValue === undefined) continue;

        const handler = getOperatorHandler(op);
        if (handler) {
          operatorConditions.push(handler(ctx, dotField, opValue, nestedFieldMetadata));
        }
      }

      if (operatorConditions.length > 0) {
        conditions.push(operatorConditions.length === 1 ? operatorConditions[0]! : handleAnd(operatorConditions));
      }
    } else {
      // Direct value (shorthand for eq)
      const handler = getOperatorHandler('eq');
      if (handler) {
        conditions.push(handler(ctx, dotField, value, nestedFieldMetadata));
      }
    }
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  return joinFragments(conditions, ' AND ');
}

/**
 * Build a nested condition for a reverse relation field
 *
 * Reverse relations use subqueries with some/every/none operators:
 * - some: At least one related record matches
 * - every: All related records match (and at least one exists)
 * - none: No related records match
 *
 * @param ctx - Compile context for variable binding
 * @param relationField - The Relation type field
 * @param nestedWhere - Where clause for the related model
 * @param model - Current model metadata
 * @param registry - Full model registry
 */
export function buildReverseNestedCondition(
  ctx: FilterCompileContext,
  relationField: FieldMetadata,
  nestedWhere: WhereClause,
  model: ModelMetadata,
  registry: ModelRegistry,
): QueryFragment {
  if (!relationField.relationInfo || !relationField.relationInfo.isReverse) {
    return { text: '', vars: {} };
  }

  // Get target model metadata
  const targetModel = registry[relationField.relationInfo.targetModel];
  if (!targetModel) {
    return { text: '', vars: {} };
  }

  // Find the foreign key field in target model that points back to us
  const foreignKeyField = findForeignKeyField(model, targetModel);
  if (!foreignKeyField) {
    return { text: '', vars: {} };
  }

  const conditions: QueryFragment[] = [];

  // Check for relation filter operators (some, every, none)
  for (const [key, value] of Object.entries(nestedWhere)) {
    if (value === undefined) continue;

    if (isRelationFilterOperator(key)) {
      const innerWhere = value as WhereClause;
      const innerCondition = buildSubqueryConditions(ctx, innerWhere, targetModel);

      if (!innerCondition.text) continue;

      // Build the subquery based on the operator
      let subqueryText: string;

      switch (key) {
        case 'some':
          // At least one related record matches
          // id IN (SELECT VALUE fkField FROM targetTable WHERE <condition>)
          subqueryText = `id IN (SELECT VALUE ${foreignKeyField} FROM ${targetModel.tableName} WHERE ${innerCondition.text})`;
          break;

        case 'every':
          // All related records match AND at least one exists
          // Two conditions:
          // 1. No related record that DOESN'T match: id NOT IN (SELECT VALUE fk FROM target WHERE NOT(<condition>))
          // 2. At least one related record exists: id IN (SELECT VALUE fk FROM target)
          subqueryText =
            `(id NOT IN (SELECT VALUE ${foreignKeyField} FROM ${targetModel.tableName} WHERE NOT (${innerCondition.text})) ` +
            `AND id IN (SELECT VALUE ${foreignKeyField} FROM ${targetModel.tableName}))`;
          break;

        case 'none':
          // No related records match
          // id NOT IN (SELECT VALUE fkField FROM targetTable WHERE <condition>)
          subqueryText = `id NOT IN (SELECT VALUE ${foreignKeyField} FROM ${targetModel.tableName} WHERE ${innerCondition.text})`;
          break;

        default:
          continue;
      }

      conditions.push({ text: subqueryText, vars: innerCondition.vars });
    }
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  return joinFragments(conditions, ' AND ');
}

/**
 * Build nested condition for a relation field
 *
 * @param ctx - Compile context for variable binding
 * @param relationField - The Relation type field
 * @param nestedWhere - Where clause for the related model
 * @param model - Current model metadata
 * @param registry - Full model registry
 */
export function buildNestedCondition(
  ctx: FilterCompileContext,
  relationField: FieldMetadata,
  nestedWhere: WhereClause,
  model: ModelMetadata,
  registry: ModelRegistry,
): QueryFragment {
  if (!relationField.relationInfo) {
    return { text: '', vars: {} };
  }

  if (relationField.relationInfo.isReverse) {
    return buildReverseNestedCondition(ctx, relationField, nestedWhere, model, registry);
  }

  return buildForwardNestedCondition(ctx, relationField, nestedWhere, model, registry);
}

/**
 * Check if a field value represents a nested relation condition
 */
export function isNestedRelationCondition(field: FieldMetadata, value: unknown): value is WhereClause {
  if (field.type !== 'relation' || !field.relationInfo) {
    return false;
  }

  // Value should be an object (where clause)
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
