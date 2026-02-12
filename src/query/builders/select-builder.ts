/**
 * SELECT query builder
 */

import { getUniqueFields } from '../../parser/model-metadata';
import type {
  FieldMetadata,
  FindOptions,
  FindUniqueOptions,
  ModelMetadata,
  ModelRegistry,
  OrderByClause,
  SelectClause,
  WhereClause,
} from '../../types';
import type { CompiledQuery } from '../compile/types';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { combineSelectWithIncludes, type IncludeClause } from './relation-builder';

/** Extended find options with include support */
export interface FindOptionsWithInclude extends FindOptions {
  include?: IncludeClause;
}

/** Extended find unique options with include support */
export interface FindUniqueOptionsWithInclude extends FindUniqueOptions {
  include?: IncludeClause;
}

/**
 * Build destructuring select for an object field.
 * { city: true, zipCode: true } → 'address.{ city, zipCode }'
 * { lat: true, label: { city: true } } → 'location.{ lat, label.{ city } }'
 */
function buildObjectSelect(fieldPath: string, selectValue: Record<string, unknown>): string {
  const subFields: string[] = [];

  for (const [key, val] of Object.entries(selectValue)) {
    if (!val) continue;

    if (val === true) {
      subFields.push(key);
    } else if (typeof val === 'object' && val !== null) {
      // Nested object sub-select
      const inner = buildObjectSelectInner(key, val as Record<string, unknown>);
      if (inner) subFields.push(inner);
    }
  }

  if (!subFields.length) return fieldPath;

  return `${fieldPath}.{ ${subFields.join(', ')} }`;
}

/** Build inner destructuring (no outer field path prefix) */
function buildObjectSelectInner(fieldName: string, selectValue: Record<string, unknown>): string {
  const subFields: string[] = [];

  for (const [key, val] of Object.entries(selectValue)) {
    if (!val) continue;

    if (val === true) {
      subFields.push(key);
    } else if (typeof val === 'object' && val !== null) {
      const inner = buildObjectSelectInner(key, val as Record<string, unknown>);
      if (inner) subFields.push(inner);
    }
  }

  if (!subFields.length) return fieldName;

  return `${fieldName}.{ ${subFields.join(', ')} }`;
}

/** Build SELECT field list */
export function buildSelectFields(
  select: SelectClause | undefined,
  model: ModelMetadata,
  include?: IncludeClause,
  registry?: ModelRegistry,
): string {
  let baseSelect: string;

  if (!select) {
    baseSelect = '*';
  } else {
    const fields = Object.entries(select)
      .filter(([_, include]) => include)
      .map(([field, selectValue]) => {
        // Object sub-field select: { address: { city: true } }
        if (typeof selectValue === 'object' && selectValue !== null) {
          return buildObjectSelect(field, selectValue as Record<string, unknown>);
        }
        // Boolean true: select entire field
        return field;
      });

    baseSelect = fields.length === 0 ? '*' : fields.join(', ');
  }

  // Add relation fields from include
  if (include) {
    return combineSelectWithIncludes(baseSelect, include, model, registry);
  }

  return baseSelect;
}

/** Recursively build order by parts with dot notation */
function buildOrderByParts(prefix: string, orderBy: Record<string, unknown>, parts: string[]): void {
  for (const [field, directionOrNested] of Object.entries(orderBy)) {
    const path = prefix ? `${prefix}.${field}` : field;

    if (typeof directionOrNested === 'string') {
      parts.push(`${path} ${directionOrNested.toUpperCase()}`);
    } else if (typeof directionOrNested === 'object' && directionOrNested !== null) {
      // Recursive: nested object or relation ordering
      buildOrderByParts(path, directionOrNested as Record<string, unknown>, parts);
    }
  }
}

