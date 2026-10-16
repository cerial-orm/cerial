/**
 * Relation query builder - builds SELECT fields for relations
 * Supports nested includes for recursive relation fetching
 */

import { CerialUnknownFieldError, CerialValidationError } from '../../errors';
import type { FieldMetadata, ModelMetadata, ModelRegistry, OrderByClause } from '../../types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { validationFailure } from '../validators/failure';
import { validateOrderBy, validatePagination } from '../validators/select-validator';
import { buildOrderByPlan } from './select-builder';

/** Include options for a relation */
export interface IncludeOptions {
  select?: Record<string, boolean>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  limit?: number;
  offset?: number;
  include?: Record<string, boolean | IncludeOptions>;
}

/** Include clause type */
export type IncludeClause = Record<string, boolean | IncludeOptions>;

/**
 * Find the Record field in target model that references the source model
 * Used for reverse relations to find which field to query on
 * @param key - Optional @key value to match when multiple relations exist
 */
function findReverseSourceField(
  sourceModel: ModelMetadata,
  targetModel: ModelMetadata,
  key?: string,
): string | undefined {
  // Look for a forward Relation in target that targets our source model
  // If key is provided, must match the key
  for (const targetField of targetModel.fields) {
    if (targetField.type !== 'relation' || targetField.relationInfo?.isReverse) continue;
    if (targetField.relationInfo?.targetModel === sourceModel.name && targetField.relationInfo?.fieldRef) {
      // If key is specified, only match relations with the same key
      if (key && targetField.relationInfo?.key !== key) continue;

      return targetField.relationInfo.fieldRef;
    }
  }

  // Fallback: look for a Record field whose paired relation targets source model
  for (const targetField of targetModel.fields) {
    if (targetField.type !== 'record') continue;

    const pairedRelation = targetModel.fields.find(
      (rel) =>
        rel.type === 'relation' &&
        rel.relationInfo?.fieldRef === targetField.name &&
        rel.relationInfo?.targetModel === sourceModel.name &&
        (!key || rel.relationInfo?.key === key),
    );

    if (pairedRelation) return targetField.name;
  }

  return undefined;
}

/**
 * Build nested include fields for a subquery
 * Returns the SELECT fields string for nested relations
 */
function buildNestedSelectFields(
  nestedInclude: IncludeClause | undefined,
  targetModel: ModelMetadata,
  registry: ModelRegistry,
  ctx?: FilterCompileContext,
): string {
  if (!nestedInclude) return '*';

  const nestedFields = buildRelationSelectFieldsInternal(nestedInclude, targetModel, registry, ctx);
  if (!nestedFields.length) return '*';

  return `*, ${nestedFields.join(', ')}`;
}

/**
 * Build the subquery behind an included relation.
 *
 * The include `orderBy`, `limit` and `offset` are checked against the target model first: they come
 * from the caller and end up in query text, so an unknown key must never get that far. Relation
 * sort keys are projected to an alias on an inner query and dropped again by the outer one, the
 * same shape top-level `orderBy` uses.
 */
function buildIncludeSubquery(
  relationName: string,
  selectFields: string,
  table: string,
  condition: string,
  options: IncludeOptions | undefined,
  targetModel: ModelMetadata,
  registry: ModelRegistry,
  ctx?: FilterCompileContext,
): string {
  if (options?.where && !ctx) {
    throw new CerialValidationError(
      `Invalid include: 'where' in include '${relationName}' needs a filter compile context, and none was supplied`,
      { model: targetModel.name, field: relationName, operation: 'include' },
    );
  }

  const checks = [
    ['orderBy', validateOrderBy(options?.orderBy, targetModel, registry)],
    ['limit/offset', validatePagination(options?.limit, options?.offset)],
  ] as const;

  for (const [context, errors] of checks) {
    if (errors.length)
      throw validationFailure(`${context} in include '${relationName}'`, errors, targetModel, 'include');
  }

  const plan = buildOrderByPlan(options?.orderBy as OrderByClause | undefined, targetModel, registry);
  const select = plan.projections.length ? `${selectFields}, ${plan.projections.join(', ')}` : selectFields;
  const inner = [
    `SELECT ${select} FROM ${table} WHERE ${condition}`,
    plan.clause,
    buildSubqueryLimit(options?.limit).trim(),
    buildSubqueryOffset(options?.offset).trim(),
  ]
    .filter((p) => p)
    .join(' ');

  return plan.projections.length ? `SELECT * OMIT ${plan.aliases.join(', ')} FROM (${inner})` : inner;
}

/** Build LIMIT clause for subqueries */
function buildSubqueryLimit(limit: number | undefined): string {
  if (limit === undefined) return '';

  return ` LIMIT ${limit}`;
}

/** Build START (offset) clause for subqueries */
function buildSubqueryOffset(offset: number | undefined): string {
  if (offset === undefined) return '';

  return ` START ${offset}`;
}

/**
 * Build a single forward relation select field with nested include support
 * Forward relation uses subquery when nested includes are present
 */
