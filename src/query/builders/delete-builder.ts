/**
 * DELETE query builder
 */

import type { CompiledQuery } from '../compile/types';
import type { ModelMetadata, WhereClause } from '../../types';
import { transformWhereClause } from '../filters/transformer';

/** Build DELETE query */
export function buildDeleteQuery(
  model: ModelMetadata,
  where: WhereClause,
): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build query
  const parts = [
    `DELETE FROM ${model.tableName}`,
    whereClause.text,
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}

/** Build DELETE query with RETURN */
export function buildDeleteQueryWithReturn(
  model: ModelMetadata,
  where: WhereClause,
): CompiledQuery {
  // Build WHERE clause
  const whereClause = transformWhereClause(where, model);

  // Build query with RETURN BEFORE to get deleted records
  const parts = [
    `DELETE FROM ${model.tableName}`,
    whereClause.text,
    'RETURN BEFORE',
  ].filter((p) => p);

  return {
    text: parts.join(' '),
    vars: whereClause.vars,
  };
}