/** Build ORDER BY clause - supports nested relation/object ordering like { author: { name: 'asc' } } */
export function buildOrderBy(orderBy: OrderByClause | undefined): string {
  if (!orderBy) return '';

  const parts: string[] = [];
  buildOrderByParts('', orderBy as Record<string, unknown>, parts);

  if (!parts.length) return '';

  return `ORDER BY ${parts.join(', ')}`;
}

/** Build LIMIT clause */
export function buildLimit(limit: number | undefined): string {
  if (limit === undefined) return '';
  return `LIMIT ${limit}`;
}

/** Build OFFSET/START clause */
export function buildOffset(offset: number | undefined): string {
  if (offset === undefined) return '';
  return `START ${offset}`;
}

/** Build a complete SELECT query */
export function buildSelectQuery(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  fromSingle: boolean = false,
  registry?: ModelRegistry,
): CompiledQuery {
  const { where, select, orderBy, limit, offset, include } = options;

  const fields = buildSelectFields(select, model, include, registry);
  const whereClause = transformWhereClause(where, model, registry);
  const orderByClause = buildOrderBy(orderBy);
  const limitClause = buildLimit(limit);
  const offsetClause = buildOffset(offset);

  // Build query parts
  const parts = [
    `SELECT ${fields} ${fromSingle ? 'FROM ONLY' : 'FROM'} ${model.tableName}`,
    whereClause.text,
    orderByClause,
    limitClause,
    offsetClause,
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build a findOne SELECT query (LIMIT 1) */
export function buildFindOneQuery(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  return buildSelectQuery(model, { ...options, limit: 1 }, true, registry);
}

/** Build a findMany SELECT query */
export function buildFindManyQuery(
  model: ModelMetadata,
  options: FindOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  return buildSelectQuery(model, options, false, registry);
}

/** Build a SELECT count() ... GROUP ALL query */
export function buildCountQuery(
  model: ModelMetadata,
  where: WhereClause | undefined,
  registry?: ModelRegistry,
): CompiledQuery {
  const whereClause = transformWhereClause(where, model, registry);

  const parts = [`SELECT count() FROM ${model.tableName}`, whereClause.text, 'GROUP ALL'].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/**
 * Check if a composite unique key is present in the where clause.
 * A composite key is present when the where clause has a property matching
 * a @@unique directive name, with an object value containing the composite fields.
 */
export function findCompositeUniqueKey(
  where: WhereClause,
  model: ModelMetadata,
): { name: string; fields: string[]; values: Record<string, unknown> } | null {
  const compositeUniques = (model.compositeDirectives ?? []).filter((d) => d.kind === 'unique');

  for (const directive of compositeUniques) {
    const compositeValue = where[directive.name];
    if (compositeValue && typeof compositeValue === 'object' && !Array.isArray(compositeValue)) {
      return {
        name: directive.name,
        fields: directive.fields,
        values: compositeValue as Record<string, unknown>,
      };
    }
  }

  return null;
}

/**
 * Expand composite unique keys in a where clause into flat field conditions.
 * Removes the composite key name from the where clause and injects the individual fields.
 *
 * For example: { compositeKeyName: { field1: 'a', field2: 'b' }, isActive: true }
 * Becomes:     { field1: 'a', field2: 'b', isActive: true }
 *
 * For dot-notation fields (address.city), the nested structure is preserved:
 * { compositeKeyName: { address: { city: 'NYC' }, name: 'Alice' } }
 * Becomes: { 'address.city': 'NYC', name: 'Alice' }
 */
export function expandCompositeKey(where: WhereClause, model: ModelMetadata): WhereClause {
  const composite = findCompositeUniqueKey(where, model);
  if (!composite) return where;

  // Remove the composite key name from the where clause
  const expanded: WhereClause = { ...where };
  delete expanded[composite.name];

  // Flatten the composite key values into dot-notation fields
  const directive = (model.compositeDirectives ?? []).find((d) => d.name === composite.name);
  if (!directive) return expanded;

  for (const fieldRef of directive.fields) {
    const parts = fieldRef.split('.');

    if (parts.length === 1) {
      // Simple field: extract directly from composite values
      expanded[fieldRef] = composite.values[fieldRef];
    } else {
      // Dot-notation field: extract from nested structure
      // e.g., for "address.city", walk composite.values.address.city
      let current: unknown = composite.values;
      for (const part of parts) {
        if (current && typeof current === 'object' && !Array.isArray(current)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      // Store with dot notation key — the condition builder will handle it
      expanded[fieldRef] = current;
    }
  }

  return expanded;
}

/**
 * Validate at least one unique field or composite unique key is present in where clause
 * @param where - The where clause to validate
 * @param model - The model metadata
 * @param methodName - The method name for error messages (default: 'findUnique')
 * @throws Error if no unique field is present
 */
export function validateUniqueField(where: WhereClause, model: ModelMetadata, methodName = 'findUnique'): void {
  // Check for composite unique key first
  if (findCompositeUniqueKey(where, model)) return;

  const idField = model.fields.find((f) => f.isId);
  const uniqueFields = getUniqueFields(model);
  const allUniqueFields = idField ? [idField, ...uniqueFields.filter((f) => !f.isId)] : uniqueFields;

  // Find which unique fields are present (as direct values, not operators)
  const providedFields = allUniqueFields.filter((f) => !!where[f.name]);

  // Validation: at least one unique field required
  if (!providedFields.length) {
    const fieldNames = allUniqueFields.map((f) => f.name).join(', ');
    const compositeNames = (model.compositeDirectives ?? []).filter((d) => d.kind === 'unique').map((d) => d.name);
    const compositeHint = compositeNames.length
      ? ` Available composite unique keys: ${compositeNames.join(', ')}.`
      : '';
    throw new Error(
      `At least one unique field must be provided in where clause for ${methodName}. ` +
        `Available unique fields: ${fieldNames}.${compositeHint}`,
    );
  }
}

/** @deprecated Use validateUniqueField instead */
function hasUniqueField(where: WhereClause, model: ModelMetadata): void {
  validateUniqueField(where, model, 'findUnique');
}

/** Build findUnique query when ID is provided (uses FROM ONLY table:id) */
function buildFindUniqueByIdQuery(
  model: ModelMetadata,
  where: WhereClause,
  select: SelectClause | undefined,
  idField: FieldMetadata,
  include?: IncludeClause,
  registry?: ModelRegistry,
): CompiledQuery {
  const idValue = where[idField.name] as string;
  const recordId = transformOrValidateRecordId(model.tableName, idValue);

  // Remove ONLY id from where clause (keep other unique fields + non-unique fields)
  const whereWithoutId = { ...where };
  delete whereWithoutId[idField.name];

  const fields = buildSelectFields(select, model, include, registry);
  const whereClause = transformWhereClause(Object.keys(whereWithoutId).length ? whereWithoutId : undefined, model);
  const limitClause = buildLimit(1);

  const parts = [`SELECT ${fields} FROM ONLY ${recordId.toString()}`, whereClause.text, limitClause].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build a findUnique SELECT query using RecordId or unique fields */
export function buildFindUniqueQuery(
  model: ModelMetadata,
  options: FindUniqueOptionsWithInclude,
  registry?: ModelRegistry,
): CompiledQuery {
  const { where, select, include } = options;

  // Validate at least one unique field is present
  hasUniqueField(where, model);

  // Expand composite unique keys before processing
  const expandedWhere = expandCompositeKey(where, model);

  // Determine query strategy based on ID presence
  const idField = model.fields.find((f) => f.isId);
  const hasId = idField && expandedWhere[idField.name] !== undefined && expandedWhere[idField.name] !== null;

  if (hasId) {
    // Use FROM ONLY table:id (optimized)
    return buildFindUniqueByIdQuery(model, expandedWhere, select, idField!, include, registry);
  }

  // Use FROM ONLY tableName (reuse existing buildFindOneQuery)
  return buildFindOneQuery(model, { where: expandedWhere, select, include }, registry);
}
