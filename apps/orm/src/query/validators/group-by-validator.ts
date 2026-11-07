/**
 * Validator for `groupBy` arguments.
 *
 * Every name that reaches the query text (group keys, aggregate fields, orderBy keys) is checked against
 * the model here, so the builder only ever quotes names it knows. The server answers garbage instead of
 * refusing for some inputs (`math::sum` over a string is `0`, an aggregate alias equal to a key breaks
 * the grouping), so those are refused client-side.
 */

import type { FieldMetadata, ModelMetadata, ModelRegistry, SchemaFieldType, WhereClause } from '../../types';
import { isObject } from '../../utils/type-utils';
import { escapeControl } from '../../utils/safe-text';
import type { ValidationProblem } from './failure';
import { validatePagination } from './select-validator';
import { validateWhere } from './where-validator';

/** Aggregates that take a field map; `_group` collects distinct values and cannot order groups. */
export const GROUP_BY_AGGREGATES = ['_count', '_sum', '_avg', '_min', '_max', '_group'] as const;
export type GroupByAggregate = (typeof GROUP_BY_AGGREGATES)[number];

/** The `_count` key that counts rows instead of present values of a field. */
export const GROUP_BY_ALL = '_all';

/** Select-shaped group keys: `true` on a field, a nested object for declared object sub-keys. */
export interface GroupByKeys {
  [field: string]: true | GroupByKeys;
}

/** `{ field: true }` per aggregate; `_count: true` means `{ _all: true }`. */
export type GroupByFieldMap = Record<string, true>;

export interface GroupByArgs {
  by: GroupByKeys;
  where?: WhereClause;
  _count?: true | GroupByFieldMap;
  _sum?: GroupByFieldMap;
  _avg?: GroupByFieldMap;
  _min?: GroupByFieldMap;
  _max?: GroupByFieldMap;
  _group?: GroupByFieldMap;
  /** Group keys with the same nesting as `by`, plus requested aggregates; `asc` or `desc` */
  orderBy?: Record<string, unknown>;
  limit?: number;
  offset?: number;
}

const OPTIONS: readonly string[] = ['by', 'where', ...GROUP_BY_AGGREGATES, 'orderBy', 'limit', 'offset'];
const UNSUPPORTED_OPTIONS: readonly string[] = ['select', 'include', 'compute', 'unset', 'return'];

const NUMERIC_TYPES: ReadonlySet<SchemaFieldType> = new Set([
  'int',
  'float',
  'number',
  'decimal',
  'int8',
  'uint8',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'uint64',
  'float16',
  'float32',
]);

const VALUE_TYPES: ReadonlySet<SchemaFieldType> = new Set([
  ...NUMERIC_TYPES,
  'string',
  'email',
  'date',
  'duration',
  'uuid',
  'bool',
  'record',
  'literal',
]);

const hasOwn = (target: object, key: string): boolean => Object.prototype.hasOwnProperty.call(target, key);

/** `_count: true` is sugar for `{ _all: true }`. */
export function groupByCountFields(count: true | GroupByFieldMap): GroupByFieldMap {
  return count === true ? { [GROUP_BY_ALL]: true } : count;
}

function unknownField(path: string, model: ModelMetadata): ValidationProblem {
  return {
    path,
    kind: 'unknownField',
    message: `Unknown field '${escapeControl(path)}' on model ${model.name} — check the field name against the schema`,
  };
}

/** Why a field holds no single comparable value, or undefined when it does. */
function valueRefusal(field: FieldMetadata): string | undefined {
  if (field.type === 'relation') return 'a relation is virtual and stored nowhere';
  if (field.type === 'object') return 'an object has no single value';
  if (field.type === 'tuple') return 'a tuple has no single value';
  if (field.type === 'bytes' || field.type === 'geometry' || field.type === 'any') {
    return `${field.type} values are not comparable`;
  }
  if (
    field.type === 'literal' &&
    field.literalInfo?.variants.some((v) => v.kind === 'objectRef' || v.kind === 'tupleRef')
  ) {
    return 'a literal with object or tuple variants has no single comparable value';
  }
  if (!VALUE_TYPES.has(field.type)) return `type ${field.type} is not supported`;

  return undefined;
}

function pathRefusal(action: string, path: string, model: ModelMetadata, reason: string, hint = ''): ValidationProblem {
  return { path, message: `Cannot ${action} '${path}' on model ${model.name} — ${reason}${hint}` };
}

