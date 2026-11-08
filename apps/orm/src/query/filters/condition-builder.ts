/**
 * Condition builder - builds WHERE clause conditions
 */

import { Decimal, Duration, F16, F32, Geometry, RecordId, StringRecordId, Uuid } from 'surrealdb';
import type {
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectFieldMetadata,
  TupleFieldMetadata,
  WhereClause,
} from '../../types';
import { CerialBytes } from '../../utils/cerial-bytes';
import { CerialDecimal } from '../../utils/cerial-decimal';
import { CerialDuration } from '../../utils/cerial-duration';
import { CerialGeometry } from '../../utils/cerial-geometry';
import { CerialId, isRecordIdInput } from '../../utils/cerial-id';
import { CerialUuid } from '../../utils/cerial-uuid';
import { quoteSubKey } from '../../utils/string-utils';
import { isObject } from '../../utils/type-utils';
import { CerialValidationError } from '../../errors';
import { escapeControl } from '../../utils/safe-text';
import { joinFragments, wrapParens } from '../compile/fragment';
import { compileFragment, isSqlFragment } from '../compile/sql-fragment';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { toU64Param, transformData, transformOrValidateRecordId, transformValue } from '../transformers';
import { expandCompositeKeys } from './composite-key';
import { handleAnd, handleNot, handleOr } from './logical-operators';
import { buildForwardNoRecord, buildNestedCondition, isNestedRelationCondition } from './nested-condition-builder';
import { getOperatorHandler, isRegisteredOperator } from './registry';

/** Find target table for a Record field by looking at paired Relation field */
function findRecordTargetTable(fieldName: string, model: ModelMetadata): string | undefined {
  const pairedRelation = model.fields.find((f) => f.type === 'relation' && f.relationInfo?.fieldRef === fieldName);

  return pairedRelation?.relationInfo?.targetTable;
}

/**
 * Apply `convert` to every non-array member however deeply the lists nest: the members of an array field's
 * in/notIn are lists themselves, and each element still has to be converted as create converts it.
 */
function mapLeaves(value: unknown, convert: (v: unknown) => unknown): unknown {
  return Array.isArray(value) ? value.map((v) => mapLeaves(v, convert)) : convert(value);
}

/** Transform a UUID value to SDK Uuid */
function transformUuidValue(value: unknown): unknown {
  if (value instanceof Uuid) return value;
  if (value instanceof CerialUuid) return value.toNative();
  if (typeof value === 'string') return new Uuid(value);

  return value;
}

export function transformDurationValue(value: unknown): unknown {
  if (value instanceof Duration) return value;
  if (value instanceof CerialDuration) return value.toNative();
  if (typeof value === 'string') return new Duration(value);

  return value;
}

function transformDecimalValue(value: unknown): unknown {
  if (value instanceof Decimal) return value;
  if (value instanceof CerialDecimal) return value.toNative();
  if (typeof value === 'number') return new Decimal(value);
  if (typeof value === 'string') return new Decimal(value);

  return value;
}

/**
 * A number compared against a sized field goes as the matching SDK class: a plain 0.1 misses a row written
 * to a Float16 or Float32 because the server stored the rounded value. The class rounds the filter the same
 * way. Other sized integers compare by value across kinds, and anything that is not a number passes through.
 */
function transformSizedValue(value: unknown, type: FieldMetadata['type']): unknown {
  if (typeof value !== 'number' && typeof value !== 'bigint') return value;
  if (type === 'uint64') return toU64Param(value);
  if (typeof value === 'bigint') return value;
  if (type === 'float16') return new F16(value);
  if (type === 'float32') return new F32(value);

  return value;
}

function transformBytesValue(value: unknown): unknown {
  if (value instanceof Uint8Array) return value;
  if (value instanceof CerialBytes) return value.toNative();
  if (typeof value === 'string') return CerialBytes.fromBase64(value).toNative();

  return value;
}

export function transformGeometryValue(value: unknown): unknown {
  if (value instanceof Geometry) return value;
  if (CerialGeometry.is(value)) return value.toNative();
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
    return CerialGeometry.from(value as [number, number]).toNative();
  }
  if (typeof value === 'object' && value !== null && 'type' in value) {
    return CerialGeometry.from(value as Parameters<typeof CerialGeometry.from>[0]).toNative();
  }

  return value;
}

/** A bare point is [x, y]; any other array is a list, however deeply nested, whatever form its members take */
function transformGeometryOperand(value: unknown): unknown {
  if (Array.isArray(value) && typeof value[0] !== 'number') return value.map(transformGeometryOperand);

  return transformGeometryValue(value);
}

