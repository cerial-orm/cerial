/**
 * GroupBy type generator - the `groupBy` arguments and result types of a model.
 *
 * The field sets mirror `group-by-validator.ts` (what it accepts at runtime is what the types offer), and the
 * result values mirror `group-by-mapper.ts`: a NONE key leaves the row, an empty `_sum` is 0, an `_avg` or
 * `_min`/`_max` with no value is null, and `_group` drops NONE and keeps null only on a nullable field.
 */

import type { FieldMetadata, ModelMetadata, SchemaFieldType } from '../../types';

const AGGREGATE_NAMES = ['_count', '_sum', '_avg', '_min', '_max', '_group'] as const;

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

const DIRECTION = "'asc' | 'desc'";

/** True when the field holds one comparable value (or an array of them) that can be a key or an aggregate input. */
function hasValue(field: FieldMetadata): boolean {
  if (!VALUE_TYPES.has(field.type)) return false;

  return !(
    field.type === 'literal' && field.literalInfo?.variants.some((v) => v.kind === 'objectRef' || v.kind === 'tupleRef')
  );
}

const isScalar = (field: FieldMetadata): boolean => hasValue(field) && !field.isArray;

/** Sub-keys of a single object field that can be grouped by, as a nested type with `leaf` at each key */
function keyType(fields: FieldMetadata[], leaf: string, seen: readonly string[]): string[] {
  const members: string[] = [];

  for (const field of fields) {
    if (field.type === 'relation') continue;
    if (field.type === 'object' && field.objectInfo && !field.isArray) {
      if (seen.includes(field.objectInfo.objectName)) continue;
      const inner = keyType(field.objectInfo.fields, leaf, [...seen, field.objectInfo.objectName]);
      if (inner.length) members.push(`${field.name}?: { ${inner.join(' ')} };`);
      continue;
    }
    if (hasValue(field)) members.push(`${field.name}?: ${leaf};`);
  }

  return members;
}

/** Group keys: a field named like an aggregate would collide with its alias, so it is not offered */
function groupKeyMembers(model: ModelMetadata, leaf: string): string[] {
  const own = model.fields.filter((f) => !(AGGREGATE_NAMES as readonly string[]).includes(f.name));

  return keyType(own, leaf, []);
}

function members(fields: FieldMetadata[], leaf: string, extra: string[] = []): string[] {
  return [...extra, ...fields.map((f) => `${f.name}?: ${leaf};`)];
}

interface AggregateFields {
  count: FieldMetadata[];
  numeric: FieldMetadata[];
  minMax: FieldMetadata[];
  group: FieldMetadata[];
  countsAll: boolean;
}

function aggregateFields(model: ModelMetadata): AggregateFields {
  const stored = model.fields.filter((f) => f.type !== 'relation');

  const countsAll = !stored.some((f) => f.name === '_all');

  return {
    count: countsAll ? stored : stored.filter((f) => f.name !== '_all'),
    numeric: stored.filter((f) => isScalar(f) && NUMERIC_TYPES.has(f.type)),
    minMax: stored.filter(isScalar),
    group: stored.filter(hasValue),
    // `_all` counts rows; a model field of that name makes the key ambiguous, so the validator refuses it
    countsAll,
  };
}

function iface(name: string, body: string[]): string {
  return `export interface ${name} {\n${body.map((m) => `  ${m}`).join('\n')}\n}`;
}