function validateKeys(
  by: Record<string, unknown>,
  fields: FieldMetadata[],
  isFlexible: boolean | undefined,
  prefix: string,
  model: ModelMetadata,
  problems: ValidationProblem[],
): void {
  for (const [key, value] of Object.entries(by)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const field = fields.find((f) => f.name === key);

    if (!field) {
      if (isFlexible) {
        problems.push(
          pathRefusal('group by', path, model, 'an undeclared sub-key of a flexible object is not a group key'),
        );
      } else {
        problems.push(unknownField(path, model));
      }
      continue;
    }

    if (value === true) {
      const reason = valueRefusal(field);
      if (!reason) continue;
      const hint = field.type === 'object' ? ` — name its sub-keys, e.g. { ${key}: { <subKey>: true } }` : '';
      problems.push(pathRefusal('group by', path, model, reason, hint));
    } else if (isObject(value)) {
      if (field.type !== 'object' || !field.objectInfo || field.isArray) {
        problems.push(pathRefusal('group by', path, model, 'only a single object field has sub-keys to group by'));
      } else if (!Object.keys(value).length) {
        problems.push({ path, message: `groupBy key '${path}' names no sub-key — set a sub-key to true` });
      } else {
        validateKeys(value, field.objectInfo.fields, field.isFlexible, path, model, problems);
      }
    } else {
      problems.push({
        path,
        message: `groupBy key '${path}' must be true or an object of sub-keys, got ${show(value)}`,
      });
    }
  }
}

function show(value: unknown): string {
  return typeof value === 'bigint' ? `${value}n` : (JSON.stringify(value) ?? String(value));
}

/** The reason a field cannot feed an aggregate, or undefined when it can. */
function aggregateRefusal(aggregate: GroupByAggregate, field: FieldMetadata): string | undefined {
  if (aggregate === '_count') return field.type === 'relation' ? 'a relation is virtual and stored nowhere' : undefined;

  const reason = valueRefusal(field);
  if (reason) return reason;
  if (aggregate === '_group') return undefined;
  if (field.isArray) return 'an array has no single value — _group collects array members';
  if (aggregate === '_sum' || aggregate === '_avg') {
    if (!NUMERIC_TYPES.has(field.type))
      return `only numeric fields can be summed or averaged, and this is ${field.type}`;
  }

  return undefined;
}

function validateAggregate(
  aggregate: GroupByAggregate,
  value: unknown,
  model: ModelMetadata,
  requested: Map<GroupByAggregate, Set<string>>,
  problems: ValidationProblem[],
): void {
  if (value === undefined) return;
  if (aggregate === '_count' && value === true) {
    requested.set(aggregate, new Set([GROUP_BY_ALL]));

    return;
  }
  if (!isObject(value)) {
    const accepted = aggregate === '_count' ? 'true or an object of fields' : 'an object of fields';
    problems.push({ path: aggregate, message: `${aggregate} must be ${accepted}, got ${show(value)}` });

    return;
  }
  const entries = Object.entries(value);
  if (!entries.length) {
    problems.push({ path: aggregate, message: `${aggregate} is empty — name at least one field or leave it out` });

    return;
  }

  const names = new Set<string>();
  requested.set(aggregate, names);

  for (const [key, flag] of entries) {
    const path = `${aggregate}.${key}`;

    if (flag !== true) {
      problems.push({ path, message: `${path} must be true, got ${show(flag)}` });
      continue;
    }
    if (aggregate === '_count' && key === GROUP_BY_ALL) {
      if (model.fields.some((f) => f.name === GROUP_BY_ALL)) {
        problems.push({
          path,
          message: `${path} is ambiguous: model ${model.name} has a field named '${GROUP_BY_ALL}', which _count uses for the row count`,
        });
      } else {
        names.add(key);
      }
      continue;
    }

    const field = model.fields.find((f) => f.name === key);
    if (!field) {
      problems.push(unknownField(path, model));
      continue;
    }
    const reason = aggregateRefusal(aggregate, field);
    if (reason) problems.push(pathRefusal(`use`, path, model, reason, ` in ${aggregate}`));
    else names.add(key);
  }
}

const isDirection = (value: unknown): boolean =>
  typeof value === 'string' && ['asc', 'desc'].includes(value.toLowerCase());