/** A date string becomes a Date as it does on create; a string compared as-is would match against the wrong type. */
function transformDateOperand(value: unknown, field: Pick<FieldMetadata, 'type'>): unknown {
  if (field.type !== 'date') return value;

  return mapLeaves(value, (v) => transformValue(v, 'date'));
}

/** Transform value for ID, Record, or UUID fields - handles all input types */
export function transformFieldValue(value: unknown, fieldMetadata: FieldMetadata, model: ModelMetadata): unknown {
  // A whole tuple or object array compared to the field converts as create converts it, element by element
  if ((fieldMetadata.type === 'object' || fieldMetadata.type === 'tuple') && Array.isArray(value)) {
    const own = { ...model, fields: [fieldMetadata] };

    return transformData({ [fieldMetadata.name]: value }, own)[fieldMetadata.name];
  }

  // Transform ID field values to RecordId
  if (fieldMetadata.isId) {
    // Check arrays first — isRecordIdInput matches arrays (valid RecordIdValue),
    // but in WHERE context arrays mean "list of IDs" not "single array-typed ID"
    if (Array.isArray(value)) {
      return value.map((v) => {
        if (isRecordIdInput(v)) return transformOrValidateRecordId(model.tableName, v);

        return v;
      });
    }
    if (isRecordIdInput(value)) {
      return transformOrValidateRecordId(model.tableName, value);
    }
  }

  // Transform Record field values to RecordId
  if (fieldMetadata.type === 'record') {
    const targetTable = findRecordTargetTable(fieldMetadata.name, model);
    if (targetTable) {
      // Check arrays first — isRecordIdInput matches arrays (valid RecordIdValue),
      // but in WHERE context arrays mean "list of IDs" not "single array-typed ID"
      if (Array.isArray(value)) {
        return value.map((v) => {
          if (isRecordIdInput(v)) return transformOrValidateRecordId(targetTable, v);

          return v;
        });
      }
      if (isRecordIdInput(value)) {
        return transformOrValidateRecordId(targetTable, value);
      }
    }
  }

  // Transform UUID field values to SDK Uuid
  if (fieldMetadata.type === 'uuid') return mapLeaves(value, transformUuidValue);

  // Transform Duration field values to SDK Duration
  if (fieldMetadata.type === 'duration') return mapLeaves(value, transformDurationValue);

  // Transform Decimal field values to SDK Decimal
  if (fieldMetadata.type === 'decimal') return mapLeaves(value, transformDecimalValue);

  if (fieldMetadata.type === 'date') return transformDateOperand(value, fieldMetadata);

  if (fieldMetadata.type === 'uint64' || fieldMetadata.type === 'float16' || fieldMetadata.type === 'float32') {
    return mapLeaves(value, (v) => transformSizedValue(v, fieldMetadata.type));
  }

  if (fieldMetadata.type === 'bytes') return mapLeaves(value, transformBytesValue);

  if (fieldMetadata.type === 'geometry') {
    return transformGeometryOperand(value);
  }

  return value;
}

/** Build a condition for a single field with operators */
export function buildFieldCondition(
  ctx: FilterCompileContext,
  field: string,
  operators: Record<string, unknown>,
  fieldMetadata: FieldMetadata,
  model: ModelMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [op, value] of Object.entries(operators)) {
    const handler = getOperatorHandler(op);
    // Dropping an unknown operator would widen the filter, so fail closed; the where validator refuses it first
    if (!handler)
      throw new CerialValidationError(`Invalid where clause: Unknown operator: ${escapeControl(op)}`, {
        field,
        operation: 'where',
      });
    if (value === undefined) continue;

    // Transform ID/Record field values to RecordId
    const transformedValue = transformFieldValue(value, fieldMetadata, model);
    conditions.push(handler(ctx, field, transformedValue, fieldMetadata));
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  // Multiple operators on same field = AND them together
  return handleAnd(conditions);
}

/** Build a condition for a direct value (shorthand for eq) */
export function buildDirectCondition(
  ctx: FilterCompileContext,
  field: string,
  value: unknown,
  fieldMetadata: FieldMetadata,
  model: ModelMetadata,
): QueryFragment {
  const handler = getOperatorHandler('eq');
  if (!handler) return { text: '', vars: {} };
  // Transform ID/Record field values to RecordId
  const transformedValue = transformFieldValue(value, fieldMetadata, model);
  return handler(ctx, field, transformedValue, fieldMetadata);
}

