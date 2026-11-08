/**
 * Condition builder - builds WHERE clause conditions
 */

import type {
  FieldMetadata,
  ModelMetadata,
  ModelRegistry,
  ObjectFieldMetadata,
  TupleFieldMetadata,
  WhereClause,
} from '../../types';
import { quoteSubKey } from '../../utils/string-utils';
import { isObject } from '../../utils/type-utils';
import { CerialValidationError } from '../../errors';
import { escapeControl } from '../../utils/safe-text';
import { joinFragments, wrapParens } from '../compile/fragment';
import { compileFragment, isSqlFragment } from '../compile/sql-fragment';
import type { QueryFragment } from '../compile/types';
import type { FilterCompileContext } from '../compile/var-allocator';
import { expandCompositeKeys } from './composite-key';
import { handleAnd, handleNot, handleOr } from './logical-operators';
import { buildForwardNoRecord, buildNestedCondition, isNestedRelationCondition } from './nested-condition-builder';
import { prepareOperand, type OperandIssue } from './operand';
import { getOperatorHandler, isRegisteredOperator } from './registry';
import { asStoredArray } from './set-operand';

/** The refusal a builder throws when an operand fails the checks the where validator makes first */
function operandError(field: string, issue: OperandIssue): CerialValidationError {
  return new CerialValidationError(`Invalid where clause: ${issue.message}`, { field, operation: 'where' });
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

    const prepared = prepareOperand(fieldMetadata, op, value, model, field, field);
    if (prepared.issues) throw operandError(field, prepared.issues[0]!);
    conditions.push(handler(ctx, field, prepared.value, fieldMetadata));
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
  const prepared = prepareOperand(fieldMetadata, 'eq', value, model, field, field);
  if (prepared.issues) throw operandError(field, prepared.issues[0]!);

  return handler(ctx, field, prepared.value, fieldMetadata);
}

/**
 * Check if a value is an operator object. Only a plain object can be one: a class instance (an SDK Uuid,
 * Duration or Decimal, a Date, a Cerial wrapper) is a value, whatever keys it carries.
 */
export function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
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

const NO_MODEL: ModelMetadata = { name: '', tableName: '', fields: [] };

/** An undeclared key of a @flexible object holds whatever was written, so it is compared as an any field */
function flexibleSubField(name: string): FieldMetadata {
  return { name, type: 'any', isId: false, isUnique: false, isRequired: false };
}

