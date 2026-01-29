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
  model: ModelMetadata,
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
 * Reverse relations are more complex and may require subqueries.
 * For now, we'll use a simplified approach.
 *
 * @param ctx - Compile context for variable binding
 * @param relationField - The Relation type field
 * @param nestedWhere - Where clause for the related model
 * @param model - Current model metadata
 * @param registry - Full model registry
 */
export function buildReverseNestedCondition(
  _ctx: FilterCompileContext,
  relationField: FieldMetadata,
  _nestedWhere: WhereClause,
  _model: ModelMetadata,
  _registry: ModelRegistry,
): QueryFragment {
  if (!relationField.relationInfo || !relationField.relationInfo.isReverse) {
    return { text: '', vars: {} };
  }

  // Reverse relation filtering is complex and may need subqueries
  // For now, return empty - this can be extended later
  // A proper implementation might use: id IN (SELECT out FROM relationTable WHERE ...)

  return { text: '', vars: {} };
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