/** Generate the `groupBy` argument, order and result types of a model */
export function generateGroupByTypes(model: ModelMetadata): string {
  const m = model.name;
  const agg = aggregateFields(model);
  const keys = groupKeyMembers(model, 'true');
  const orderKeys = groupKeyMembers(model, DIRECTION);
  const countMembers = members(agg.count, 'true', agg.countsAll ? ['_all?: true;'] : []);

  // An aggregate with no eligible field is left out of the type entirely: an empty interface would
  // skip the excess-property check and accept any key
  const hasCount = countMembers.length > 0;
  const hasNumeric = agg.numeric.length > 0;
  const hasMinMax = agg.minMax.length > 0;
  const hasGroup = agg.group.length > 0;
  const parts: string[] = [iface(`${m}GroupByKeys`, keys)];

  if (hasCount) parts.push(iface(`${m}CountAggregate`, countMembers));
  if (hasNumeric) parts.push(iface(`${m}NumericAggregate`, members(agg.numeric, 'true')));
  if (hasMinMax) parts.push(iface(`${m}MinMaxAggregate`, members(agg.minMax, 'true')));
  if (hasGroup) parts.push(iface(`${m}GroupAggregate`, members(agg.group, 'true')));

  const args = [`by: ${m}GroupByKeys;`, `where?: ${m}Where;`];
  if (hasCount) args.push(`_count?: true | ${m}CountAggregate;`);
  if (hasNumeric) args.push(`_sum?: ${m}NumericAggregate;`, `_avg?: ${m}NumericAggregate;`);
  if (hasMinMax) args.push(`_min?: ${m}MinMaxAggregate;`, `_max?: ${m}MinMaxAggregate;`);
  if (hasGroup) args.push(`_group?: ${m}GroupAggregate;`);

  const order = [...orderKeys];
  if (hasCount)
    order.push(
      `_count?: { ${members(agg.count, DIRECTION, agg.countsAll ? [`_all?: ${DIRECTION};`] : []).join(' ')} };`,
    );
  if (hasNumeric) {
    const numeric = `{ ${members(agg.numeric, DIRECTION).join(' ')} }`;
    order.push(`_sum?: ${numeric};`, `_avg?: ${numeric};`);
  }
  if (hasMinMax) {
    const minMax = `{ ${members(agg.minMax, DIRECTION).join(' ')} }`;
    order.push(`_min?: ${minMax};`, `_max?: ${minMax};`);
  }
  parts.push(iface(`${m}GroupByOrderBy`, order));

  args.push(`orderBy?: ${m}GroupByOrderBy;`, 'limit?: number;', 'offset?: number;');
  parts.push(iface(`${m}GroupByArgs`, args));

  // What each requested aggregate holds per field; GroupByRow picks the requested ones
  const rows: string[] = [];
  if (hasCount) {
    const counts = [...(agg.countsAll ? ['_all: number;'] : []), ...agg.count.map((f) => `${f.name}: number;`)];
    rows.push(`_count: { ${counts.join(' ')} };`);
  }
  if (hasNumeric) {
    const value = (f: FieldMetadata): string => (f.type === 'decimal' ? 'CerialDecimal' : 'number');
    rows.push(`_sum: { ${agg.numeric.map((f) => `${f.name}: ${value(f)};`).join(' ')} };`);
    rows.push(`_avg: { ${agg.numeric.map((f) => `${f.name}: ${value(f)} | null;`).join(' ')} };`);
  }
  if (hasMinMax) {
    const minMax = `{ ${agg.minMax.map((f) => `${f.name}: NonNullable<${m}['${f.name}']> | null;`).join(' ')} }`;
    rows.push(`_min: ${minMax};`, `_max: ${minMax};`);
  }
  if (hasGroup) {
    const groups = agg.group.map((f) => {
      const member = `GroupMember<${m}['${f.name}']>`;

      return `${f.name}: ${f.isNullable ? `(${member} | null)` : member}[];`;
    });
    rows.push(`_group: { ${groups.join(' ')} };`);
  }
  parts.push(iface(`${m}GroupByAggregates`, rows));

  parts.push(`export type ${m}GroupByResult<A extends ${m}GroupByArgs> = GroupByRow<${m}, A, ${m}GroupByAggregates>;`);

  return parts.join('\n\n');
}

/** Generate the `groupBy` method signature of a model */
export function generateGroupByMethod(model: ModelMetadata): string {
  return `groupBy<const A extends ${model.name}GroupByArgs>(args: GroupByArg<A, ${model.name}GroupByArgs>, txn?: CerialTransaction): CerialQueryPromise<${model.name}GroupByResult<A>[]>;`;
}