/** Check if a value is an operator object */
export function isOperatorObject(value: unknown): value is Record<string, unknown> {
  // Check for non-object types first
  if (value instanceof Uint8Array) return false;
  if (!isObject(value)) return false;
  // Known wrapper types are direct values, not operator objects
  if (CerialId.is(value)) return false;
  if (value instanceof RecordId) return false;
  if (value instanceof StringRecordId) return false;
  if (CerialUuid.is(value)) return false;
  if (CerialDuration.is(value)) return false;
  if (CerialDecimal.is(value)) return false;
  if (CerialBytes.is(value)) return false;
  if (CerialGeometry.is(value)) return false;
  // Operator keys distinguish operator objects ({eq: 42}) from typed ID objects ({service: 'api', ts: 123})
  const keys = Object.keys(value);

  return keys.some((k) => isRegisteredOperator(k));
}

/**
 * An operator object, or a plain object with nothing in it ({} or only undefined values). The empty one
 * is a filter that names no operator, so it constrains nothing; read as a direct value it would compare
 * the field to {}. Any-typed and literal fields keep {} as a value they may hold.
 */
export function isOperatorShape(value: unknown, field: FieldMetadata): value is Record<string, unknown> {
  if (isOperatorObject(value)) return true;
  if (field.type === 'any' || field.type === 'literal') return false;
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;

  return Object.values(value).every((v) => v === undefined);
}

/** Build conditions for a single/optional object field using dot notation */
export function buildObjectCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    // Handle logical operators within object where
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) =>
        buildObjectCondition(ctx, fieldPath, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleAnd(andConditions));
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) =>
        buildObjectCondition(ctx, fieldPath, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleOr(orConditions));
      continue;
    }
    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildObjectCondition(ctx, fieldPath, value as Record<string, unknown>, objectInfo);
      conditions.push(handleNot(notCondition));
      continue;
    }

    // Find sub-field metadata
    const subField = objectInfo.fields.find((f) => f.name === key);

    const subPath = `${fieldPath}.${subField ? key : quoteSubKey(key)}`;

    // Unknown field (not in metadata) — pass through for @flexible objects
    if (!subField) {
      if (isOperatorObject(value)) {
        // Build operator conditions with a synthetic field (type 'string' as fallback)
        const syntheticField: FieldMetadata = {
          name: key,
          type: 'string',
          isId: false,
          isUnique: false,
          isRequired: false,
        };
        conditions.push(
          buildFieldCondition(ctx, subPath, value as Record<string, unknown>, syntheticField, {} as ModelMetadata),
        );
      } else {
        // Direct value (shorthand for eq)
        const binding = ctx.bind(subPath, 'eq', value, 'string');
        conditions.push({ text: `${subPath} = ${binding.placeholder}`, vars: binding.vars });
      }
      continue;
    }

    // Nested object sub-field
    if (subField.type === 'object' && subField.objectInfo && isObject(value)) {
      if (subField.isArray) {
        // Array of nested objects: some/every/none
        conditions.push(buildArrayObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo));
      } else {
        // Single nested object: recursive dot notation
        conditions.push(buildObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo));
      }
      continue;
    }

    // Primitive sub-field with operators
    if (isOperatorShape(value, subField)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, subField, {} as ModelMetadata),
      );
      continue;
    }

    // Direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, subPath, value, subField, {} as ModelMetadata));
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/**
 * A quantifier body that compiles to no condition holds for every element, so it is decided by the array
 * alone: some needs an element, none needs the array empty, every is always true (no fragment).
 */
function emptyBodyQuantifier(fieldPath: string, quantifier: string): QueryFragment | undefined {
  if (quantifier === 'some') return { text: `array::len(${fieldPath}) > 0`, vars: {} };
  if (quantifier === 'none') return { text: `array::len(${fieldPath}) = 0`, vars: {} };

  return undefined;
}