function validateOrderLevel(
  orderBy: Record<string, unknown>,
  keys: GroupByKeys | undefined,
  prefix: string,
  model: ModelMetadata,
  requested: Map<GroupByAggregate, Set<string>>,
  problems: ValidationProblem[],
): void {
  for (const [key, value] of Object.entries(orderBy)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value === undefined) continue;

    if (!prefix && (GROUP_BY_AGGREGATES as readonly string[]).includes(key)) {
      validateOrderAggregate(key as GroupByAggregate, value, requested, problems);
      continue;
    }

    if (!keys || !hasOwn(keys, key)) {
      problems.push(
        prefix || model.fields.some((f) => f.name === key)
          ? {
              path,
              message: `Cannot order by '${path}' — it is not a group key of this call; only the keys in by and the requested aggregates order groups`,
            }
          : unknownField(path, model),
      );
      continue;
    }

    const sub = keys[key]!;
    if (sub === true) {
      if (!isDirection(value)) {
        problems.push({ path, message: `Order direction for '${path}' must be 'asc' or 'desc', got ${show(value)}` });
      }
    } else if (!isObject(value)) {
      problems.push({
        path,
        message: `Cannot order by '${path}' directly — it groups by sub-keys, so name one, e.g. { ${key}: { <subKey>: 'asc' } }`,
      });
    } else {
      validateOrderLevel(value, sub, path, model, requested, problems);
    }
  }
}

function validateOrderAggregate(
  aggregate: GroupByAggregate,
  value: unknown,
  requested: Map<GroupByAggregate, Set<string>>,
  problems: ValidationProblem[],
): void {
  if (aggregate === '_group') {
    problems.push({ path: '_group', message: "Cannot order by '_group' — it collects arrays, which have no order" });

    return;
  }
  if (!isObject(value)) {
    problems.push({
      path: aggregate,
      message: `Cannot order by '${aggregate}' directly — name a field, e.g. { ${aggregate}: { <field>: 'desc' } }`,
    });

    return;
  }

  for (const [name, direction] of Object.entries(value)) {
    const path = `${aggregate}.${name}`;
    if (direction === undefined) continue;

    if (!requested.get(aggregate)?.has(name)) {
      problems.push({
        path,
        message: `Cannot order by '${path}' — the call does not request ${path}, and only requested aggregates order groups`,
      });
    } else if (!isDirection(direction)) {
      problems.push({ path, message: `Order direction for '${path}' must be 'asc' or 'desc', got ${show(direction)}` });
    }
  }
}

/**
 * Check `groupBy` arguments against the model. Returns every problem found (empty when valid); the caller
 * throws it with `validationFailure('groupBy', problems, model, 'groupBy')`. `args` is unknown because it
 * is caller input.
 */
export function validateGroupBy(args: unknown, model: ModelMetadata, registry?: ModelRegistry): ValidationProblem[] {
  if (!isObject(args)) return [{ path: 'groupBy', message: 'groupBy needs an options object with a by key' }];

  const problems: ValidationProblem[] = [];

  for (const key of Object.keys(args)) {
    if (OPTIONS.includes(key)) continue;
    problems.push({
      path: key,
      message: UNSUPPORTED_OPTIONS.includes(key)
        ? `groupBy does not take '${escapeControl(key)}' — it returns one row per group, not records`
        : key === 'having'
          ? "groupBy has no 'having' — filter the groups in code, or use where to filter the rows before grouping"
          : `Unknown groupBy option '${escapeControl(key)}'`,
    });
  }

  const by = args.by;
  const keyProblems: ValidationProblem[] = [];
  if (!isObject(by) || !Object.keys(by).length) {
    problems.push({ path: 'by', message: 'groupBy needs by: an object naming at least one field to group by' });
  } else {
    validateKeys(by, model.fields, false, '', model, keyProblems);
    problems.push(...keyProblems);
  }

  const requested = new Map<GroupByAggregate, Set<string>>();
  for (const aggregate of GROUP_BY_AGGREGATES) {
    validateAggregate(aggregate, args[aggregate], model, requested, problems);

    // The server breaks on an alias equal to a group key, so a key named like an aggregate is refused
    if (args[aggregate] !== undefined && isObject(by) && hasOwn(by, aggregate)) {
      problems.push({
        path: aggregate,
        message: `Aggregate '${aggregate}' collides with the group key '${aggregate}' on model ${model.name} — drop the aggregate or group by another field`,
      });
    }
  }

  if (args.orderBy !== undefined) {
    if (!isObject(args.orderBy)) {
      problems.push({ path: 'orderBy', message: `orderBy must be an object, got ${show(args.orderBy)}` });
    } else if (isObject(by) && !keyProblems.length) {
      validateOrderLevel(args.orderBy, by as GroupByKeys, '', model, requested, problems);
    }
  }

  if (args.where !== undefined) {
    if (!isObject(args.where)) problems.push({ path: 'where', message: 'where must be an object' });
    else problems.push(...validateWhere(args.where as WhereClause, model, registry).errors);
  }
  problems.push(...validatePagination(args.limit, args.offset));

  return problems;
}
