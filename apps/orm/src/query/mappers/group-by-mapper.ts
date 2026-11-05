/**
 * Maps `groupBy` rows. The row shape is not the model's, so the compile step describes it as a
 * ModelMetadata (`groupByRowShape`): group keys keep their field metadata, and each aggregate is an object
 * field whose sub-fields carry the metadata of the field it aggregates. That description travels with the
 * query, so a standalone call and a `$transaction` item map their rows the same way.
 */

import { Decimal, SizedNumber } from 'surrealdb';
import type { FieldMetadata, ModelMetadata } from '../../types';
import { CerialDecimal } from '../../utils/cerial-decimal';
import {
  GROUP_BY_AGGREGATES,
  groupByCountFields,
  type GroupByAggregate,
  type GroupByArgs,
  type GroupByKeys,
} from '../validators/group-by-validator';
import { mapFieldValue } from './result-mapper';

const AGGREGATE_NAMES: ReadonlySet<string> = new Set(GROUP_BY_AGGREGATES);

function shapeField(name: string, base: Partial<FieldMetadata>): FieldMetadata {
  return { name, type: 'string', isId: false, isUnique: false, isRequired: true, ...base };
}

/** A key field cut down to the sub-keys the call grouped by. */
function keyShape(field: FieldMetadata, keys: true | GroupByKeys): FieldMetadata {
  if (keys === true || !field.objectInfo) return field;

  const fields = Object.entries(keys).flatMap(([name, sub]) => {
    const child = field.objectInfo!.fields.find((f) => f.name === name);

    return child ? [keyShape(child, sub)] : [];
  });

  return { ...field, objectInfo: { ...field.objectInfo, fields } };
}

/** Describes the rows `args` produces: its keys with their types, then one object field per aggregate. */
export function groupByRowShape(model: ModelMetadata, args: GroupByArgs): ModelMetadata {
  const fields: FieldMetadata[] = Object.entries(args.by).flatMap(([name, keys]) => {
    const field = model.fields.find((f) => f.name === name);

    return field ? [keyShape(field, keys)] : [];
  });

  for (const aggregate of GROUP_BY_AGGREGATES) {
    const requested = args[aggregate];
    if (!requested) continue;
    const names = Object.keys(aggregate === '_count' ? groupByCountFields(requested as true) : requested);
    const members = names.map((name) => {
      const source = model.fields.find((f) => f.name === name);
      if (aggregate === '_count' || !source) return shapeField(name, { type: 'int' });

      return { ...source, isRequired: true };
    });

    fields.push(shapeField(aggregate, { type: 'object', objectInfo: { objectName: aggregate, fields: members } }));
  }

  return { name: model.name, tableName: model.tableName, fields };
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && !Number.isNaN(value);

/** A plain number from the server's answer, or undefined when it holds none (NaN, NONE, null). */
function plainNumber(value: unknown): number | undefined {
  const inner = value instanceof SizedNumber ? value.value : value;
  if (typeof inner === 'bigint') return Number(inner);

  return isNumber(inner) ? inner : undefined;
}

function decimalOrUndefined(value: unknown): CerialDecimal | undefined {
  if (value instanceof Decimal) return CerialDecimal.from(value);
  if (isNumber(value) || typeof value === 'string') return CerialDecimal.from(value);

  return undefined;
}

/** An empty group sums to the int 0 whatever the field type, and a decimal sum stays a Decimal. */
function mapSum(value: unknown, field: FieldMetadata): unknown {
  if (field.type === 'decimal') return decimalOrUndefined(value) ?? CerialDecimal.from(0);

  return plainNumber(value) ?? 0;
}

/** An empty group averages to NaN (or a decimal average divides 0 by 0): there is no average, so null. */
function mapAvg(value: unknown, field: FieldMetadata): unknown {
  if (field.type === 'decimal') return decimalOrUndefined(value) ?? null;

  return plainNumber(value) ?? null;
}

/** `array::group` keeps NONE as a member and keeps null too; NONE is never a value and null only on a @nullable field. */
function mapGroup(value: unknown, field: FieldMetadata): unknown[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((member) => member !== undefined && (member !== null || field.isNullable))
    .map((member) => (member === null ? null : mapFieldValue(member, field.type)));
}

function mapAggregateMember(aggregate: GroupByAggregate, value: unknown, field: FieldMetadata): unknown {
  switch (aggregate) {
    case '_count':
      return plainNumber(value) ?? 0;
    case '_sum':
      return mapSum(value, field);
    case '_avg':
      return mapAvg(value, field);
    case '_group':
      return mapGroup(value, field);
    default:
      // array::min and array::max answer NONE over a group with no value
      return value === undefined || value === null ? null : mapFieldValue(value, field.type);
  }
}

function mapAggregate(aggregate: GroupByAggregate, raw: unknown, shape: FieldMetadata): Record<string, unknown> {
  const source = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  return Object.fromEntries(
    (shape.objectInfo?.fields ?? []).map((member) => [
      member.name,
      mapAggregateMember(aggregate, source[member.name], member),
    ]),
  );
}

/** Group keys: NONE leaves the key off the row, null stays null, an object maps its sub-keys, an array its members. */
function mapKey(value: unknown, field: FieldMetadata): unknown {
  if (value === null) return null;
  if (field.type === 'object' && field.objectInfo && value !== null && typeof value === 'object') {
    return mapKeys(value as Record<string, unknown>, field.objectInfo.fields);
  }
  if (Array.isArray(value)) return value.map((member) => (member === null ? null : mapFieldValue(member, field.type)));

  return mapFieldValue(value, field.type);
}

function mapKeys(row: Record<string, unknown>, fields: FieldMetadata[]): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};

  for (const field of fields) {
    const value = row[field.name];
    if (value !== undefined) mapped[field.name] = mapKey(value, field);
  }

  return mapped;
}

/** Maps the rows of a `groupBy` query described by `shape` (from `groupByRowShape`). */
export function mapGroupByRows(raw: unknown, shape: ModelMetadata): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((row: Record<string, unknown>) => {
    const keyFields = shape.fields.filter((f) => !AGGREGATE_NAMES.has(f.name));
    const mapped = mapKeys(row, keyFields);

    for (const field of shape.fields) {
      if (AGGREGATE_NAMES.has(field.name)) {
        mapped[field.name] = mapAggregate(field.name as GroupByAggregate, row[field.name], field);
      }
    }

    return mapped;
  });
}
