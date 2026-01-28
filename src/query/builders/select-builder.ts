/**
 * SELECT query builder
 */

import type {
  FieldMetadata,
  FindOptions,
  FindUniqueOptions,
  ModelMetadata,
  OrderByClause,
  SelectClause,
  WhereClause,
} from '../../types';
import type { CompiledQuery } from '../compile/types';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';
import { getUniqueFields } from '../../parser/model-metadata';

/** Build SELECT field list */
export function buildSelectFields(select: SelectClause | undefined, model: ModelMetadata): string {
  if (!select) return '*';

  const fields = Object.entries(select)
    .filter(([_, include]) => include)
    .map(([field]) => field);

  if (fields.length === 0) return '*';

  return fields.join(', ');
}

/** Build ORDER BY clause */
export function buildOrderBy(orderBy: OrderByClause | undefined): string {
  if (!orderBy) return '';

  const parts = Object.entries(orderBy).map(([field, direction]) => {
    return `${field} ${direction.toUpperCase()}`;
  });

  if (parts.length === 0) return '';

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
  options: FindOptions,
  fromSingle: boolean = false,
): CompiledQuery {
  const { where, select, orderBy, limit, offset } = options;

  const fields = buildSelectFields(select, model);
  const whereClause = transformWhereClause(where, model);
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
export function buildFindOneQuery(model: ModelMetadata, options: FindOptions): CompiledQuery {
  return buildSelectQuery(model, { ...options, limit: 1 }, true);
}

/** Build a findMany SELECT query */
export function buildFindManyQuery(model: ModelMetadata, options: FindOptions): CompiledQuery {
  return buildSelectQuery(model, options);
}

/** Validate at least one unique field is present in where clause */
function hasUniqueField(where: WhereClause, model: ModelMetadata): void {
  const idField = model.fields.find((f) => f.isId);
  const uniqueFields = getUniqueFields(model);
  const allUniqueFields = idField ? [idField, ...uniqueFields.filter((f) => !f.isId)] : uniqueFields;

  // Find which unique fields are present (as direct values, not operators)
  const providedFields = allUniqueFields.filter((f) => !!where[f.name]);

  // Validation: at least one unique field required
  if (providedFields.length === 0) {
    const fieldNames = allUniqueFields.map((f) => f.name).join(', ');
    throw new Error(
      `At least one unique field must be provided in where clause for findUnique. ` +
        `Available unique fields: ${fieldNames}`,
    );
  }
}

/** Build findUnique query when ID is provided (uses FROM ONLY table:id) */
function buildFindUniqueByIdQuery(
  model: ModelMetadata,
  where: WhereClause,
  select: SelectClause | undefined,
  idField: FieldMetadata,
): CompiledQuery {
  const idValue = where[idField.name] as string;
  const recordId = transformOrValidateRecordId(model.tableName, idValue);

  // Remove ONLY id from where clause (keep other unique fields + non-unique fields)
  const whereWithoutId = { ...where };
  delete whereWithoutId[idField.name];

  const fields = buildSelectFields(select, model);
  const whereClause = transformWhereClause(Object.keys(whereWithoutId).length ? whereWithoutId : undefined, model);
  const limitClause = buildLimit(1);

  const parts = [`SELECT ${fields} FROM ONLY ${recordId.toString()}`, whereClause.text, limitClause].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build a findUnique SELECT query using RecordId or unique fields */
export function buildFindUniqueQuery(model: ModelMetadata, options: FindUniqueOptions): CompiledQuery {
  const { where, select } = options;

  // Validate at least one unique field is present
  hasUniqueField(where, model);

  // Determine query strategy based on ID presence
  const idField = model.fields.find((f) => f.isId);
  const hasId = idField && where[idField.name] !== undefined && where[idField.name] !== null;

  if (hasId) {
    // Use FROM ONLY table:id (optimized)
    return buildFindUniqueByIdQuery(model, where, select, idField!);
  }

  // Use FROM ONLY tableName (reuse existing buildFindOneQuery)
  return buildFindOneQuery(model, { where, select });
}
