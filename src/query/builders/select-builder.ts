/**
 * SELECT query builder
 */

import type { FindOptions, FindUniqueOptions, ModelMetadata, OrderByClause, SelectClause } from '../../types';
import type { CompiledQuery } from '../compile/types';
import { transformWhereClause } from '../filters/transformer';
import { transformOrValidateRecordId } from '../transformers';

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

/** Build a findUnique SELECT query using RecordId */
export function buildFindUniqueQuery(model: ModelMetadata, options: FindUniqueOptions): CompiledQuery {
  const { where, select } = options;

  // Extract id value from where clause
  const idValue = where?.id;
  if (!idValue) throw new Error('id is required in where clause for findUnique');

  // Transform or validate RecordId using helper
  const recordId = transformOrValidateRecordId(model.tableName, idValue);

  // Remove 'id' from where clause since it's in RecordId
  const { id: _id, ...whereWithoutId } = where;

  const fields = buildSelectFields(select, model);
  const whereClause = transformWhereClause(Object.keys(whereWithoutId).length ? whereWithoutId : undefined, model);
  const limitClause = buildLimit(1);

  // Build query parts using ONLY and RecordId
  const parts = [`SELECT ${fields} FROM ONLY ${recordId.toString()}`, whereClause.text, limitClause].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}
