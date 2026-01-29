/**
 * Relation query builder - builds SELECT fields for relations
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

/** Build a single forward relation select field
 * Forward relation uses dot notation: fieldRef.* AS relationName
 * Example: profileId.* AS profile
 */
export function buildForwardRelationSelect(field: FieldMetadata, _options?: IncludeOptions): string {
  if (!field.relationInfo || !field.relationInfo.fieldRef) {
    return '';
  }

  const fieldRef = field.relationInfo.fieldRef;

  // For array relations with limit
  // if (options?.limit !== undefined) {
  //   return `${fieldRef}[0:${options.limit}].* AS ${field.name}`;
  // }

  // Basic forward relation: fieldRef.* AS relationName
  return `${fieldRef}.* AS ${field.name}`;
}

/** Build a single reverse relation select field
 * Reverse relation uses <~ syntax: <~sourceTable AS relationName
 * Example: <~user AS user (for profile looking up which user references it)
 */
export function buildReverseRelationSelect(field: FieldMetadata, _options?: IncludeOptions): string {
  if (!field.relationInfo || !field.relationInfo.isReverse) {
    return '';
  }

  // Reverse relation: <~targetTable AS relationName
  // The targetTable is where the Record field that points to us lives
  return `<-${field.relationInfo.targetTable} AS ${field.name}`;
}

/** Build SELECT fields for all included relations
 * @param include - Include clause specifying which relations to include
 * @param model - Current model metadata
 * @param _registry - Full model registry for nested includes
 */
export function buildRelationSelectFields(
  include: IncludeClause | undefined,
  model: ModelMetadata,
  _registry?: ModelRegistry,
): string[] {
  if (!include) return [];

  const fields: string[] = [];

  for (const [relationName, includeValue] of Object.entries(include)) {
    if (!includeValue) continue;

    // Find the relation field
    const relationField = model.fields.find((f) => f.name === relationName && f.type === 'relation' && f.relationInfo);

    if (!relationField) continue;

    const options = typeof includeValue === 'object' ? includeValue : undefined;

    if (relationField.relationInfo!.isReverse) {
      const selectField = buildReverseRelationSelect(relationField, options);
      if (selectField) fields.push(selectField);
    } else {
      const selectField = buildForwardRelationSelect(relationField, options);
      if (selectField) fields.push(selectField);
    }
  }

  return fields;
}

/** Combine base select fields with relation fields */
export function combineSelectWithIncludes(
  baseSelect: string,
  include: IncludeClause | undefined,
  model: ModelMetadata,
  registry?: ModelRegistry,
): string {
  const relationFields = buildRelationSelectFields(include, model, registry);

  if (relationFields.length === 0) {
    return baseSelect;
  }

  // If base is *, combine as *, relationField1, relationField2
  if (baseSelect === '*') {
    return `*, ${relationFields.join(', ')}`;
  }

  // Otherwise combine selected fields with relation fields
  return `${baseSelect}, ${relationFields.join(', ')}`;
}
