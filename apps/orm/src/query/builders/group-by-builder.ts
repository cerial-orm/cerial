/**
 * `groupBy` query builder.
 *
 * Expects arguments that passed `validateGroupBy`: every name below is a field the model declares, and
 * each is still passed through `quoteSubKey`. Only `where` values reach the query as bindings; limit and
 * offset are validated integers, as in findMany.
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../types';
import { quoteSubKey } from '../../utils/string-utils';
import type { CompiledQuery } from '../compile/types';
import { transformWhereClause } from '../filters/transformer';
import {
  GROUP_BY_AGGREGATES,
  GROUP_BY_ALL,
  groupByCountFields,
  type GroupByAggregate,
  type GroupByArgs,
  type GroupByKeys,
} from '../validators/group-by-validator';
import { buildLimit, buildOffset } from './select-builder';

/** Group keys as dotted paths, in the order the caller wrote them: `{ a: true, b: { c: true } }` gives `a`, `b.c`. */
function keyPaths(keys: GroupByKeys, prefix = ''): string[] {
  return Object.entries(keys).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${quoteSubKey(key)}` : quoteSubKey(key);

    return value === true ? [path] : keyPaths(value, path);
  });
}

/** `count(f)` alone counts truthy values and misses 0 and false, so presence is tested explicitly. */
const present = (field: string): string => `count(${field} != NONE AND ${field} != NULL)`;

function aggregateExpression(aggregate: GroupByAggregate, name: string, model: ModelMetadata): string {
  if (aggregate === '_count') return name === GROUP_BY_ALL ? 'count()' : present(quoteSubKey(name));

  const field = quoteSubKey(name);
  const meta: FieldMetadata | undefined = model.fields.find((f) => f.name === name);

  switch (aggregate) {
    case '_sum':
      return `math::sum(${field})`;
    // math::mean answers a lossy float for a decimal, so a decimal average is its sum over its present count
    case '_avg':
      return meta?.type === 'decimal' ? `math::sum(${field}) / ${present(field)}` : `math::mean(${field})`;
    case '_min':
      return `array::min(${field})`;
    case '_max':
      return `array::max(${field})`;
    default:
      return `array::group(${field})`;
  }
}

/** One projection per requested aggregate; a dotted alias makes the server nest the result (`_sum: { total }`). */
function aggregateProjections(args: GroupByArgs, model: ModelMetadata): string[] {
  return GROUP_BY_AGGREGATES.flatMap((aggregate) => {
    const requested = args[aggregate];
    if (!requested) return [];
    const fields = aggregate === '_count' ? groupByCountFields(requested as true) : requested;

    return Object.keys(fields).map((name) => {
      const alias = `${aggregate}.${name === GROUP_BY_ALL ? name : quoteSubKey(name)}`;

      return `${aggregateExpression(aggregate, name, model)} AS ${alias}`;
    });
  });
}

function orderParts(orderBy: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(orderBy).flatMap(([key, value]) => {
    if (value === undefined) return [];
    const path = prefix ? `${prefix}.${quoteSubKey(key)}` : quoteSubKey(key);

    return typeof value === 'string'
      ? [`${path} ${value.toUpperCase()}`]
      : orderParts(value as Record<string, unknown>, path);
  });
}

/**
 * `SELECT <keys>, <aggregates> FROM table [WHERE] GROUP BY <keys> [ORDER BY] [LIMIT] [START]`.
 * WHERE filters rows before grouping; ORDER BY, LIMIT and START apply to the groups.
 */
export function buildGroupByQuery(model: ModelMetadata, args: GroupByArgs, registry?: ModelRegistry): CompiledQuery {
  const keys = keyPaths(args.by);
  const where = transformWhereClause(args.where, model, registry);
  const order = args.orderBy ? orderParts(args.orderBy) : [];

  const parts = [
    `SELECT ${[...keys, ...aggregateProjections(args, model)].join(', ')} FROM ${model.tableName}`,
    where.text,
    `GROUP BY ${keys.join(', ')}`,
    order.length ? `ORDER BY ${order.join(', ')}` : '',
    buildLimit(args.limit),
    buildOffset(args.offset),
  ].filter((p) => p);

  return { text: parts.join(' '), vars: where.vars };
}