/** Build conditions for an array-of-objects field using closure syntax */
export function buildArrayObjectCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [quantifier, subWhere] of Object.entries(whereValue)) {
    if (!isObject(subWhere)) continue;

    // Build inner conditions using closure variable $v
    const innerCondition = buildObjectConditionForClosure(ctx, '$v', subWhere as Record<string, unknown>, objectInfo);
    if (!innerCondition.text) {
      const empty = emptyBodyQuantifier(fieldPath, quantifier);
      if (empty) conditions.push(empty);
      continue;
    }

    if (quantifier === 'some') {
      conditions.push({ text: `${fieldPath}.any(|$v| ${innerCondition.text})`, vars: innerCondition.vars });
    } else if (quantifier === 'every') {
      conditions.push({ text: `${fieldPath}.all(|$v| ${innerCondition.text})`, vars: innerCondition.vars });
    } else if (quantifier === 'none') {
      conditions.push({ text: `!(${fieldPath}.any(|$v| ${innerCondition.text}))`, vars: innerCondition.vars });
    }
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/** Build object conditions for closure context (uses $v.field instead of fieldPath.field) */
function buildObjectConditionForClosure(
  ctx: FilterCompileContext,
  closureVar: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) =>
        buildObjectConditionForClosure(ctx, closureVar, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleAnd(andConditions));
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) =>
        buildObjectConditionForClosure(ctx, closureVar, w as Record<string, unknown>, objectInfo),
      );
      conditions.push(handleOr(orConditions));
      continue;
    }
    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildObjectConditionForClosure(
        ctx,
        closureVar,
        value as Record<string, unknown>,
        objectInfo,
      );
      conditions.push(handleNot(notCondition));
      continue;
    }

    const subField = objectInfo.fields.find((f) => f.name === key);

    const subPath = `${closureVar}.${subField ? key : quoteSubKey(key)}`;

    // Unknown field (not in metadata) — pass through for @flexible objects
    if (!subField) {
      if (isOperatorObject(value)) {
        const syntheticField: FieldMetadata = {
          name: key,
          type: 'string',
          isId: false,
          isUnique: false,
          isRequired: false,
        };
        conditions.push(
          buildFieldCondition(ctx, subPath, value as Record<string, unknown>, syntheticField, {} as ModelMetadata),
        );
      } else {
        const binding = ctx.bind(subPath, 'eq', value, 'string');
        conditions.push({ text: `${subPath} = ${binding.placeholder}`, vars: binding.vars });
      }
      continue;
    }

    // Nested object
    if (subField.type === 'object' && subField.objectInfo && isObject(value)) {
      if (subField.isArray) {
        conditions.push(buildArrayObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo));
      } else {
        conditions.push(
          buildObjectConditionForClosure(ctx, subPath, value as Record<string, unknown>, subField.objectInfo),
        );
      }
      continue;
    }

    if (isOperatorShape(value, subField)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, subField, {} as ModelMetadata),
      );
      continue;
    }

    conditions.push(buildDirectCondition(ctx, subPath, value, subField, {} as ModelMetadata));
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/**
 * Resolve a tuple element key (named or index-based) to element index and a synthetic FieldMetadata.
 * Handles both "lat" (named) and "0" (index) keys.
 */
export function resolveTupleElementKey(
  key: string,
  tupleInfo: TupleFieldMetadata,
): { index: number; syntheticField: FieldMetadata } | undefined {
  // Try named key first
  const namedElement = tupleInfo.elements.find((e) => e.name === key);
  if (namedElement) {
    return {
      index: namedElement.index,
      syntheticField: {
        name: key,
        type: namedElement.type,
        isId: false,
        isUnique: false,
        isRequired: !namedElement.isOptional,
        objectInfo: namedElement.objectInfo,
        tupleInfo: namedElement.tupleInfo,
      },
    };
  }

  // Index keys are canonical digits only: parseInt would read '1 anything' or '0\n...' as an index and
  // let the raw key reach error messages. Leading zeros ('01') are refused like the data validator does.
  if (/^\d+$/.test(key) && String(Number(key)) === key) {
    const idx = Number(key);
    const element = tupleInfo.elements.find((e) => e.index === idx);
    if (element) {
      return {
        index: element.index,
        syntheticField: {
          name: key,
          type: element.type,
          isId: false,
          isUnique: false,
          isRequired: !element.isOptional,
          objectInfo: element.objectInfo,
          tupleInfo: element.tupleInfo,
        },
      };
    }
  }

  return undefined;
}