/** Build conditions for a single/optional object field using dot notation */
export function buildObjectCondition(
  ctx: FilterCompileContext,
  fieldPath: string,
  whereValue: Record<string, unknown>,
  objectInfo: ObjectFieldMetadata,
  model: ModelMetadata = NO_MODEL,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    // Handle logical operators within object where
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) =>
        buildObjectCondition(ctx, fieldPath, w as Record<string, unknown>, objectInfo, model),
      );
      conditions.push(handleAnd(andConditions));
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) =>
        buildObjectCondition(ctx, fieldPath, w as Record<string, unknown>, objectInfo, model),
      );
      conditions.push(handleOr(orConditions));
      continue;
    }
    if (key === 'NOT' && isObject(value)) {
      const notCondition = buildObjectCondition(ctx, fieldPath, value as Record<string, unknown>, objectInfo, model);
      conditions.push(handleNot(notCondition));
      continue;
    }

    // Find sub-field metadata
    const subField = objectInfo.fields.find((f) => f.name === key);

    const subPath = `${fieldPath}.${subField ? key : quoteSubKey(key)}`;

    // Unknown field (not in metadata) — pass through for @flexible objects, held untyped like create keeps it
    if (!subField) {
      const flexible = flexibleSubField(key);
      conditions.push(
        isOperatorObject(value)
          ? buildFieldCondition(ctx, subPath, value, flexible, model)
          : buildDirectCondition(ctx, subPath, value, flexible, model),
      );
      continue;
    }

    // Nested object sub-field
    if (subField.type === 'object' && subField.objectInfo && isObject(value)) {
      if (subField.isArray) {
        // Array of nested objects: some/every/none
        conditions.push(
          buildArrayObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo, model),
        );
      } else {
        // Single nested object: recursive dot notation
        conditions.push(
          buildObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo, model),
        );
      }
      continue;
    }

    // Tuple sub-field: element conditions by name or index
    if (subField.type === 'tuple' && subField.tupleInfo && isObject(value)) {
      conditions.push(
        (subField.isArray ? buildArrayTupleCondition : buildTupleCondition)(
          ctx,
          subPath,
          value as Record<string, unknown>,
          subField.tupleInfo,
          model,
        ),
      );
      continue;
    }

    // Primitive sub-field with operators
    if (isOperatorShape(value, subField)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, asStoredArray(subField), model),
      );
      continue;
    }

    // Direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, subPath, value, asStoredArray(subField), model));
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
  model: ModelMetadata = NO_MODEL,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [quantifier, subWhere] of Object.entries(whereValue)) {
    if (!isObject(subWhere)) continue;

    // Build inner conditions using closure variable $v
    const innerCondition = buildObjectConditionForClosure(
      ctx,
      '$v',
      subWhere as Record<string, unknown>,
      objectInfo,
      model,
    );
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
  model: ModelMetadata,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [key, value] of Object.entries(whereValue)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' && Array.isArray(value)) {
      const andConditions = value.map((w) =>
        buildObjectConditionForClosure(ctx, closureVar, w as Record<string, unknown>, objectInfo, model),
      );
      conditions.push(handleAnd(andConditions));
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      const orConditions = value.map((w) =>
        buildObjectConditionForClosure(ctx, closureVar, w as Record<string, unknown>, objectInfo, model),
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
        model,
      );
      conditions.push(handleNot(notCondition));
      continue;
    }

    const subField = objectInfo.fields.find((f) => f.name === key);

    const subPath = `${closureVar}.${subField ? key : quoteSubKey(key)}`;

    // Unknown field (not in metadata) — pass through for @flexible objects, held untyped like create keeps it
    if (!subField) {
      const flexible = flexibleSubField(key);
      conditions.push(
        isOperatorObject(value)
          ? buildFieldCondition(ctx, subPath, value, flexible, model)
          : buildDirectCondition(ctx, subPath, value, flexible, model),
      );
      continue;
    }

    // Nested object
    if (subField.type === 'object' && subField.objectInfo && isObject(value)) {
      if (subField.isArray) {
        conditions.push(
          buildArrayObjectCondition(ctx, subPath, value as Record<string, unknown>, subField.objectInfo, model),
        );
      } else {
        conditions.push(
          buildObjectConditionForClosure(ctx, subPath, value as Record<string, unknown>, subField.objectInfo, model),
        );
      }
      continue;
    }

    // Tuple sub-field: element conditions by name or index
    if (subField.type === 'tuple' && subField.tupleInfo && isObject(value)) {
      conditions.push(
        (subField.isArray ? buildArrayTupleCondition : buildTupleCondition)(
          ctx,
          subPath,
          value as Record<string, unknown>,
          subField.tupleInfo,
          model,
        ),
      );
      continue;
    }

    if (isOperatorShape(value, subField)) {
      conditions.push(
        buildFieldCondition(ctx, subPath, value as Record<string, unknown>, asStoredArray(subField), model),
      );
      continue;
    }

    conditions.push(buildDirectCondition(ctx, subPath, value, asStoredArray(subField), model));
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
        isNullable: namedElement.isNullable,
        objectInfo: namedElement.objectInfo,
        tupleInfo: namedElement.tupleInfo,
        literalInfo: namedElement.literalInfo,
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
          isNullable: element.isNullable,
          objectInfo: element.objectInfo,
          tupleInfo: element.tupleInfo,
          literalInfo: element.literalInfo,
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
  model: ModelMetadata = NO_MODEL,
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
      conditions.push(
        buildObjectCondition(ctx, subPath, value as Record<string, unknown>, syntheticField.objectInfo, model),
      );
      continue;
    }

    // Nested tuple element
    if (syntheticField.type === 'tuple' && syntheticField.tupleInfo && isObject(value)) {
      conditions.push(
        buildTupleCondition(ctx, subPath, value as Record<string, unknown>, syntheticField.tupleInfo, model),
      );
      continue;
    }

    // Operator object
    if (isOperatorShape(value, syntheticField)) {
      conditions.push(buildFieldCondition(ctx, subPath, value as Record<string, unknown>, syntheticField, model));
      continue;
    }

    // Direct value (shorthand for eq)
    conditions.push(buildDirectCondition(ctx, subPath, value, syntheticField, model));
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
  model: ModelMetadata = NO_MODEL,
): QueryFragment {
  const conditions: QueryFragment[] = [];

  for (const [quantifier, subWhere] of Object.entries(whereValue)) {
    if (!isObject(subWhere)) continue;

    // Build inner conditions using closure variable $v
    const innerCondition = buildTupleCondition(ctx, '$v', subWhere as Record<string, unknown>, tupleInfo, model);
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
          model,
        );
        if (objCondition.text) conditions.push(objCondition);
      } else {
        // Single/optional object: dot notation
        const objCondition = buildObjectCondition(
          ctx,
          key,
          value as Record<string, unknown>,
          fieldMetadata.objectInfo,
          model,
        );
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
          model,
        );
        if (tupCondition.text) conditions.push(tupCondition);
      } else {
        // Single/optional tuple: index access
        const tupCondition = buildTupleCondition(
          ctx,
          key,
          value as Record<string, unknown>,
          fieldMetadata.tupleInfo,
          model,
        );
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
