/**
 * Nested condition builder - handles nested WHERE conditions for relations
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry, WhereClause } from '../../types';
import { joinFragments } from '../compile/fragment';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { CerialValidationError } from '../../errors';
import { isObject } from '../../utils/type-utils';
import { isOperatorObject } from './condition-builder';
import { handleAnd, handleNot, handleOr } from './logical-operators';
import { getOperatorHandler } from './registry';

/** A fragment's bare names would resolve against the wrong row inside a relation filter, so it never compiles there */
function assertNoRaw(key: string): void {
  if (key === '$raw')
    throw new CerialValidationError(
      '$raw is not allowed in a relation filter; put the fragment in the where of the model that owns the field',
    );
}

/** Relation filter operators for array relations */
type RelationFilterOperator = 'some' | 'every' | 'none';

/** Check if a key is a relation filter operator */
function isRelationFilterOperator(key: string): key is RelationFilterOperator {
  return key === 'some' || key === 'every' || key === 'none';
}

/** Keys of an array-relation filter that state their own meaning, so they never fold into the `some` shorthand */
export function isExplicitArrayRelationKey(key: string): boolean {
  return isRelationFilterOperator(key) || key === 'isEmpty';
}

/**
 * Split an array-relation filter into its explicit keys (some, every, none, isEmpty) and the plain
 * target-field keys, which are shorthand for `some`. A bare AND, OR or NOT is neither: it stays
 * refused, because a quantifier decides what the operator ranges over.
 */
export function splitArrayRelationFilter(filter: Record<string, unknown>): {
  hasExplicit: boolean;
  plain: Record<string, unknown>;
} {
  const plain: Record<string, unknown> = {};
  let hasExplicit = false;

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;
    if (isExplicitArrayRelationKey(key)) hasExplicit = true;
    else if (key !== 'AND' && key !== 'OR' && key !== 'NOT') plain[key] = value;
  }

  return { hasExplicit, plain };
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
    assertNoRaw(fieldName);
    if (value === undefined) continue;

    // A logical operator inside a quantifier body composes sibling conditions on the same target
    // row, so each branch recurses here. Without this the key was skipped as an unknown field and
    // the quantifier silently matched more rows than asked for.
    if (fieldName === 'AND' && Array.isArray(value)) {
      conditions.push(handleAnd(value.map((w) => buildSubqueryConditions(ctx, w as WhereClause, targetModel))));
      continue;
    }

    if (fieldName === 'OR' && Array.isArray(value)) {
      conditions.push(handleOr(value.map((w) => buildSubqueryConditions(ctx, w as WhereClause, targetModel))));
      continue;
    }

    if (fieldName === 'NOT' && isObject(value)) {
      conditions.push(handleNot(buildSubqueryConditions(ctx, value, targetModel)));
      continue;
    }

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
function compileForwardNested(
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
    assertNoRaw(nestedField);
    if (value === undefined) continue;

    // Logical operators compose branches that are themselves relation filters, so each branch
    // recurses through this builder and comes back already prefixed with the foreign key path.
    // Branch shapes match the top level (condition-builder.ts): AND/OR take an array, NOT an object.
    if (nestedField === 'AND' && Array.isArray(value)) {
      conditions.push(
        handleAnd(value.map((w) => compileForwardNested(ctx, relationField, w as WhereClause, model, registry))),
      );
      continue;
    }

    if (nestedField === 'OR' && Array.isArray(value)) {
      conditions.push(
        handleOr(value.map((w) => compileForwardNested(ctx, relationField, w as WhereClause, model, registry))),
      );
      continue;
    }

    if (nestedField === 'NOT' && isObject(value)) {
      conditions.push(handleNot(compileForwardNested(ctx, relationField, value, model, registry)));
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
function compileReverseNested(
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

  // Plain target-field keys are shorthand for `some`. Mixing them with an explicit key is refused:
  // whether they join that key's body or stand as a second `some` is a guess, and on deleteMany a
  // wrong guess deletes the wrong parents.
  const { hasExplicit, plain } = splitArrayRelationFilter(nestedWhere);
  if (Object.keys(plain).length) {
    if (hasExplicit) {
      throw new CerialValidationError(
        `Relation filter on ${model.name}.${relationField.name} mixes the field keys ` +
          `${Object.keys(plain)
            .map((k) => `'${k}'`)
            .join(', ')} with some, every, none or isEmpty. ` +
          `Move the fields into a 'some' body.`,
      );
    }

    return compileReverseNested(ctx, relationField, { some: plain } as WhereClause, model, registry);
  }

  const conditions: QueryFragment[] = [];

  // Check for relation filter operators (some, every, none) and the existence check isEmpty
  for (const [key, value] of Object.entries(nestedWhere)) {
    assertNoRaw(key);
    if (value === undefined) continue;

    if (key === 'isEmpty') {
      if (typeof value !== 'boolean') {
        throw new CerialValidationError(
          `isEmpty on ${model.name}.${relationField.name} must be a boolean, received ${typeof value}.`,
        );
      }

      const membership = value ? 'NOT IN' : 'IN';
      conditions.push({
        text: `id ${membership} (SELECT VALUE ${foreignKeyField} FROM ${targetModel.tableName})`,
        vars: {},
      });
      continue;
    }

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
 * An empty fragment reads to every caller as "no filter was asked for", so the WHERE it belonged to
 * is dropped and the query scans the table. That is right for `{}` and wrong for a filter that had
 * keys but compiled to nothing (unknown fields, unusable relation metadata, a lone empty quantifier).
 * Every exported builder passes through here, so no entry point can return the silent empty case.
 */
function requireCompiled(
  fragment: QueryFragment,
  relationField: FieldMetadata,
  nestedWhere: WhereClause,
  model: ModelMetadata,
): QueryFragment {
  if (fragment.text) return fragment;

  const keys = Object.keys(nestedWhere).filter((k) => nestedWhere[k] !== undefined);
  if (!keys.length) return fragment;

  throw new CerialValidationError(
    `Relation filter on ${model.name}.${relationField.name} produced no conditions from ` +
      `${keys.map((k) => `'${k}'`).join(', ')}. Compiling it would drop the filter and match every row.`,
  );
}

/** Forward relation filter; throws when a non-empty filter compiles to nothing. */
export function buildForwardNestedCondition(
  ctx: FilterCompileContext,
  relationField: FieldMetadata,
  nestedWhere: WhereClause,
  model: ModelMetadata,
  registry: ModelRegistry,
): QueryFragment {
  return requireCompiled(
    compileForwardNested(ctx, relationField, nestedWhere, model, registry),
    relationField,
    nestedWhere,
    model,
  );
}

/** Reverse relation filter; throws when a non-empty filter compiles to nothing. */
export function buildReverseNestedCondition(
  ctx: FilterCompileContext,
  relationField: FieldMetadata,
  nestedWhere: WhereClause,
  model: ModelMetadata,
  registry: ModelRegistry,
): QueryFragment {
  return requireCompiled(
    compileReverseNested(ctx, relationField, nestedWhere, model, registry),
    relationField,
    nestedWhere,
    model,
  );
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
    return requireCompiled({ text: '', vars: {} }, relationField, nestedWhere, model);
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