/** Build conditions for a single/optional tuple field using index access */
export function buildTupleCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    const resolved = resolveTupleElementKey(key, tupleInfo);
    if (!resolved) continue;

    const { index, syntheticField } = resolved;
    const subPath = `${fieldPath}[${index}]`;

    // Nested object element
    if (syntheticField.type === 'object' && syntheticField.objectInfo && isObject(value)) {
      conditions.push(buildObjectCondition(ctx, subPath, value as Record<string, unknown>, syntheticField.objectInfo));
      continue;
    }

    // Nested tuple element
    if (syntheticField.type === 'tuple' && syntheticField.tupleInfo && isObject(value)) {
      conditions.push(buildTupleCondition(ctx, subPath, value as Record<string, unknown>, syntheticField.tupleInfo));
      continue;
    }

    // Operator object
    if (isOperatorShape(value, syntheticField)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, syntheticField, {} as ModelMetadata),
      );
      continue;
    }

    // Direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, subPath, value, syntheticField, {} as ModelMetadata));
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/** Build conditions for an array-of-tuples field using closure syntax */
export function buildArrayTupleCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [quantifier, subWhere] of Object.entries(whereValue)) {
    if (!isObject(subWhere)) continue;

    // Build inner conditions using closure variable $v
    const innerCondition = buildTupleCondition(ctx, '$v', subWhere as Record<string, unknown>, tupleInfo);
    if (!innerCondition.text) {
      const empty = emptyBodyQuantifier(fieldPath, quantifier);
      if (empty) conditions.push(empty);
      continue;
    }

    if (quantifier === 'some') {
      conditions.push({ text: `${fieldPath}.any(|$v| ${innerCondition.text})`, vars: innerCondition.vars });
    } else if (quantifier === 'every') {
      conditions.push({ text: `${fieldPath}.all(|$v| ${innerCondition.text})`, vars: innerCondition.vars });
    } else if (quantifier === 'none') {
      conditions.push({ text: `!(${fieldPath}.any(|$v| ${innerCondition.text}))`, vars: innerCondition.vars });
    }
  }

  if (!conditions.length) return { text: '', vars: {} };
  if (conditions.length === 1) return conditions[0]!;

  return joinFragments(conditions, ' AND ');
}

/**
 * Resolve a dot-notation field path to a FieldMetadata.
 * For example, "address.city" resolves through the "address" object field to its "city" sub-field.
 * Returns the leaf field metadata if found, or undefined if the path is invalid.
 */
function resolveDotNotationField(dotPath: string, model: ModelMetadata): FieldMetadata | undefined {
  const parts = dotPath.split('.');
  if (parts.length < 2) return undefined;

  // Find the root field
  const rootField = model.fields.find((f) => f.name === parts[0]);
  if (!rootField || rootField.type !== 'object' || !rootField.objectInfo) return undefined;

  // Walk the object info tree
  let currentObjectInfo: ObjectFieldMetadata | undefined = rootField.objectInfo;
  let resolvedField: FieldMetadata | undefined;

  for (let i = 1; i < parts.length; i++) {
    if (!currentObjectInfo) return undefined;

    const subField: FieldMetadata | undefined = currentObjectInfo.fields.find((f) => f.name === parts[i]);
    if (!subField) return undefined;

    if (i === parts.length - 1) {
      // Last part: this is the target field
      resolvedField = subField;
    } else {
      // Intermediate: must be an object field
      if (subField.type !== 'object' || !subField.objectInfo) return undefined;
      currentObjectInfo = subField.objectInfo;
    }
  }

  return resolvedField;
}

/** The refusal for a `$raw` value that is not a fragment built by the `sql` tag */
export function rawRefusal(value: unknown): string {
  return value === undefined
    ? 'where.$raw is undefined, which would drop the filter and widen the statement; omit the key or pass a fragment built by the sql tag'
    : 'where.$raw must be a fragment built by the sql tag';
}

