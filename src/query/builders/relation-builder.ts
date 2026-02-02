/**
 * Relation query builder - builds SELECT fields for relations
 * Supports nested includes for recursive relation fetching
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../types';

/** Include options for a relation */
export interface IncludeOptions {
  select?: Record<string, boolean>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
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
function findReverseSourceField(sourceModel: ModelMetadata, targetModel: ModelMetadata, key?: string): string | undefined {
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
): string {
  if (!nestedInclude) return '*';

  const nestedFields = buildRelationSelectFieldsInternal(nestedInclude, targetModel, registry);
  if (!nestedFields.length) return '*';

  return `*, ${nestedFields.join(', ')}`;
}

/** Build ORDER BY clause for subqueries */
function buildSubqueryOrderBy(orderBy: Record<string, 'asc' | 'desc'> | undefined): string {
  if (!orderBy) return '';

  const parts = Object.entries(orderBy).map(([field, direction]) => `${field} ${direction.toUpperCase()}`);

  return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
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
): string {
  if (!field.relationInfo || !field.relationInfo.fieldRef) {
    return '';
  }

  const fieldRef = field.relationInfo.fieldRef;
  const targetModel = registry[field.relationInfo.targetModel];
  const targetTable = field.relationInfo.targetTable;

  // Check for nested includes, orderBy, limit, or offset
  const needsSubquery = options?.include || options?.orderBy || options?.limit !== undefined || options?.offset !== undefined;

  if (needsSubquery && targetModel) {
    const nestedSelect = options?.include ? buildNestedSelectFields(options.include, targetModel, registry) : '*';
    const orderByClause = buildSubqueryOrderBy(options?.orderBy);
    const limitClause = buildSubqueryLimit(options?.limit);
    const offsetClause = buildSubqueryOffset(options?.offset);

    // Use subquery to fetch related record with nested includes/ordering/pagination
    if (field.isArray) {
      return `(SELECT ${nestedSelect} FROM ${targetTable} WHERE id INSIDE $parent.${fieldRef}${orderByClause}${limitClause}${offsetClause}) AS ${field.name}`;
    }

    return `(SELECT ${nestedSelect} FROM ${targetTable} WHERE id = $parent.${fieldRef}${orderByClause}${limitClause}${offsetClause})[0] AS ${field.name}`;
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
  const selectFields = options?.include ? buildNestedSelectFields(options.include, targetModel, registry) : '*';
  const orderByClause = buildSubqueryOrderBy(options?.orderBy);
  const limitClause = buildSubqueryLimit(options?.limit);
  const offsetClause = buildSubqueryOffset(options?.offset);

  // Build subquery using $parent to reference the outer record
  if (field.isArray) {
    return `(SELECT ${selectFields} FROM ${targetTable} WHERE ${sourceFieldName} = $parent.id${orderByClause}${limitClause}${offsetClause}) AS ${field.name}`;
  }

  return `(SELECT ${selectFields} FROM ${targetTable} WHERE ${sourceFieldName} = $parent.id${orderByClause}${limitClause}${offsetClause})[0] AS ${field.name}`;
}

/**
 * Internal function to build SELECT fields for included relations
 * Supports recursive nested includes
 */
function buildRelationSelectFieldsInternal(
  include: IncludeClause,
  model: ModelMetadata,
  registry: ModelRegistry,
): string[] {
  const fields: string[] = [];

  for (const [relationName, includeValue] of Object.entries(include)) {
    if (!includeValue) continue;

    // Find the relation field
    const relationField = model.fields.find((f) => f.name === relationName && f.type === 'relation' && f.relationInfo);

    if (!relationField) continue;

    const options = typeof includeValue === 'object' ? includeValue : undefined;

    if (relationField.relationInfo!.isReverse) {
      const selectField = buildReverseRelationSelectInternal(relationField, model, registry, options);
      if (selectField) fields.push(selectField);
    } else {
      const selectField = buildForwardRelationSelectInternal(relationField, options, registry);
      if (selectField) fields.push(selectField);
    }
  }

  return fields;
}

/** Build a single forward relation select field (public API - backwards compatible) */
export function buildForwardRelationSelect(field: FieldMetadata, options?: IncludeOptions): string {
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
 */
export function buildRelationSelectFields(
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): string[] {
  if (!include || !registry) return [];

  return buildRelationSelectFieldsInternal(include, model, registry);
}

/** Combine base select fields with relation fields */
export function combineSelectWithIncludes(
  baseSelect: string,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): string {
  if (!registry) {
    return baseSelect;
  }

  const relationFields = buildRelationSelectFields(include, model, registry);

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