function buildForwardRelationSelectInternal(
  field: FieldMetadata,
  options: IncludeOptions | undefined,
  registry: ModelRegistry,
  ctx?: FilterCompileContext,
): string {
  if (!field.relationInfo || !field.relationInfo.fieldRef) {
    return '';
  }

  const fieldRef = field.relationInfo.fieldRef;
  const targetModel = registry[field.relationInfo.targetModel];
  const targetTable = field.relationInfo.targetTable;

  // Check for nested includes, orderBy, limit, or offset
  const needsSubquery =
    options?.include || options?.orderBy || options?.limit !== undefined || options?.offset !== undefined;

  if (needsSubquery && targetModel) {
    const nestedSelect = options?.include ? buildNestedSelectFields(options.include, targetModel, registry, ctx) : '*';

    // Use subquery to fetch related record with nested includes/ordering/pagination
    if (field.isArray) {
      const sub = buildIncludeSubquery(
        field.name,
        nestedSelect,
        targetTable,
        `id INSIDE $parent.${fieldRef}`,
        options,
        targetModel,
        registry,
        ctx,
      );

      return `(${sub}) AS ${field.name}`;
    }

    const sub = buildIncludeSubquery(
      field.name,
      nestedSelect,
      targetTable,
      `id = $parent.${fieldRef}`,
      options,
      targetModel,
      registry,
      ctx,
    );

    return `(${sub})[0] AS ${field.name}`;
  }

  // No nested includes or orderBy - use simple dot notation
  return `${fieldRef}.* AS ${field.name}`;
}

/**
 * Build a single reverse relation select field with nested include support
 * Reverse relations use subquery to find records that reference the current record
 */
function buildReverseRelationSelectInternal(
  field: FieldMetadata,
  currentModel: ModelMetadata,
  registry: ModelRegistry,
  options?: IncludeOptions,
  ctx?: FilterCompileContext,
): string {
  if (!field.relationInfo || !field.relationInfo.isReverse) {
    return '';
  }

  const targetModel = registry[field.relationInfo.targetModel];
  if (!targetModel) return '';

  // Pass the key to differentiate when multiple relations exist to the same model
  const key = field.relationInfo.key;
  const sourceFieldName = findReverseSourceField(currentModel, targetModel, key);
  if (!sourceFieldName) return '';

  const targetTable = field.relationInfo.targetTable;

  // Build nested select fields if nested includes are present
  const selectFields = options?.include ? buildNestedSelectFields(options.include, targetModel, registry, ctx) : '*';

  // Build subquery using $parent to reference the outer record
  const sub = buildIncludeSubquery(
    field.name,
    selectFields,
    targetTable,
    `${sourceFieldName} = $parent.id`,
    options,
    targetModel,
    registry,
    ctx,
  );

  return field.isArray ? `(${sub}) AS ${field.name}` : `(${sub})[0] AS ${field.name}`;
}

/**
 * Internal function to build SELECT fields for included relations
 * Supports recursive nested includes
 */
function buildRelationSelectFieldsInternal(
  include: IncludeClause,
  model: ModelMetadata,
  registry: ModelRegistry,
  ctx?: FilterCompileContext,
): string[] {
  const fields: string[] = [];

  for (const [relationName, includeValue] of Object.entries(include)) {
    // Find the relation field
    const relationField = model.fields.find((f) => f.name === relationName && f.type === 'relation' && f.relationInfo);

    if (!relationField) {
      const known = model.fields.find((f) => f.name === relationName);
      if (!known) {
        throw new CerialUnknownFieldError(
          `Invalid include: Unknown field '${relationName}' on model ${model.name} — check the field name against the schema`,
          { model: model.name, field: relationName, operation: 'include' },
        );
      }

      throw new CerialValidationError(
        `Invalid include: '${relationName}' on model ${model.name} is a ${known.type} field, not a relation — only relation fields can be included`,
        { model: model.name, field: relationName, operation: 'include' },
      );
    }

    if (!includeValue) continue;

    const options = typeof includeValue === 'object' ? includeValue : undefined;

    if (relationField.relationInfo!.isReverse) {
      const selectField = buildReverseRelationSelectInternal(relationField, model, registry, options, ctx);
      if (selectField) fields.push(selectField);
    } else {
      const selectField = buildForwardRelationSelectInternal(relationField, options, registry, ctx);
      if (selectField) fields.push(selectField);
    }
  }

  return fields;
}

/** Build a single forward relation select field (public API - backwards compatible) */
export function buildForwardRelationSelect(field: FieldMetadata, _options?: IncludeOptions): string {
  if (!field.relationInfo || !field.relationInfo.fieldRef) {
    return '';
  }

  // Without registry, can't do nested includes
  return `${field.relationInfo.fieldRef}.* AS ${field.name}`;
}

/** Build a single reverse relation select field (public API - backwards compatible) */
export function buildReverseRelationSelect(
  field: FieldMetadata,
  currentModel: ModelMetadata,
  registry: ModelRegistry,
  options?: IncludeOptions,
): string {
  return buildReverseRelationSelectInternal(field, currentModel, registry, options);
}

/** Build SELECT fields for all included relations
 * @param include - Include clause specifying which relations to include
 * @param model - Current model metadata
 * @param registry - Full model registry for reverse relations and nested includes
 * @param ctx - Compile context for an include `where`; without one, an include `where` throws
 */
export function buildRelationSelectFields(
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
  ctx?: FilterCompileContext,
): string[] {
  if (!include || !registry) return [];

  return buildRelationSelectFieldsInternal(include, model, registry, ctx);
}

/** Combine base select fields with relation fields */
export function combineSelectWithIncludes(
  baseSelect: string,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
  ctx?: FilterCompileContext,
): string {
  if (!registry) {
    if (include && Object.values(include).some(Boolean)) {
      throw new CerialValidationError('Invalid include: a model registry is required to resolve includes', {
        model: model.name,
        operation: 'include',
      });
    }

    return baseSelect;
  }

  const relationFields = buildRelationSelectFields(include, model, registry, ctx);

  if (!relationFields.length) {
    return baseSelect;
  }

  // If base is *, combine as *, relationField1, relationField2
  if (baseSelect === '*') {
    return `*, ${relationFields.join(', ')}`;
  }

  // Otherwise combine selected fields with relation fields
  return `${baseSelect}, ${relationFields.join(', ')}`;
}