/** Build conditions from a where clause */
export function buildConditions(
  ctx: FilterCompileContext,
  where: WhereClause,
  model: ModelMetadata,
  registry?: ModelRegistry,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  // A composite key names no column of its own; expanded here it filters in every position (top level,
  // AND/OR/NOT, relation targets) instead of compiling to nothing.
  for (const [key, value] of Object.entries(expandCompositeKeys(where, model))) {
    // Ahead of the undefined skip so a missing fragment refuses instead of widening the filter. Parentheses
    // keep the fragment's own OR/AND from changing precedence; they are not a security boundary.
    if (key === '$raw') {
      if (!isSqlFragment(value)) throw new CerialValidationError(rawRefusal(value), { model: model.name });
      conditions.push(wrapParens(compileFragment(value, ctx)));
      continue;
    }

    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) => buildConditions(ctx, w as WhereClause, model, registry));
      conditions.push(handleAnd(andConditions));
      continue;
    }

    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) => buildConditions(ctx, w as WhereClause, model, registry));
      conditions.push(handleOr(orConditions));
      continue;
    }

    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildConditions(ctx, value as WhereClause, model, registry);
      conditions.push(handleNot(notCondition));
      continue;
    }

    // Find field metadata
    const fieldMetadata = model.fields.find((f) => f.name === key);

    // Handle dot-notation keys from expanded composite directives (e.g., "address.city")
    if (!fieldMetadata && key.includes('.')) {
      const resolvedField = resolveDotNotationField(key, model);
      if (resolvedField) {
        // Build a direct equality condition using the dot-notation path as the field name
        conditions.push(buildDirectCondition(ctx, key, value, resolvedField, model));
        continue;
      }
    }

    if (!fieldMetadata) {
      // Skip unknown fields
      continue;
    }

    // A forward to-one relation compared to null means no related record: (userId.id = NONE). Only an
    // array foreign key still compares the stored key.
    if (fieldMetadata.type === 'relation' && value === null) {
      const noRecord = buildForwardNoRecord(fieldMetadata);
      if (noRecord) {
        conditions.push(noRecord);
        continue;
      }

      const fieldRef = fieldMetadata.relationInfo?.fieldRef;
      if (fieldRef) {
        // Find the underlying record field and use it
        const recordField = model.fields.find((f) => f.name === fieldRef);
        if (recordField) {
          conditions.push(buildDirectCondition(ctx, fieldRef, null, recordField, model));
          continue;
        }
      }
      // A reverse relation has no column to compare to null. Dropping the key would widen the filter,
      // so fail closed; the validator refuses it first with a pointer to isEmpty.
      if (!fieldMetadata.relationInfo?.isReverse) continue;
      throw new CerialValidationError(
        `Invalid where clause: '${escapeControl(key)}' is a reverse relation on ${model.name} and cannot be compared to null; use { ${key}: { isEmpty: true } }`,
        { model: model.name, field: key, operation: 'where' },
      );
    }

    // Handle nested relation conditions (e.g., profile: { bio: { contains: 'x' } })
    if (registry && isNestedRelationCondition(fieldMetadata, value)) {
      const nestedCondition = buildNestedCondition(ctx, fieldMetadata, value, model, registry);
      if (nestedCondition.text) {
        conditions.push(nestedCondition);
      }
      continue;
    }

    // Handle object field conditions (e.g., address: { city: 'NYC' })
    if (fieldMetadata.type === 'object' && fieldMetadata.objectInfo && isObject(value)) {
      if (fieldMetadata.isArray) {
        // Array of objects: { some: ..., every: ..., none: ... }
        const objCondition = buildArrayObjectCondition(
          ctx,
          key,
          value as Record<string, unknown>,
          fieldMetadata.objectInfo,
        );
        if (objCondition.text) conditions.push(objCondition);
      } else {
        // Single/optional object: dot notation
        const objCondition = buildObjectCondition(ctx, key, value as Record<string, unknown>, fieldMetadata.objectInfo);
        if (objCondition.text) conditions.push(objCondition);
      }
      continue;
    }

    // Handle tuple field conditions (e.g., location: { lat: { gt: 1.0 }, 0: { gt: 1.0 } })
    if (fieldMetadata.type === 'tuple' && fieldMetadata.tupleInfo && isObject(value)) {
      if (fieldMetadata.isArray) {
        // Array of tuples: { some: ..., every: ..., none: ... }
        const tupCondition = buildArrayTupleCondition(
          ctx,
          key,
          value as Record<string, unknown>,
          fieldMetadata.tupleInfo,
        );
        if (tupCondition.text) conditions.push(tupCondition);
      } else {
        // Single/optional tuple: index access
        const tupCondition = buildTupleCondition(ctx, key, value as Record<string, unknown>, fieldMetadata.tupleInfo);
        if (tupCondition.text) conditions.push(tupCondition);
      }
      continue;
    }

    // Handle operator object { eq: 5, gt: 3 }
    if (isOperatorShape(value, fieldMetadata)) {
      conditions.push(buildFieldCondition(ctx, key, value as Record<string, unknown>, fieldMetadata, model));
      continue;
    }

    // Handle direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, key, value, fieldMetadata, model));
  }

  if (conditions.length === 0) {
    return { text: '', vars: {} };
  }

  if (conditions.length === 1) {
    return conditions[0]!;
  }

  // Multiple field conditions = AND them together. A constant false folds the lot, as in handleAnd.
  if (conditions.some((c) => c.text === 'false')) return { text: 'false', vars: {} };

  return joinFragments(conditions, ' AND ');
}
