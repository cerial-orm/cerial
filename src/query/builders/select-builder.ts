/**
 * SELECT query builder
 */

import type { CompiledQuery } from '../compile/types';
import type { ModelMetadata, FindOptions, SelectClause, OrderByClause } from '../../types';
import { transformWhereClause } from '../filters/transformer';

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
